import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { collectAllKisaFeeds } from "@/lib/kisa-rss";
import { collectNvdDetailEnrichment } from "@/lib/nvd-enrichment";
import { collectNvdCves, isNvdConfigured } from "@/lib/nvd-cve";
import { isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { collectThreatIntel } from "@/lib/threat-intel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type CollectorResult =
  | { ok: true; partial: boolean; data: unknown }
  | { ok: false; partial: false; error: string; data?: unknown };

async function runKisaCollector(): Promise<CollectorResult> {
  try {
    const data = await collectAllKisaFeeds();
    if (data.successFeeds === 0) {
      return {
        ok: false,
        partial: false,
        error: "All KISA RSS feeds failed.",
        data,
      };
    }
    return { ok: true, partial: data.failedFeeds > 0, data };
  } catch (error) {
    return {
      ok: false,
      partial: false,
      error: error instanceof Error ? error.message : "Unknown KISA collector error",
    };
  }
}

async function runNvdCollector(): Promise<CollectorResult> {
  try {
    return { ok: true, partial: false, data: await collectNvdCves() };
  } catch (error) {
    return {
      ok: false,
      partial: false,
      error: error instanceof Error ? error.message : "Unknown NVD collector error",
    };
  }
}


async function runThreatIntelCollector(): Promise<CollectorResult> {
  try {
    return {
      ok: true,
      partial: false,
      data: await collectThreatIntel({ syncKev: true, epssBatchSize: 300 }),
    };
  } catch (error) {
    return {
      ok: false,
      partial: false,
      error: error instanceof Error ? error.message : "Unknown threat intelligence collector error",
    };
  }
}

async function runNvdEnrichmentCollector(): Promise<CollectorResult> {
  try {
    const data = await collectNvdDetailEnrichment({ batchSize: 10 });
    return {
      ok: true,
      partial: data.partialCount > 0 || data.failedCount > 0 || data.missingCount > 0,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      partial: false,
      error: error instanceof Error ? error.message : "Unknown NVD detail enrichment error",
    };
  }
}

async function handleRequest(request: NextRequest) {
  const authResult = authorizeCronRequest(request);

  if (authResult === "missing-secret") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  if (authResult === "unauthorized") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase admin environment variables are not configured." },
      { status: 500 },
    );
  }

  if (!isNvdConfigured()) {
    return NextResponse.json(
      { ok: false, error: "NVD_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const startedAt = new Date().toISOString();
  const [kisa, nvd] = await Promise.all([runKisaCollector(), runNvdCollector()]);
  const threatIntel = await runThreatIntelCollector();
  const nvdEnrichment = await runNvdEnrichmentCollector();

  if (kisa.ok || nvd.ok || threatIntel.ok || nvdEnrichment.ok) {
    revalidatePath("/");
    revalidatePath("/kisa");
    revalidatePath("/cve");
    revalidatePath("/search");
    revalidatePath("/popular");
  }

  const collectors = [kisa, nvd, threatIntel, nvdEnrichment];
  const successfulCollectors = collectors.filter((result) => result.ok).length;
  const hasPartial = collectors.some((result) => result.partial);
  const status =
    successfulCollectors === 0 ? 502 : successfulCollectors === collectors.length && !hasPartial ? 200 : 207;

  if (!kisa.ok) console.error("[SECUFOCUS] Daily KISA collector failed", kisa.error);
  if (!nvd.ok) console.error("[SECUFOCUS] Daily NVD collector failed", nvd.error);
  if (!threatIntel.ok) console.error("[SECUFOCUS] Daily threat intelligence collector failed", threatIntel.error);
  if (!nvdEnrichment.ok) console.error("[SECUFOCUS] Daily NVD detail enrichment failed", nvdEnrichment.error);

  return NextResponse.json(
    {
      ok: successfulCollectors > 0,
      partial: status === 207,
      message:
        status === 200
          ? "Daily security collection completed."
          : "Daily security collection completed with collector failures or partial results.",
      startedAt,
      finishedAt: new Date().toISOString(),
      collectors: { kisa, nvd, threatIntel, nvdEnrichment },
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
