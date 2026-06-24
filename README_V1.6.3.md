# SECUFOCUS NOW v1.6.3

## 목적

v1.6.2 NVD 상세 백필이 특정 CVE의 Supabase upsert 단계에서 Cloudflare WAF HTTP 403으로 차단돼 같은 후보에서 반복 중단되던 문제를 해결한다.

## 핵심 변경

- 정상 CVE: 기존 bulk upsert 유지
- WAF 차단 batch: CVE별 단건 upsert로 문제 행 격리
- 차단 CVE: `published_at` 최소 PATCH를 먼저 저장
- 선택 필드: 그룹별 PATCH 후 차단 그룹을 필드 단위로 재분할
- 차단 필드만 보류하고 나머지 NVD 정보를 저장
- 기존 KEV·EPSS·CISA metadata는 지정 필드 PATCH로 보호
- Cloudflare Ray ID와 차단 필드 진단 출력
- daily cron partial 상태 반영

## DB·환경변수

- 신규 SQL 없음
- 신규 테이블·컬럼 없음
- 신규 환경변수 없음
- 기존 `site_settings.nvd_detail_enrichment` JSON만 확장

## 배포 후 실행

```powershell
.\scripts\backfill-nvd-details.ps1 `
  -BaseUrl "https://secufocus-now-web.vercel.app" `
  -Batch 1 `
  -MaxRounds 300 `
  -MaxTransportRetries 5 `
  -RequestTimeoutSec 180
```

`WAF fallback=1`, `Partial=1`이 표시돼도 `Enriched=1`이고 `Remaining`이 감소하면 차단 필드를 제외한 안전 저장이 정상 작동한 것이다.
