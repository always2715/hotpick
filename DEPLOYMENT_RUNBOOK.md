# SECUFOCUS NOW 배포 실행서

최종 갱신: 2026-06-24 / v1.6.3

## 현재 배포 작업

- 현재 기준 저장소: v1.6.2
- 적용 패치: v1.6.2 → v1.6.3
- 목적: Supabase Cloudflare WAF에 차단되는 NVD 상세 행을 필드별 안전 저장
- DB 마이그레이션: 없음
- 신규 환경변수: 없음

## GitHub Desktop

1. 패치 ZIP 압축 해제
2. 저장소 루트에 전체 덮어쓰기
3. 변경 파일 확인
4. Commit: `v1.6.3 handle Supabase Cloudflare WAF during NVD enrichment`
5. Push origin

## Vercel

1. Production deployment가 시작되는지 확인
2. Build 성공 및 `Ready` 확인
3. 기존 환경변수 유지:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   - SUPABASE_SECRET_KEY
   - CRON_SECRET
   - NVD_API_KEY

## NVD 상세 백필

```powershell
.\scripts\backfill-nvd-details.ps1 `
  -BaseUrl "https://secufocus-now-web.vercel.app" `
  -Batch 1 `
  -MaxRounds 300 `
  -MaxTransportRetries 5 `
  -RequestTimeoutSec 180
```

정상 조건:

- 차단 CVE에서 `WAF fallback=1` 가능
- `Partial=1`이어도 `Enriched=1` 및 `Remaining` 감소
- 최종 `Remaining=0`

## 검증 SQL

```sql
select count(*) as remaining_nvd_enrichment
from public.vulnerabilities
where is_kev = true
  and published_at is null
  and is_sample = false;
```

```sql
select setting_key, setting_value, updated_at
from public.site_settings
where setting_key in (
  'nvd_collector',
  'threat_intel_collector',
  'nvd_detail_enrichment'
);
```

```sql
select cve_id, count(*)
from public.vulnerabilities
where is_sample = false
group by cve_id
having count(*) > 1;
```

## 회귀 확인

```powershell
.\scripts\test-daily-cron.ps1 `
  -BaseUrl "https://secufocus-now-web.vercel.app"
```

- KISA 정상
- NVD 정상 또는 공식 fallback 정상
- threatIntel 정상
- nvdEnrichment 포함
- 기존 성공 데이터 삭제 없음

## 롤백

- GitHub Desktop에서 v1.6.3 커밋 Revert
- Push origin
- Vercel 배포 확인
- DB 데이터는 초기화하지 않음
- v1.6.3이 저장한 정상 상세 데이터도 삭제하지 않음
