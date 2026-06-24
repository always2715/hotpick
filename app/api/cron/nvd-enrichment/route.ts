import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { collectNvdDetailEnrichment } from "@/lib/nvd-enrichment";
import { isNvdConfigured } from "@/lib/nvd-cve";
import { isSupabaseAdminConfigured } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseBatchSize(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function handleRequest(request: NextRequest) {
  const authResult = authorizeCronRequest(request);
  if (authResult === "missing-secret") {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 500 });
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

  const batchSize = parseBatchSize(request.nextUrl.searchParams.get("batch"));
  const resetCursor = request.nextUrl.searchParams.get("resetCursor") === "1";

  try {
    const result = await collectNvdDetailEnrichment({ batchSize, resetCursor });
    if (result.enrichedCount > 0) {
      revalidatePath("/");
      revalidatePath("/cve");
      revalidatePath("/search");
      revalidatePath("/popular");
      for (const cveId of result.enrichedIds) revalidatePath(`/cve/${cveId}`);
    }
    return NextResponse.json({
      ok: true,
      partial: result.partialCount > 0 || result.failedCount > 0 || result.missingCount > 0,
      message: result.partialCount > 0 || result.failedCount > 0 || result.missingCount > 0
        ? "CISA-only CVE NVD detail enrichment completed with partial results."
        : "CISA-only CVE NVD detail enrichment completed.",
      result,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown NVD detail enrichment error";
    console.error("[SECUFOCUS] NVD detail enrichment failed", detail);
    return NextResponse.json(
      { ok: false, error: "NVD detail enrichment failed.", detail },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
