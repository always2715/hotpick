# STELLATE v8.0.39

STELLATE v8.0.39는 v8.0.38의 **TOP25 생성 후보 → 성공 후보 TOP20 공개 방식과 Unsplash 100개 사전 풀 정책을 그대로 유지**하면서, 실행 재개 버전 오판과 피드 0건 복구 문제를 수정한 안정화 버전입니다.

## 수정한 문제

### 1. v8.0.37 실행 재개 오판

- 기존 코드는 실행에 `engineVersion: 8.0.37`을 저장하면서도 재개 시 특정 엔진 문자열을 엄격하게 비교해, 같은 TOP25→TOP20 정책 실행을 호환 불가로 잘못 차단할 수 있었습니다.
- v8.0.39는 패치 버전 문자열 하나가 아니라 다음 구조를 함께 확인합니다.
  - workflowType: `top_refresh_v2`
  - generationPoolCount: 25
  - publicTopCount: 20
  - TOP 정책 식별값
- v8.0.37, v8.0.38, v8.0.39에서 시작한 동일 정책 실행은 재개할 수 있습니다.
- v8.0.36 이하처럼 정책 구조가 다른 실행은 계속 차단합니다.
- 기존 오류로 `failed` 또는 `completed_with_errors`가 된 실행도 관리자에서 `중단 지점부터 재개` 버튼을 표시합니다.

### 2. 피드 페이지 0건 표시

- 실패한 TOP 실행이 피드 복구를 호출할 때, 기존 공개 콘텐츠를 현재 세대의 엄격한 생성 검증 기준으로 다시 심사해 피드 인덱스에서 제거할 수 있던 문제를 수정했습니다.
- 이미 공개된 정상 콘텐츠는 `published`, 공개 상태, 제목·요약·본문 존재 여부를 기준으로 비파괴 복구합니다.
- 누락된 `publicReady`, `feedReady` 필드가 있는 구형 피드 레코드도 공개 이력이 확인되면 호환 업그레이드합니다.
- 전체 피드 조회는 TOP20만 복구하지 않고 누적 공개 콘텐츠 인덱스를 다시 구성합니다.
- 피드 Hash/ZSET과 콘텐츠 인덱스가 모두 비어도 현재 공개 TOP 스냅샷에서 최소 피드 목록을 복구하는 비상 fallback을 추가했습니다.
- 명시적으로 비공개·숨김·삭제된 콘텐츠는 복구하지 않습니다.

## 변경하지 않은 정책

- 관심도 상대순위 상위 25개 생성 후보 고정
- 성공 후보를 원래 `selectionRank` 순으로 정렬
- 성공 후보 상위 20개 원자적 공개
- 실패 후보 발생 시 21~25위 성공 후보 승격
- 성공 후보가 20개 미만이면 기존 TOP20 유지
- 이미지 점수·이미지 존재 여부를 TOP 선정에 사용하지 않음
- Unsplash 100개 사전 풀, 기존/수동 썸네일 유지, 신규 콘텐츠만 자동 배정

## 버전

- appVersion: 8.0.39
- contentVersion: 133
- trendCacheVersion: 52
- generationPoolCount: 25
- publicTopCount: 20
- Redis namespace: `stellate:v7`
- QStash dedupe prefix: `update-trends-v837` 유지

## 배포 직후 확인

1. `/api/version`에서 `appVersion: 8.0.39` 확인
2. 피드 페이지를 열어 기존 공개 피드가 자동 복구되는지 확인
3. 즉시 복구가 필요하면 관리자에서 `현재 TOP 피드 목록 재구성` 실행
4. v8.0.37 동일 정책 실행이 실패 상태로 남아 있으면 `중단 지점부터 재개` 실행
5. Redis `FLUSHALL`, 기존 공개 TOP 삭제, 새 TOP 강제 시작은 필요하지 않음

## 검증 결과

- `npm run test:v8`: PASS
- `npm run test:v8039`: PASS
- v8.0.37 TOP25→성공 TOP20 회귀 테스트: PASS
- v8.0.38 썸네일 100개 풀 회귀 테스트: PASS
- `npm run build`: PASS
- `next start -p 3211`: 정상 시작
- `/api/version`: HTTP 200, appVersion 8.0.39 확인

## 운영 검증 한계

운영 Upstash Redis와 QStash 자격증명 없이 로컬에서 실제 운영 데이터의 피드 인덱스를 직접 재구성하거나 중단된 실행을 재개할 수는 없었습니다. 코드 경로·회귀 테스트·프로덕션 빌드는 통과했으며, 배포 후 실제 Redis 데이터에서 피드 건수와 실행 재개 결과를 확인해야 합니다.
