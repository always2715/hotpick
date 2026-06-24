import {
  chooseNvdEnrichmentBatch,
  mergeNvdDetail,
  type NvdEnrichmentRow as ExistingVulnerabilityRow,
} from "@/lib/nvd-enrichment-normalize";
import { fetchNvdCvesByIds, type NvdUpsertRow } from "@/lib/nvd-cve";
import {
  getSupabaseCloudflareRayId,
  isSupabaseCloudflareBlockError,
  supabaseAdminPatch,
  supabaseAdminSelect,
  supabaseAdminUpsert,
} from "@/lib/supabase-admin";

const STATE_KEY = "nvd_detail_enrichment";
const DB_PAGE_SIZE = 1_000;
const DB_ID_CHUNK_SIZE = 250;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DETAIL_REQUEST_TIMEOUT_MS = 45_000;
const MAX_NO_PROGRESS_ROUNDS = 10;
const MAX_ERROR_SAMPLES = 8;
const MAX_WAF_SAMPLES = 20;

const VULNERABILITY_COLUMNS = [
  "cve_id",
  "title",
  "summary",
  "description_ko",
  "severity",
  "cvss_score",
  "cvss_vector",
  "epss_score",
  "epss_percentile",
  "is_kev",
  "kev_date_added",
  "vendor",
  "product",
  "affected_versions",
  "fixed_versions",
  "cwe_ids",
  "references_json",
  "official_url",
  "published_at",
  "modified_at",
  "is_published",
  "is_featured",
  "is_sample",
].join(",");

type EnrichmentPatchField =
  | "published_at"
  | "modified_at"
  | "severity"
  | "cvss_score"
  | "cvss_vector"
  | "cwe_ids"
  | "official_url"
  | "is_published"
  | "is_featured"
  | "vendor"
  | "product"
  | "affected_versions"
  | "fixed_versions"
  | "title"
  | "summary"
  | "description_ko"
  | "references_json";

const OPTIONAL_PATCH_GROUPS: EnrichmentPatchField[][] = [
  [
    "modified_at",
    "severity",
    "cvss_score",
    "cvss_vector",
    "cwe_ids",
    "official_url",
    "is_published",
    "is_featured",
  ],
  ["vendor", "product", "affected_versions", "fixed_versions"],
  ["title", "summary", "description_ko"],
  ["references_json"],
];

type WafFallbackSample = {
  cveId: string;
  completed: boolean;
  blockedFields: string[];
  rayIds: string[];
  error?: string;
};

type EnrichmentState = {
  lastStartedAt?: string;
  lastCompletedAt?: string;
  cursorCveId?: string | null;
  cycleCount?: number;
  totalCandidates?: number;
  lastAttempted?: number;
  lastEnriched?: number;
  lastPartial?: number;
  lastMissing?: number;
  lastFailed?: number;
  lastRemaining?: number;
  lastWafFallback?: number;
  totalWafFallback?: number;
  totalWafPartial?: number;
  noProgressRounds?: number;
  lastErrorSamples?: Array<{ cveId: string; error: string }>;
  lastWafSamples?: WafFallbackSample[];
  lastError?: string | null;
};

type SiteSettingRow = { setting_value?: EnrichmentState };

type PreparedRow = { cveId: string; row: NvdUpsertRow };

type PersistenceResult = {
  enrichedIds: string[];
  failedIds: string[];
  partialCount: number;
  wafFallbackCount: number;
  wafSamples: WafFallbackSample[];
  errorSamples: Array<{ cveId: string; error: string }>;
};

export type NvdDetailEnrichmentOptions = {
  batchSize?: number;
  resetCursor?: boolean;
};

