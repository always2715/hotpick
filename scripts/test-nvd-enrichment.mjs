import assert from "node:assert/strict";

import {
  chooseNvdEnrichmentBatch,
  mergeNvdDetail,
  mergeNvdRefresh,
} from "../lib/nvd-enrichment-normalize.ts";
import {
  getSupabaseCloudflareRayId,
  isSupabaseCloudflareBlockError,
  SupabaseAdminHttpError,
} from "../lib/supabase-admin.ts";

const existing = {
  cve_id: "CVE-2025-12345",
  title: "Vendor Product Example Vulnerability",
  summary: "CISA short description",
  description_ko: null,
  severity: "info",
  cvss_score: null,
  cvss_vector: null,
  epss_score: 0.72,
  epss_percentile: 0.98,
  is_kev: true,
  kev_date_added: "2026-06-20",
  vendor: "Vendor",
  product: "Product",
  affected_versions: null,
  fixed_versions: null,
  cwe_ids: ["CWE-79"],
  references_json: [
    { source: "CISA KEV", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" },
    { source: "FIRST EPSS", url: "https://api.first.org/data/v1/epss", date: "2026-06-24" },
  ],
  official_url: "https://nvd.nist.gov/vuln/detail/CVE-2025-12345",
  published_at: null,
  modified_at: null,
  is_published: true,
  is_featured: true,
  is_sample: false,
};

const nvd = {
  cve_id: "CVE-2025-12345",
  title: "NVD generated title",
  summary: "Detailed NVD description",
  description_ko: null,
  severity: "critical",
  cvss_score: 9.8,
  cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
  epss_score: null,
  epss_percentile: null,
  is_kev: false,
  kev_date_added: null,
  vendor: "NVD Vendor",
  product: "NVD Product",
  affected_versions: "before 2.0",
  fixed_versions: "2.0",
  cwe_ids: ["CWE-79", "CWE-89"],
  references_json: [
    { source: "NVD", url: "https://vendor.example/advisory" },
  ],
  official_url: "https://nvd.nist.gov/vuln/detail/CVE-2025-12345",
  published_at: "2025-01-01T00:00:00.000Z",
  modified_at: "2026-06-23T00:00:00.000Z",
  is_published: true,
  is_featured: true,
  is_sample: false,
};

const merged = mergeNvdDetail(existing, nvd);
assert.equal(merged.title, existing.title);
assert.equal(merged.summary, nvd.summary);
assert.equal(merged.severity, "critical");
assert.equal(merged.cvss_score, 9.8);
assert.equal(merged.epss_score, 0.72);
assert.equal(merged.epss_percentile, 0.98);
assert.equal(merged.is_kev, true);
assert.equal(merged.kev_date_added, "2026-06-20");
assert.equal(merged.vendor, "Vendor");
assert.equal(merged.product, "Product");
assert.equal(merged.affected_versions, "before 2.0");
assert.deepEqual(merged.cwe_ids, ["CWE-79", "CWE-89"]);
assert.equal(merged.references_json.length, 3);
assert.equal(merged.published_at, "2025-01-01T00:00:00.000Z");

const refreshed = mergeNvdRefresh(existing, nvd);
assert.equal(refreshed.title, existing.title);
assert.equal(refreshed.epss_score, 0.72);
assert.equal(refreshed.is_kev, true);
assert.equal(refreshed.kev_date_added, "2026-06-20");
assert.equal(refreshed.references_json.length, 3);
assert.equal(refreshed.is_published, true);
assert.equal(refreshed.is_featured, true);

const ids = ["CVE-2024-0001", "CVE-2024-0002", "CVE-2024-0003", "CVE-2024-0004"];
assert.deepEqual(chooseNvdEnrichmentBatch(ids, null, 2), {
  selected: ids.slice(0, 2),
  wrapped: false,
  cycleComplete: false,
});
assert.deepEqual(chooseNvdEnrichmentBatch(ids, "CVE-2024-0002", 2), {
  selected: ids.slice(2),
  wrapped: false,
  cycleComplete: true,
});
assert.deepEqual(chooseNvdEnrichmentBatch(ids, "CVE-2024-9999", 2), {
  selected: ids.slice(0, 2),
  wrapped: true,
  cycleComplete: true,
});

const wafError = new SupabaseAdminHttpError({
  operation: "upsert",
  table: "vulnerabilities",
  status: 403,
  detail: "<title>Attention Required! | Cloudflare</title> Cloudflare Ray ID: <strong>0123456789abcdef</strong> Sorry, you have been blocked",
});
assert.equal(isSupabaseCloudflareBlockError(wafError), true);
assert.equal(getSupabaseCloudflareRayId(wafError), "0123456789abcdef");
assert.match(wafError.message, /Cloudflare WAF blocked the request/);
assert.doesNotMatch(wafError.message, /<title>/);

const ordinaryError = new SupabaseAdminHttpError({
  operation: "patch",
  table: "vulnerabilities",
  status: 400,
  detail: '{"message":"invalid input"}',
});
assert.equal(isSupabaseCloudflareBlockError(ordinaryError), false);
assert.equal(getSupabaseCloudflareRayId(ordinaryError), null);

console.log("NVD enrichment tests passed.");
