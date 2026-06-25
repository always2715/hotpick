# STELLATE v8.0.46

기준 버전: v8.0.45  
작성일: 2026-06-25

## 핵심 해결

### TOP25 전체 생성 실패 방지

v8.0.45의 TOP 단건 생성은 `fastRefresh` 경로를 사용합니다. 이 경로에서 피드 상세 본문이 1,000자 미만이면 최종 검증 예외가 발생했고, 예외 전에 실행별 stage·snapshot·slug alias가 저장되지 않을 수 있었습니다. 같은 후보를 다시 실행해도 동일 실패가 반복돼 자동 3회 이후 `KEYWORD_ATTEMPT_LIMIT`가 발생했습니다.

v8.0.46은 다음 순서로 처리합니다.

1. 조사와 Fact Ledger 구성
2. AI 생성 결과가 1,000자 미만이면 같은 시도 안에서 검증된 Fact 기반 문안으로 복구
3. 최종 공개 검증 전 실행별 stage·snapshot·slug alias 초안 저장
4. 검증 실패 시 저장된 Fact Ledger로 같은 요청 안에서 한 번 더 로컬 복구
5. 복구 성공 시 추가 attempt 없이 `generated` 처리
6. 자동 시도는 3회 유지
7. 관리자 명시적 재개 시에만 최대 5회 허용

확인 사실이 부족해 1,000자를 만들 수 없는 후보는 계속 실패 처리합니다. 일반론·추측·전망으로 강제 통과시키지 않습니다.

### 신규 진입·유지·순위변동

새 TOP20을 공개하기 직전에 직전 공개 TOP20과 비교합니다.

- 동일 사건 ID 또는 eventKey 일치
- 동일 slug 일치
- 조사 후 확정된 대표 키워드 일치
- identity alias 일치

판정 결과:

- 이전 TOP에 없으면 `NEW`
- 이전과 같은 순위면 `유지`
- 이전보다 순위가 오르면 `▲ n`
- 이전보다 순위가 내려가면 `▼ n`

후보 생성 성공 순서가 아니라 기존 정책대로 `selectionRank` 순서로 공개하며, 순위변동 계산은 공개가 확정된 뒤에만 적용합니다.

## 유지 정책

- 관심도 상대순위 상위 25개 생성 후보 고정
- 성공 후보 중 원래 순위가 높은 20개 공개
- 실패 후보 발생 시 21~25위 성공 후보 승격
- 성공 후보가 20개 미만이면 기존 TOP20 유지
- 누적 피드 보존
- 피드 상세 최소 1,000자, 사실이 충분하면 약 5,000자 권장
- TOP 클릭 요약 최대 1,000자
- Unsplash 사전 풀 목표 500개
- 썸네일 적합도는 TOP 순위 점수와 분리

## 정책 식별값

- appVersion: 8.0.46
- contentVersion: 136
- trendCacheVersion: 53
- generationPoolCount: 25
- publicTopCount: 20
- automaticKeywordAttempts: 3
- manualKeywordAttempts: 5
