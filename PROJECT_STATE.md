# SECUFOCUS NOW — 현재 프로젝트 상태

최종 갱신: 2026-06-24  
패키지 코드: **v1.6.3**  
이전 패키지 기준: **v1.6.2**  
현재 단계: **Supabase Cloudflare WAF 차단 대응 배포 후 NVD 상세 백필 마무리**

## 확인된 운영 상태

- v1.6.2 NVD `cveIds` 다건 조회 자체는 정상 작동함
- 최초 NVD 상세 보강 후보 1,603건 중 최소 1,392건 보강 완료
- 마지막 확인 잔여 대상은 약 211건이며 실제 현재 값은 배포 후 첫 실행에서 재확인 필요
- `Missing in NVD`는 실행 이력에서 0건
- v1.6.2 batch=1 재실행이 502로 종료됐으나 응답 본문 확인 결과 NVD/Vercel 문제가 아니었음
- 실제 원인은 특정 CVE 전체 행을 Supabase에 upsert할 때 Supabase 앞단 Cloudflare WAF가 HTTP 403으로 차단한 것
- 기존 성공 데이터와 KEV·EPSS·CISA metadata는 DB에 보존돼 있음

## v1.6.3 변경

- Supabase HTTP 오류를 구조화하고 Cloudflare WAF 403 및 Ray ID를 짧게 식별
- 정상 CVE는 기존 bulk upsert 경로 유지
- bulk upsert가 WAF에 차단되면 CVE별 단건 저장으로 차단 행 격리
- 차단 CVE는 `published_at`을 최소 PATCH로 먼저 저장해 백필 후보에서 안전하게 완료 처리
- 나머지 NVD 필드는 그룹별 PATCH 후 차단 그룹을 필드 단위로 재분할
- 차단 필드만 보류하고 CVSS·CWE·공개일 등 저장 가능한 정보는 유지
- PATCH는 지정 필드만 변경하므로 기존 KEV·EPSS·CISA metadata를 제거하지 않음
- `partialCount`, `wafFallbackCount`, `wafSamples`와 누적 상태를 `site_settings` JSON에 기록
- PowerShell이 5xx 응답 본문과 Cloudflare Ray ID를 출력
- 첫 요청 실패 시 `resetCursor=1`이 사라지던 문제 수정
- daily cron도 부분 저장 여부를 partial 상태로 표시
- 신규 DB 스키마·SQL 마이그레이션·환경변수 없음

## 배포 후 필수 확인

1. GitHub/Vercel에 v1.6.3 배포
2. Vercel `Ready` 확인
3. batch=1로 백필 재개
4. 첫 차단 CVE에서 `WAF fallback=1`이 표시되더라도 `Enriched=1`, `Remaining` 감소 확인
5. 마지막 `Remaining=0` 확인
6. Supabase 잔여 SQL, 중복 SQL, CVE 화면과 KEV·EPSS 보존 확인
