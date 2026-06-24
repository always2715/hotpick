# Current Status

- Package code: v1.6.3
- Previous package baseline: v1.6.2
- Current target: deploy Cloudflare-WAF-safe field fallback and complete the remaining NVD detail backfill
- Last known remaining candidates: approximately 211 or fewer
- Confirmed blocker in v1.6.2: Supabase Cloudflare WAF HTTP 403 during vulnerabilities upsert
- Database migration: none
- New environment variables: none
- Required after deploy: run `scripts/backfill-nvd-details.ps1` with batch 1 and verify Remaining=0
