# Changelog

## [v1.6.3] - 2026-06-24

### Fixed
- Identified the v1.6.2 502 as a Supabase Cloudflare WAF 403 during `vulnerabilities` upsert, not an NVD lookup failure
- Prevented one WAF-blocked CVE payload from permanently stopping the remaining NVD detail backfill
- Preserved the first-call `resetCursor=1` flag across PowerShell transport retries

### Changed
- Added structured Supabase HTTP errors with compact Cloudflare block and Ray ID detection
- Kept the existing bulk upsert path for normal CVEs
- Isolated WAF failures per CVE and used field-level PATCH fallback only for blocked rows
- Saved `published_at` first so a successfully fetched CVE can leave the enrichment candidate set
- Recursively split optional field groups and deferred only the exact fields blocked by Cloudflare
- Added `partialCount`, `wafFallbackCount`, `wafSamples`, and cumulative WAF state fields
- Enhanced the PowerShell backfill output with response details and WAF fallback diagnostics
- Marked daily enrichment as partial when fields were deferred or items failed

### Validation
- TypeScript strict typecheck passed
- NVD enrichment and Cloudflare error helper tests passed
- KISA parser/query, CISA KEV/FIRST EPSS, and CVE query tests passed
- Next.js 16.2.0 production build passed; static pages 10/10

### Database
- No schema migration
- No new environment variables

## [v1.6.2] - 2026-06-24

### Changed
- Replaced per-CVE `cveId` requests with NVD `cveIds` batch requests
- Default enrichment batch 25, maximum 100
- One NVD request per serverless invocation with a 45-second timeout
- Adaptive PowerShell batch reduction after full-batch failure
- Six-second delay between successful automated requests
- Daily enrichment batch increased from 2 to 10 using one batch request
- No-progress threshold increased from 3 to 10 rounds

### Validation
- TypeScript typecheck passed
- NVD/KISA/CISA/EPSS/CVE query tests passed
- Next.js production build passed, static pages 10/10

### Database
- No schema migration
- No new environment variables

## [v1.6.1] - 2026-06-24

### Fixed
- NVD detail backfill timeout caused by default batch=20
- Bounded detail requests to 12 seconds and one attempt in the enrichment path
- Added a 45-second invocation budget with safe cursor carry-over
- Added adaptive PowerShell retries that reduce batch to 1 after transport timeout
- Reduced daily enrichment batch from 5 to 2

## [v1.6.0] - 2026-06-24

- CISA KEV로 먼저 등록돼 NVD 상세가 비어 있는 CVE 자동 보강
- `/api/cron/nvd-enrichment` 전용 API 추가
- `scripts/backfill-nvd-details.ps1` ASCII/CRLF 백필 스크립트 추가
- NVD `cveId` 단건 조회, 기본 5건·최대 20건, 요청 간 1.5초 지연
- daily cron에 5건 자동 보강 단계 추가
- 커서 순환과 3회 무진전 감지로 반복 실패 항목 선점 및 무한 반복 방지
- 기존 CISA KEV·FIRST EPSS·요구조치·기한·랜섬웨어 metadata 보존
- 기존 NVD 증분 수집도 upsert 전에 기존 threat-intel metadata 병합
- CVE 일련번호 정규식 최대 19자리 지원
- CVE 화면에 NVD 비보증·비인증 고지 추가
- 신규 DB 마이그레이션·환경변수 없음

## [v1.5.2] - 2026-06-24

- CVE·KISA 목록에 정렬 선택 UI 추가
- 두 화면 기본 정렬을 최신순으로 확정
- CVE 정렬을 서버측 Supabase/PostgREST order로 처리
- CVE 정렬: 최신순, 오래된순, CVSS 높은순, EPSS 높은순, 실제 악용 우선
- KISA 정렬: 최신순, 오래된순, 제목 가나다순, 유형순
- 검색·필터·정렬 변경 시 1페이지 복귀
- 신규 DB 마이그레이션·환경변수·백필 없음

## [v1.5.1] - 2026-06-24

- CVE, KISA, 보안뉴스, 브리핑, 인기 이슈 목록을 페이지당 10건으로 통일
- 모든 목록 하단에 기존 공통 페이지 순번 UI 유지
- 페이지 번호는 최대 10개 단위로 표시하고 `<<`, `<`, `>`, `>>` 이동 유지
- CVE 서버측 `limit/offset` 기본값도 10건으로 변경
- 신규 DB 마이그레이션·환경변수·백필 없음