export type NvdDetailEnrichmentResult = {
  startedAt: string;
  finishedAt: string;
  cursorBefore: string | null;
  cursorAfter: string | null;
  totalCandidatesBefore: number;
  selectedCount: number;
  attemptedCount: number;
  enrichedCount: number;
  partialCount: number;
  wafFallbackCount: number;
  missingCount: number;
  failedCount: number;
  remainingCount: number;
  wrapped: boolean;
  cycleComplete: boolean;
  noProgressRounds: number;
  stalled: boolean;
  budgetStopped: boolean;
  enrichedIds: string[];
  wafSamples: WafFallbackSample[];
  errorSamples: Array<{ cveId: string; error: string }>;
};

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 3)).trimEnd()}...`;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function addUnique(values: string[], value: string | null): void {
  if (value && !values.includes(value)) values.push(value);
}

function patchValues(
  row: NvdUpsertRow,
  fields: EnrichmentPatchField[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) values[field] = row[field];
  return values;
}

async function readState(): Promise<EnrichmentState> {
  const rows = await supabaseAdminSelect<SiteSettingRow[]>(
    `site_settings?select=setting_value&setting_key=eq.${STATE_KEY}&limit=1`,
  );
  return rows[0]?.setting_value ?? {};
}

async function saveState(state: EnrichmentState): Promise<void> {
  await supabaseAdminUpsert(
    "site_settings",
    [{
      setting_key: STATE_KEY,
      setting_value: state,
      is_public: false,
      description: "CISA-only CVE NVD detail enrichment state",
    }],
    "setting_key",
    { returnRepresentation: false },
  );
}

async function listCandidateIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < 20_000; offset += DB_PAGE_SIZE) {
    const rows = await supabaseAdminSelect<Array<{ cve_id: string }>>(
      `vulnerabilities?select=cve_id&is_kev=eq.true&published_at=is.null&is_sample=eq.false&order=cve_id.asc&limit=${DB_PAGE_SIZE}&offset=${offset}`,
    );
    ids.push(...rows.map((row) => row.cve_id.trim().toUpperCase()));
    if (rows.length < DB_PAGE_SIZE) break;
  }
  return ids
    .filter((value) => /^CVE-\d{4}-\d{4,19}$/.test(value))
    .filter((value, index, all) => all.indexOf(value) === index);
}

async function selectRowsByIds(ids: string[]): Promise<Map<string, ExistingVulnerabilityRow>> {
  const rowsById = new Map<string, ExistingVulnerabilityRow>();
  for (const group of chunk(ids, DB_ID_CHUNK_SIZE)) {
    if (!group.length) continue;
    const rows = await supabaseAdminSelect<ExistingVulnerabilityRow[]>(
      `vulnerabilities?select=${VULNERABILITY_COLUMNS}&cve_id=in.(${group.join(",")})`,
    );
    for (const row of rows) rowsById.set(row.cve_id.toUpperCase(), row);
  }
  return rowsById;
}

async function patchFieldGroupWithIsolation(
  cveId: string,
  row: NvdUpsertRow,
  fields: EnrichmentPatchField[],
  blockedFields: string[],
  rayIds: string[],
): Promise<void> {
  if (!fields.length) return;

  try {
    await supabaseAdminPatch(
      "vulnerabilities",
      "cve_id",
      cveId,
      patchValues(row, fields),
      { returnRepresentation: false },
    );
  } catch (error) {
    if (!isSupabaseCloudflareBlockError(error)) throw error;
    addUnique(rayIds, getSupabaseCloudflareRayId(error));

    if (fields.length === 1) {
      addUnique(blockedFields, fields[0]);
      return;
    }

    const middle = Math.ceil(fields.length / 2);
    await patchFieldGroupWithIsolation(
      cveId,
      row,
      fields.slice(0, middle),
      blockedFields,
      rayIds,
    );
    await patchFieldGroupWithIsolation(
      cveId,
      row,
      fields.slice(middle),
      blockedFields,
      rayIds,
    );
  }
}

async function persistRowWithWafFallback(
  prepared: PreparedRow,
  initialError: unknown,
): Promise<{ completed: boolean; partial: boolean; sample: WafFallbackSample }> {
  const blockedFields: string[] = [];
  const rayIds: string[] = [];
  addUnique(rayIds, getSupabaseCloudflareRayId(initialError));

  if (!prepared.row.published_at) {
    return {
      completed: false,
      partial: false,
      sample: {
        cveId: prepared.cveId,
        completed: false,
        blockedFields: ["published_at"],
        rayIds,
        error: "NVD row did not contain published_at; candidate cannot be completed.",
      },
    };
  }

  try {
    await supabaseAdminPatch(
      "vulnerabilities",
      "cve_id",
      prepared.cveId,
      { published_at: prepared.row.published_at },
      { returnRepresentation: false },
    );
  } catch (error) {
    if (isSupabaseCloudflareBlockError(error)) {
      addUnique(rayIds, getSupabaseCloudflareRayId(error));
      blockedFields.push("published_at");
      return {
        completed: false,
        partial: false,
        sample: {
          cveId: prepared.cveId,
          completed: false,
          blockedFields,
          rayIds,
          error: "Cloudflare also blocked the minimal published_at patch.",
        },
      };
    }
    throw error;
  }

  let optionalError: string | undefined;
  for (const fields of OPTIONAL_PATCH_GROUPS) {
    try {
      await patchFieldGroupWithIsolation(
        prepared.cveId,
        prepared.row,
        fields,
        blockedFields,
        rayIds,
      );
    } catch (error) {
      optionalError = truncate(error instanceof Error ? error.message : String(error), 300);
      break;
    }
  }

  return {
    completed: true,
    partial: blockedFields.length > 0 || Boolean(optionalError),
    sample: {
      cveId: prepared.cveId,
      completed: true,
      blockedFields,
      rayIds,
      ...(optionalError ? { error: optionalError } : {}),
    },
  };
}

async function persistPreparedRows(preparedRows: PreparedRow[]): Promise<PersistenceResult> {
  const result: PersistenceResult = {
    enrichedIds: [],
    failedIds: [],
    partialCount: 0,
    wafFallbackCount: 0,
    wafSamples: [],
    errorSamples: [],
  };
  if (!preparedRows.length) return result;

  let bulkWafError: unknown = null;
  try {
    await supabaseAdminUpsert(
      "vulnerabilities",
      preparedRows.map((prepared) => prepared.row),
      "cve_id",
      { returnRepresentation: false },
    );
    result.enrichedIds.push(...preparedRows.map((prepared) => prepared.cveId));
    return result;
  } catch (error) {
    if (!isSupabaseCloudflareBlockError(error)) throw error;
    bulkWafError = error;
  }

  for (const prepared of preparedRows) {
    let rowError: unknown = preparedRows.length === 1 ? bulkWafError : null;

    if (preparedRows.length > 1) {
      try {
        await supabaseAdminUpsert("vulnerabilities", [prepared.row], "cve_id", {
          returnRepresentation: false,
        });
        result.enrichedIds.push(prepared.cveId);
        continue;
      } catch (error) {
        if (!isSupabaseCloudflareBlockError(error)) {
          result.failedIds.push(prepared.cveId);
          if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
            result.errorSamples.push({
              cveId: prepared.cveId,
              error: truncate(error instanceof Error ? error.message : String(error), 300),
            });
          }
          continue;
        }
        rowError = error;
      }
    }

    result.wafFallbackCount += 1;
    try {
      const fallback = await persistRowWithWafFallback(prepared, rowError);
      if (result.wafSamples.length < MAX_WAF_SAMPLES) result.wafSamples.push(fallback.sample);

      if (fallback.completed) {
        result.enrichedIds.push(prepared.cveId);
        if (fallback.partial) {
          result.partialCount += 1;
          if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
            const blocked = fallback.sample.blockedFields.length
              ? ` Blocked fields: ${fallback.sample.blockedFields.join(", ")}.`
              : "";
            const detail = fallback.sample.error ? ` ${fallback.sample.error}` : "";
            result.errorSamples.push({
              cveId: prepared.cveId,
              error: `Saved with Cloudflare-safe field fallback.${blocked}${detail}`.trim(),
            });
          }
        }
      } else {
        result.failedIds.push(prepared.cveId);
        if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
          result.errorSamples.push({
            cveId: prepared.cveId,
            error: fallback.sample.error ?? "Cloudflare-safe field fallback did not complete.",
          });
        }
      }
    } catch (error) {
      result.failedIds.push(prepared.cveId);
      if (result.errorSamples.length < MAX_ERROR_SAMPLES) {
        result.errorSamples.push({
          cveId: prepared.cveId,
          error: truncate(error instanceof Error ? error.message : String(error), 300),
        });
      }
    }
  }

  return result;
}

export async function collectNvdDetailEnrichment(
  options: NvdDetailEnrichmentOptions = {},
): Promise<NvdDetailEnrichmentResult> {
  const startedAt = new Date().toISOString();
  const previous = await readState();
  const cursorBefore = options.resetCursor ? null : previous.cursorCveId ?? null;
  const batchSize = Math.max(
    1,
    Math.min(MAX_BATCH_SIZE, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE)),
  );

  await saveState({ ...previous, lastStartedAt: startedAt, lastError: null });

  try {
    const candidateIds = await listCandidateIds();
    const selection = chooseNvdEnrichmentBatch(candidateIds, cursorBefore, batchSize);
    const rowsById = await selectRowsByIds(selection.selected);
    const preparedRows: PreparedRow[] = [];
    const attemptedIds = [...selection.selected];
    const errorSamples: Array<{ cveId: string; error: string }> = [];
    let missingCount = 0;
    let failedCount = 0;
    const budgetStopped = false;

    if (selection.selected.length) {
      try {
        const batchResult = await fetchNvdCvesByIds(selection.selected, {
          timeoutMs: DETAIL_REQUEST_TIMEOUT_MS,
          maxAttempts: 1,
          retryDelayMs: 0,
        });
        const nvdRowsById = new Map(
          batchResult.rows.map((row) => [row.cve_id.toUpperCase(), row]),
        );

        for (const cveId of selection.selected) {
          const existing = rowsById.get(cveId);
          if (!existing) {
            failedCount += 1;
            if (errorSamples.length < MAX_ERROR_SAMPLES) {
              errorSamples.push({ cveId, error: "Database row was not found." });
            }
            continue;
          }

          const nvd = nvdRowsById.get(cveId);
          if (!nvd) {
            missingCount += 1;
            if (errorSamples.length < MAX_ERROR_SAMPLES) {
              errorSamples.push({ cveId, error: "NVD did not return this CVE in the batch response." });
            }
            continue;
          }

          preparedRows.push({
            cveId,
            row: mergeNvdDetail(existing, nvd) as NvdUpsertRow,
          });
        }
      } catch (error) {
        failedCount += selection.selected.length;
        const message = truncate(error instanceof Error ? error.message : String(error), 300);
        for (const cveId of selection.selected.slice(0, MAX_ERROR_SAMPLES)) {
          errorSamples.push({ cveId, error: message });
        }
      }
    }

    const persistence = await persistPreparedRows(preparedRows);
    failedCount += persistence.failedIds.length;
    for (const sample of persistence.errorSamples) {
      if (errorSamples.length >= MAX_ERROR_SAMPLES) break;
      errorSamples.push(sample);
    }

    const remainingCount = (await listCandidateIds()).length;
    const cursorAfter = attemptedIds.at(-1) ?? cursorBefore;
    const noProgressRounds = persistence.enrichedIds.length > 0
      ? 0
      : Number(previous.noProgressRounds ?? 0) + (selection.selected.length ? 1 : 0);
    const stalled = remainingCount > 0 && noProgressRounds >= MAX_NO_PROGRESS_ROUNDS;
    const finishedAt = new Date().toISOString();

    const result: NvdDetailEnrichmentResult = {
      startedAt,
      finishedAt,
      cursorBefore,
      cursorAfter,
      totalCandidatesBefore: candidateIds.length,
      selectedCount: selection.selected.length,
      attemptedCount: attemptedIds.length,
      enrichedCount: persistence.enrichedIds.length,
      partialCount: persistence.partialCount,
      wafFallbackCount: persistence.wafFallbackCount,
      missingCount,
      failedCount,
      remainingCount,
      wrapped: selection.wrapped,
      cycleComplete: remainingCount === 0,
      noProgressRounds,
      stalled,
      budgetStopped,
      enrichedIds: persistence.enrichedIds,
      wafSamples: persistence.wafSamples,
      errorSamples,
    };

    await saveState({
      ...previous,
      lastStartedAt: startedAt,
      lastCompletedAt: finishedAt,
      cursorCveId: remainingCount === 0 ? null : cursorAfter,
      cycleCount: Number(previous.cycleCount ?? 0) + (!budgetStopped && selection.cycleComplete ? 1 : 0),
      totalCandidates: candidateIds.length,
      lastAttempted: result.attemptedCount,
      lastEnriched: result.enrichedCount,
      lastPartial: result.partialCount,
      lastMissing: result.missingCount,
      lastFailed: result.failedCount,
      lastRemaining: result.remainingCount,
      lastWafFallback: result.wafFallbackCount,
      totalWafFallback: Number(previous.totalWafFallback ?? 0) + result.wafFallbackCount,
      totalWafPartial: Number(previous.totalWafPartial ?? 0) + result.partialCount,
      noProgressRounds,
      lastErrorSamples: errorSamples,
      lastWafSamples: persistence.wafSamples,
      lastError: null,
    });

    return result;
  } catch (error) {
    const message = truncate(
      error instanceof Error ? error.message : "Unknown NVD detail enrichment error",
      500,
    );
    try {
      await saveState({
        ...previous,
        lastStartedAt: startedAt,
        lastCompletedAt: new Date().toISOString(),
        lastError: message,
      });
    } catch (stateError) {
      console.error(
        "[SECUFOCUS] Failed to save NVD enrichment error state",
        stateError instanceof Error ? stateError.message : stateError,
      );
    }
    throw error;
  }
}
