# STELLATE v8.0.40

## 수정 목적

실수로 시큐포커스 NOW 교체 패키지의 `app/api/cron/daily/route.ts`와 `.next`가 STELLATE 저장소에 들어가 Vercel 빌드가 실패한 문제를 해결합니다.

## 핵심 수정

- STELLATE는 Next.js Pages Router이므로 타 프로젝트의 `app/` 디렉터리를 배포 전에 자동 제거
- `cron-auth`, `kisa-rss`, `nvd-enrichment`, `nvd-cve`, `supabase-admin` 등 시큐포커스 전용 잔여 파일 제거
- 다른 프로젝트의 `.next` 빌드 산출물 제거
- `npm ci`의 `preinstall`과 `npm run build` 양쪽에서 정리 스크립트 실행
- Vercel buildCommand를 `npm run build`로 고정
- 로컬 정리용 `APPLY_STELLATE_v8.0.40_CLEANUP.bat` 제공

## 영향 없는 영역

- TOP25 생성 후보와 성공 TOP20 공개
- 예비 후보 승격
- 피드 복구
- Unsplash 100개 썸네일 풀
- Redis namespace와 QStash 처리 구조

## 적용

교체 ZIP의 전체 파일을 `hotpick` 저장소 최상위에 덮어쓴 뒤 `APPLY_STELLATE_v8.0.40_CLEANUP.bat`을 한 번 실행합니다. GitHub Desktop에서 `app/`와 `.next/` 삭제가 Changes에 잡히면 함께 커밋하고 Push합니다.
