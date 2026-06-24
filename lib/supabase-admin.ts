const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const MAX_ERROR_DETAIL_LENGTH = 1_200;

export type SupabaseAdminOperation = "select" | "upsert" | "patch";

function truncate(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, Math.max(0, length - 3)).trimEnd()}...`;
}

function cloudflareRayId(detail: string): string | null {
  return detail.match(/Cloudflare Ray ID:\s*(?:<[^>]+>)*\s*([a-z0-9]+)/i)?.[1] ?? null;
}

function looksLikeCloudflareBlock(status: number, detail: string): boolean {
  if (status !== 403) return false;
  return /cloudflare|sorry, you have been blocked|attention required/i.test(detail);
}

function formatHttpErrorMessage(
  operation: SupabaseAdminOperation,
  table: string | null,
  status: number,
  detail: string,
): string {
  const target = table ? ` (${table})` : "";
  if (looksLikeCloudflareBlock(status, detail)) {
    const rayId = cloudflareRayId(detail);
    return `Supabase admin ${operation} failed${target}: ${status} Cloudflare WAF blocked the request${rayId ? ` (Ray ID: ${rayId})` : ""}.`;
  }
  return `Supabase admin ${operation} failed${target}: ${status} ${truncate(detail, MAX_ERROR_DETAIL_LENGTH)}`;
}

export class SupabaseAdminHttpError extends Error {
  readonly operation: SupabaseAdminOperation;
  readonly table: string | null;
  readonly status: number;
  readonly detail: string;
  readonly cloudflareBlocked: boolean;
  readonly cloudflareRayId: string | null;

  constructor(args: {
    operation: SupabaseAdminOperation;
    table?: string | null;
    status: number;
    detail: string;
  }) {
    super(formatHttpErrorMessage(args.operation, args.table ?? null, args.status, args.detail));
    this.name = "SupabaseAdminHttpError";
    this.operation = args.operation;
    this.table = args.table ?? null;
    this.status = args.status;
    this.detail = args.detail;
    this.cloudflareBlocked = looksLikeCloudflareBlock(args.status, args.detail);
    this.cloudflareRayId = cloudflareRayId(args.detail);
  }
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

export function isSupabaseCloudflareBlockError(error: unknown): error is SupabaseAdminHttpError {
  return error instanceof SupabaseAdminHttpError && error.cloudflareBlocked;
}

export function getSupabaseCloudflareRayId(error: unknown): string | null {
  return error instanceof SupabaseAdminHttpError ? error.cloudflareRayId : null;
}

function adminHeaders(extra?: HeadersInit): HeadersInit {
  if (!SUPABASE_SECRET_KEY) return extra ?? {};

  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    Accept: "application/json",
    ...extra,
  };
}

function requireConfiguration(): { url: string; secret: string } {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Supabase admin environment variables are not configured.");
  }
  return { url: SUPABASE_URL, secret: SUPABASE_SECRET_KEY };
}

async function throwHttpError(
  response: Response,
  operation: SupabaseAdminOperation,
  table: string | null,
): Promise<never> {
  const detail = await response.text();
  throw new SupabaseAdminHttpError({ operation, table, status: response.status, detail });
}

export async function supabaseAdminSelect<T>(relativePath: string): Promise<T> {
  const { url } = requireConfiguration();
  const normalizedPath = relativePath.replace(/^\/+/, "");
  const response = await fetch(`${url}/rest/v1/${normalizedPath}`, {
    headers: adminHeaders(),
    cache: "no-store",
  });

  if (!response.ok) await throwHttpError(response, "select", null);
  return (await response.json()) as T;
}

export async function supabaseAdminUpsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  conflictColumn: string,
  options?: { returnRepresentation?: boolean },
): Promise<T[]> {
  const { url } = requireConfiguration();
  if (rows.length === 0) return [];

  const returnRepresentation = options?.returnRepresentation ?? true;
  const response = await fetch(
    `${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictColumn)}`,
    {
      method: "POST",
      headers: adminHeaders({
        "Content-Type": "application/json",
        Prefer: `resolution=merge-duplicates,return=${returnRepresentation ? "representation" : "minimal"}`,
      }),
      body: JSON.stringify(rows),
      cache: "no-store",
    },
  );

  if (!response.ok) await throwHttpError(response, "upsert", table);
  if (!returnRepresentation) return rows;
  return (await response.json()) as T[];
}

export async function supabaseAdminPatch<T extends Record<string, unknown>>(
  table: string,
  matchColumn: string,
  matchValue: string,
  values: T,
  options?: { returnRepresentation?: boolean },
): Promise<T[]> {
  const { url } = requireConfiguration();
  if (Object.keys(values).length === 0) return [];

  const returnRepresentation = options?.returnRepresentation ?? false;
  const filter = `${encodeURIComponent(matchColumn)}=eq.${encodeURIComponent(matchValue)}`;
  const response = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: adminHeaders({
      "Content-Type": "application/json",
      Prefer: `return=${returnRepresentation ? "representation" : "minimal"}`,
    }),
    body: JSON.stringify(values),
    cache: "no-store",
  });

  if (!response.ok) await throwHttpError(response, "patch", table);
  if (!returnRepresentation) return [values];
  return (await response.json()) as T[];
}
