# STELLATE v8.0.34

TOP20 갱신에서 `STRICT_CONTENT_ACCURACY_FAILED`가 첫 시도에 영구 실패하던 경로를 수정한 버전입니다.

## 핵심 수정

- AI 수정안은 품질 점수 비교 전에 Fact Ledger 정확성 검사를 통과해야만 채택
- 마지막 정확성 검증 실패 시 후보를 버리지 않고 Fact Ledger 직접 투영 문안으로 즉시 재작성
- 결정론적 재작성은 Fact ID, 수치, 날짜, 추론 검사를 계속 유지
- 정확성 복구도 실패한 경우에만 최대 3회 추가 조사
- `STRICT_CONTENT_ACCURACY_FAILED`, `NO_ACCURATE_CONTENT`를 제한 재시도 대상으로 포함
- `여야 징벌적` 같은 주체+관형어 기사 제목 조각을 TOP20 확정 전에 제외
- 김대규·강득구 같은 고유명사 후보는 공식·신뢰 출처의 최소 확인 사실만 있어도 정확한 설명형 피드로 마무리
- contentVersion 130, trendCacheVersion 50, QStash dedupe `update-trends-v834`

## 적용

GitHub Desktop 사용자는 `STELLATE_v8.0.34_REPLACE_ONLY.zip` 안의 파일을 기존 `hotpick` 루트에 덮어쓴 뒤 Commit/Push합니다.

배포 후 기존 v8.0.33 이하 실패 실행은 재개하지 말고 관리자에서 중단한 뒤 새 TOP20 작업을 시작합니다.

## 검증

- `npm run test:v8034` 통과
- `npm run test:v8` 전체 통과
- `npm run build` 통과

운영 Upstash Redis/QStash 전체 실행은 이 환경에서 직접 검증하지 못했습니다.