## [v1.5.0] - 2026-06-24

- CVE 목록 서버측 페이지네이션 API `/api/cve` 추가
- 최초 CVE 전송량을 최대 2,500건에서 15건으로 축소
- 검색·필터·페이지 범위를 Supabase/PostgREST에서 처리
- `Prefer: count=exact`와 `Content-Range` 기반 정확한 전체 건수 계산
- 검색 350ms debounce, 요청 취소, 로딩·오류 UI 추가
- FIRST EPSS `date`를 references_json에 저장
- CVE 목록·상세 EPSS 데이터 기준일 표시
- CVE 쿼리 fixture 및 전체 Next.js 빌드 통과
- 신규 DB 마이그레이션·환경변수 없음

# Changelog

## [v1.4.1] - 2026-06-24

### Changed
- 공통 페이지네이션을 한 번에 최대 10개 페이지 번호만 표시하도록 변경
- `<<`, `<`, `>`, `>>`로 첫 페이지·이전 10페이지·다음 10페이지·마지막 페이지 이동 추가
- 모바일 페이지네이션 줄바꿈과 하단 고정 메뉴 회피 여백 적용
- KISA 참고사이트 상위 3개 기본 노출, 나머지 native details 접기/펼치기 적용
- 별도 참고사이트 목록이 존재할 때 본문 references 섹션 중복 표시 제거

### Validation
- `npm run typecheck` 통과
- `npm run test:kisa-parser` 4/4 통과
- `npm run test:threat-intel-parser` 통과
- `npm run build` 전체 통과

### Database
- No schema migration
- No new environment variables

## [v1.4.0] - 2026-06-24

### Added
- CISA KEV official JSON collector with official cisagov/kev-data fallback
- FIRST EPSS batch collector and rotating backfill state
- `/api/cron/threat-intel`
- CVE priority classification and filters
- CISA required action, due date, ransomware-use and notes display
- ASCII/CRLF threat-intel PowerShell scripts
- CISA catalog count/minimum-size safety validation before KEV reconciliation

### Changed
- Daily cron now returns KISA, NVD and threatIntel collector results
- CVE ordering now prioritizes KEV and EPSS
- CVE list reads now paginate Supabase in 1,000-row chunks and return up to 2,500 ordered items

### Database
- No schema migration
- Existing `references_json`, `is_kev`, `kev_date_added`, `epss_score`, `epss_percentile` used

모든 주요 변경사항을 누적 기록합니다. 과거 항목은 삭제하지 않습니다.

## [Unreleased]

### Planned
- Server-side CVE integration search
- Security news collection improvements

## [v1.3.2] - 2026-06-24

### Fixed
- Windows PowerShell 5.1이 UTF-8 BOM 없는 `backfill-kisa-details.ps1`을 ANSI로 해석해 한글 문자열과 따옴표가 깨지고 `TerminatorExpectedAtEndOfString` ParserError가 발생하던 문제
- 동일 위험이 있던 `test-kisa-cron.ps1` 인코딩 문제

### Changed
- 두 PowerShell 스크립트를 영문 ASCII + CRLF로 재작성
- 백필 스크립트에 strict mode, API 응답 검증, 진행 정체·최대 회차 오류 처리를 추가

### Data
- 신규 테이블·컬럼·SQL 없음
- 신규 환경변수 없음

## [v1.3.1] - 2026-06-24

### Fixed
- v1.3.0 배포 후 기존 KISA 행이 `rss_only`/`failed` 상태로 남아 실제 원문 대신 수집 안내만 표시되던 문제
- 한 번의 KISA 수집에서 상세페이지를 과도하게 요청해 Vercel 실행시간 초과 또는 KISA 측 차단 가능성이 커지던 문제
- 상세 실패 항목이 반복 선점해 아직 시도하지 않은 항목의 수집이 지연될 수 있던 문제

### Added
- `/api/cron/kisa-backfill` 기존 DB 상세 전용 백필 API
- `scripts/backfill-kisa-details.ps1` remaining=0까지 반복하는 백필 스크립트
- KISA 세션 쿠키 준비, 브라우저형 헤더, www/non-www 대체 호스트 재시도

### Changed
- KISA parserVersion을 `1.3.1`로 상향
- 일반 KISA Cron의 상세 요청 예산을 1회 4건으로 제한
- 상세 백필을 1회 4건, 동시 2건으로 처리
- `rss_only` 수집 대기와 실제 `failed` 오류 안내를 분리

