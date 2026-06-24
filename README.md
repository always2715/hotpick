# STELLATE v8.0.33

현재 공개 정책은 **TOP20 원자적 공개**입니다.

이번 버전은 반복된 `stage_not_found`, `stage_identity_mismatch`, TOP20 미완성의 근본 실행 흐름을 수정합니다.

핵심 변경:

- QStash 300초 제한보다 긴 단계 lock 제거: 240초
- lock 충돌을 성공 응답으로 소비하지 않고 재시도 오류로 반환
- 후보 1개당 QStash 요청 1개
- 후보당 자동 최대 3회
- 잘린 기사 제목 조각을 TOP20 확정 전에 제거하고 다음 후보로 보충
- 실행별 candidateId 변경을 고려한 slug+키워드 동일성 복구
- publication stage와 실행 snapshot 이중 저장
- candidate/slug/stage alias 복구
- 미완료 오류에 status·phase·attempts·errorCode 표시

상세 내용은 다음 파일을 먼저 확인하세요.

- `STELLATE_PROJECT_HANDOFF_v8.0.33.txt`: 전체 프로젝트 인수인계 기준
- `README_v8.0.33.md`: 이번 버전 수정 내용
- `STELLATE_v8.0.33_TEST_REPORT.txt`: 테스트 결과와 검증 한계
