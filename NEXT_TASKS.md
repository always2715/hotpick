# SECUFOCUS NOW — 다음 작업

최종 갱신: 2026-06-24

## P0 — v1.6.3 배포

1. v1.6.2 저장소 루트에 v1.6.3 패치 ZIP 내용물 덮어쓰기
2. GitHub Desktop에서 변경 파일 확인
3. Commit: `v1.6.3 handle Supabase Cloudflare WAF during NVD enrichment`
4. Push origin
5. Vercel Production 배포 `Ready` 확인

## P0 — NVD 상세 백필 재개

```powershell
.\scripts\backfill-nvd-details.ps1 `
  -BaseUrl "https://secufocus-now-web.vercel.app" `
  -Batch 1 `
  -MaxRounds 300 `
  -MaxTransportRetries 5 `
  -RequestTimeoutSec 180
```

정상 판단:

- `Candidates before`가 약 211 또는 그 이하
- 차단 CVE에서는 `WAF fallback : 1` 가능
- `Partial`이 1이어도 `Enriched=1`이고 `Remaining`이 줄면 정상 진행
- 차단 필드는 `Cloudflare-safe fallback samples`에 표시
- 최종 `Remaining=0` 및 완료 문구 확인

## P0 — 완료 검증

- `is_kev=true AND published_at IS NULL AND is_sample=false` 잔여 0건
- CVE 중복 0건
- 기존 CISA KEV 배지, 요구조치, 기한, 랜섬웨어 여부 유지
- FIRST EPSS 점수·백분위·기준일 유지
- CVSS·CWE·공개일·제품/버전 표시 확인
- daily cron에서 NVD enrichment가 전체 수집을 중단시키지 않는지 확인

## P1

- 통합검색 CVE 최대 2,500건 전체 로드 제거 및 서버측 검색 전환
- KISA 검색·정렬·exact count 서버측 전환
- 수집 현황 관리자 UI

새 버전 제작 시 전체 ZIP, 이전 버전 대비 패치 ZIP, 최신 PROJECT_HANDOFF.txt를 함께 제공한다.
