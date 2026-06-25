# STELLATE v8.0.53

v8.0.53는 정상 TOP25 작업이 고정 72단계 상한에 걸려 중단되는 문제를 해결합니다.

- 자동 실행 기본 단계 예산 96회
- 관리자 재개 단계 예산 160회
- 실제 진행이 확인되면 24회 단위로 최대 240회까지 안전 확장
- 같은 상태가 10회 반복될 때만 무한 반복으로 중단
- 관리자 재개 시 단계 카운터와 120분 실행 시간창 초기화
- QStash 재개 메시지 dedupe generation 분리
- TOP25 상대순위, 성공 TOP20, 15~19개 혼합 공개, 누적 피드, 썸네일 500개 정책 유지

GitHub Desktop 적용에는 `STELLATE_v8.0.53_REPLACE_ONLY.zip`을 저장소 최상위에 덮어쓴 뒤 `APPLY_STELLATE_v8.0.53_CLEANUP.bat`을 실행하십시오.

상세 내용은 `README_v8.0.53.md`, `STELLATE_PROJECT_HANDOFF_v8.0.53.txt`, `STELLATE_v8.0.53_DEPLOY_GUIDE.txt`를 확인하십시오.


## v8.0.53 hotfix
- Fixed `hybridPublication is not defined` during the initial TOP refresh start phase.
- Initial run status now stores `freshReadyCount=0`, `carryoverReadyCount=0`, and `publicationMode=pending`.
- Hybrid publication counts are calculated only in the finalize phase.