### Validation
- `npm run typecheck` 통과
- `npm run test:kisa-parser` 4/4 통과
- Next.js compile, TypeScript, page-data collection 단계 통과
- 최종 정적 페이지 생성은 작업환경 timeout으로 Vercel Ready 확인 필요

### Data
- 신규 테이블·컬럼·SQL 없음
- 신규 환경변수 없음

## [v1.3.0] - 2026-06-24

### Fixed
- 빈 RSS 설명의 `보안공지 원문에서 상세 내용을 확인할 수 있습니다.` 문장이 실제 작성본문처럼 저장되던 문제
- 보안공지·취약점정보·보고서/가이드·경보단계가 동일한 취약점형 상세 화면을 사용하던 문제
- 경보 원문의 `krcert.or.kr` 상세 URL이 허용 대상에서 빠질 수 있던 문제
- RSS 피드 성공과 상세 원문 수집 실패가 명확히 구분되지 않던 문제

### Added
- KISA 네 유형별 parser와 전용 상세 UI
- 취약점 CVE·CVSS·심각도·종류·영향 메타데이터
- 보고서 자료 유형·TLP·대상·목차·첨부 중심 화면
- 경보 정상/관심/주의/경계/심각 5단계, 현재·이전 단계, 변경 방향, 적용 시각
- `partial`, `parseWarnings`, `detailError`, 유형별 metadata
- KISA 유형별 fixture 테스트 4종
- 새 채팅 전체 인수인계 문서 `PROJECT_HANDOFF.txt`

### Changed
- KISA parserVersion을 `1.3.0`으로 올리고 이전 parserVersion 행을 재파싱
- 상세 실패 시 대체 안내를 content로 저장하지 않고 상태 안내로 표시
- 상세 수집 실패 시 기존 성공 데이터를 `stale`로 보존
- 보고서 첨부의 직접 URL을 확인하지 못한 경우 파일명과 KISA 원문 링크를 표시
- KISA Cron 결과에 부분 성공·상세 오류 샘플·경고를 포함

### Validation
- `npm run typecheck` 통과
- `npm run test:kisa-parser` 4/4 통과
- Next.js compile 및 TypeScript 단계 통과
- 로컬 정적 페이지 생성은 실행환경 timeout/EPIPE로 최종 미확인, Vercel Ready 확인 필요

### Data
- 신규 테이블·컬럼·SQL 없음
- 신규 환경변수 없음
- 기존 `kisa_items.raw_data.detail` JSON 확장

## [v1.2.0] - 2026-06-24

### Added
- KISA 원문 상세 HTML 수집 모듈 `lib/kisa-detail.ts`
- 원문 개요·설명·주요내용·영향 대상·해결 방안·대응·문의 섹션 구조화
- KISA 원문 표를 헤더와 행 배열로 보존
- 참고사이트 링크와 PDF/HWP/HWPX 등 첨부자료 추출
- 원문 전체에서 CVE 번호 재추출
- ETag·Last-Modified 조건부 상세 요청
- KISA 수집 결과에 상세 수집·304·재사용·실패 건수 추가

### Changed
- KISA RSS 수집 후 각 원문 상세페이지를 추가 조회해 `kisa_items`를 보강
- KISA 상세페이지가 RSS 문장 분류가 아니라 원문 섹션·표를 우선 표시
- 상세 수집 실패 시 기존 성공 본문을 `stale` 상태로 유지
- 기존 상세가 없고 원문 수집도 실패한 경우에만 RSS 요약 fallback
- KISA 단독 Cron 최대 실행시간을 120초로 조정

### Data
- 신규 DB 컬럼 없이 `raw_data.detail` JSON에 sections/referenceLinks/attachments/etag/lastModified/status 저장
- 기존 KISA 40건은 배포 후 KISA 수동수집 1회로 백필

### Validation
- 원문 파서·KISA 수집 모듈 strict TypeScript 검사 통과
- 보안공지·취약점정보·경보단계·첨부 전용 보고서 샘플 파싱 통과
- 표·CVE·참고사이트·첨부자료 추출 확인
- 전체 Next.js build는 Vercel 배포에서 최종 확인 필요

## [v1.1.0] - 2026-06-24

### Added
- `/kisa/[slug]` 시큐포커스 내부 KISA 상세페이지
- KISA 유형별 핵심 요약·주요 내용·영향 대상·권고 확인·관련 CVE 구성
- KISA 상세 조회수 누적
- 관련 CVE, 취약점 목록, 보안 브리핑 내부 연결
- 상세페이지 하단 KISA 공식 원문 보기 버튼

### Changed
- KISA 목록·홈·통합검색·인기 이슈·오늘의 포커스 링크를 내부 상세페이지로 변경
- 위험도 요약 사이드카드의 위험도 표시를 작은 배지 크기로 조정
- RSS에서 확인되지 않은 제품·버전·조치사항은 추정하지 않고 원문 확인 안내 표시

### Data
- 기존 `kisa_items.content`, `raw_data`, `updated_at` 필드를 웹 데이터 모델에 연결
- DB 스키마 및 환경변수 변경 없음

### Validation
- TypeScript transpile syntax 검사 대상에 신규 KISA 상세페이지 포함
- 전체 npm 설치·Next.js 빌드는 제작 환경의 npm 네트워크 제한으로 Vercel 배포에서 최종 확인 필요

## [v1.0.3] - 2026-06-24

### Added
- fallback 전용 증분 커서(`lastFallbackWindowEndAt`)와 24시간 안전 중첩 구간
- Recent feed ETag/Last-Modified 조건부 요청
- 압축 피드 SHA-256 비교를 통한 동일 feed 재처리 방지
- API 장애 후 6시간 재시도 cooldown
- 수집 결과에 `apiAttempted`, `apiBackoffUntil`, `fallbackWindowStart`, `fallbackWindowEnd`, `fullFeedCount`, `feedNotModified`, `feedHashMatched`, `upsertSkipped` 추가

### Changed
- NVD API 단일 요청 제한시간을 12초에서 25초로 조정
- API 타임아웃 시 같은 실행에서 장시간 재시도하지 않고 즉시 fallback
- fallback 재실행 시 Recent feed 전체가 아니라 마지막 fallback 시점 기준 변경 구간만 정규화
- NVD upsert chunk를 250건에서 400건으로 조정
- 대량 upsert 응답을 `return=minimal`로 변경해 네트워크·메모리 사용량 절감

### Verified
- v1.0.2 실제 수집 성공: 2,157건 수신, 2,140건 upsert, 1,395건 공개, KEV 1건
- sourceMode=`recent_feed_fallback`, fallbackTransport=`gzip`
- 변경 파일(`lib/nvd-cve.ts`, `lib/supabase-admin.ts`) strict TypeScript 검사 통과

### Pending
- Vercel 배포 후 첫 최적화 수집 건수 확인
- 즉시 재실행 시 `feedNotModified=true` 또는 `feedHashMatched=true`, `totalUpserted=0` 확인
- `/api/cron/daily` 통합 수집 확인

## [v1.0.2] - 2026-06-24

### Fixed
- NVD Recent gzip 피드가 Vercel에서 HTTP 406을 반환하던 문제
- 압축 피드 요청의 제한적인 `Accept` 헤더를 `*/*`로 변경
- NVD가 실제 반환하는 `application/x-gzip` 표현을 허용
- gzip 요청 실패 시 공식 ZIP 피드로 2차 fallback
- 외부 ZIP 라이브러리 없이 단일 JSON 항목을 안전하게 해제

### Added
- 수집 결과 `fallbackTransport` (`gzip` 또는 `zip`)
- gzip·ZIP 양쪽 실패 원인을 합친 진단 메시지
- ZIP 구조·크기·암호화·압축방식 검증

### Observed
- v1.0.1 배포 후 NVD API 503 fallback이 실행됨
- fallback gzip 다운로드가 `NVD recent feed HTTP 406`으로 실패
- DB·인증·NVD 키 단계는 정상 통과

### Pending
- Vercel 배포 후 실제 gzip 또는 ZIP fallback 성공 확인

## [v1.0.1] - 2026-06-24

### Fixed
- NVD API HTTP 503 반복 시 수집 전체가 502로 종료되던 문제
- API 429/5xx/타임아웃 재시도 보강
- 공식 NVD Recent JSON 2.0 gzip 피드 fallback 추가
- fallback 사용 시 API 증분 체크포인트를 전진시키지 않도록 처리
- PowerShell 테스트 스크립트에서 서버 오류 본문을 바로 출력

### Added
- 수집 결과 `sourceMode`
- 수집 결과 `checkpointAdvanced`
- 수집 결과 `fallbackReason`
- `site_settings.nvd_collector`에 fallback 시각·원인·건수 기록

### Observed
- v1.0 배포 후 인증된 NVD 요청에서 `NVD API HTTP 503` 반복 확인
- CRON 인증, NVD 키 존재 확인, Supabase 설정 단계는 통과

### Pending
- Vercel 배포 및 실제 fallback 실행 검증

## [v1.0.0] - 2026-06-24

### Added
- NVD CVE API 2.0 증분수집
- `NVD_API_KEY` 서버 전용 사용
- 최근 7일 최초 수집과 이후 상태 기반 증분수집
- 2시간 중첩 조회 및 최대 30일 catch-up
- NVD 페이지네이션, 6초 대기, 제한적 재시도
- CVSS/CWE/CPE/벤더/제품/버전/참조 링크 정규화
- High/Critical 또는 KEV 기본 공개 정책
- `/api/cron/nvd` 수동 검증 엔드포인트
- `/api/cron/daily` KISA+NVD 통합 일일 수집
- NVD 및 통합 Cron PowerShell 테스트 스크립트
- 공통 Cron 인증 모듈

### Changed
- Vercel Cron 경로를 `/api/cron/kisa`에서 `/api/cron/daily`로 변경
- KISA 테스트 스크립트 UTF-8 콘솔 설정 추가
- `supabase-admin.ts`에 관리자 조회 기능 추가

### Verified
- 신규 서버 파일 대상 TypeScript 검사 통과
- NVD 정규화 fixture 테스트 통과

### Pending
- Vercel 전체 빌드
- 실제 NVD API 호출 및 Supabase upsert

## [v0.9.0] - 2026-06-23

### Added
- KISA RSS 4종 자동수집
- 서버 전용 Supabase upsert
- `CRON_SECRET` 인증
- `external_id` 중복 방지
- CVE 번호 자동 추출

### Verified
- Vercel 배포 성공
- 4개 피드 모두 성공
- 총 40건 실제 수집·정규화·upsert
- `successFeeds=4`, `failedFeeds=0`

## [v0.8.1] - 2026-06-23

### Fixed
- Vercel TypeScript 빌드 오류 수정
- `lib/data-source.ts`에서 삭제된 샘플 배열 import 제거
- `lib/supabase-data.ts` 재내보내기 호환 모듈로 변경

### Verified
- Vercel 배포 성공
- Supabase 샘플 데이터 화면 표시 확인

## [v0.8.0] - 2026-06-23

### Added
- Supabase 실데이터 연결
- 보안 뉴스, CVE, KISA, 브리핑 DB 조회
- 조회수 RPC 연결
- 인기 이슈 조회수 정렬
- 통합검색 DB 연결
- 5분 데이터 캐시
- 연결 실패 시 안전한 빈 상태 처리

### Issue
- 구형 `data-source.ts`가 남아 Vercel 타입 검사 실패
- v0.8.1에서 수정

## [v0.7.0] - 2026-06-23

### Added
- 보안 뉴스 국내외 통합
- `전체 / 국내 / 해외` 필터
- 해외 뉴스 국가명 배지
- 국내 우선 오늘의 보안 포커스 정책

### Decision
- 북미, 유럽, 아시아, 중동 등 세부 지역 필터는 사용하지 않음

## [v0.6.0] - 2026-06-23

### Added
- 페이지별 검색
- 페이지당 15개 페이지네이션
- 브리핑 날짜별 아카이브
- 과거 브리핑 상세페이지
- `국내 보안사고` 명칭을 `보안 뉴스`로 변경

## [v0.5.0] - 2026-06-23

### Added
- 인기 이슈 독립 페이지
- 조회수 UI
- 브리핑 화면 개선
- 오늘의 보안 현황 글자 크기 조정

## [v0.4.0] - 2026-06-23

### Changed
- 전체 폰트 크기와 카드 정렬 개선
- 오늘의 보안 포커스 버튼과 카드 간격 조정

## [v0.3.1] - 2026-06-23

### Fixed
- 누락된 `today-focus.ts` 복구

## [v0.3.0] - 2026-06-23

### Changed
- 선택된 통합 디자인 시안에 맞춘 UI 개편

## [v0.2.0] - 2026-06-23

### Added
- 초기 다중 페이지 구조
- 보안 뉴스, CVE, KISA, 브리핑 영역

## [v0.1.1] - 2026-06-23

### Fixed
- Vercel npm registry 및 배포 설정 수정

## [v0.1.0] - 2026-06-23

### Added
- 최초 Next.js 샘플 프로젝트
