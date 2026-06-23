# STELLATE v8.0.27 — TOP 검색 반복 및 추가 검색 카운터 수정

작성일: 2026-06-23

## 1. 확인된 직접 원인

### 1.1 최종 공개 단계가 다시 외부 검색을 실행함

v8.0.26까지는 30개 1차 처리가 끝난 뒤 `finalizeTrendRefreshRun()` 안에서 미완료 키워드를 다시 최대 2회 일괄 조사했습니다.

이 구조는 다음 문제를 만들었습니다.

- 최종 공개 요청 한 번에 최대 수십 건의 외부 검색·AI 생성이 다시 실행됨
- Vercel 함수 300초 제한을 넘길 가능성이 높음
- QStash가 같은 finalize 메시지를 재전달함
- 관리자 화면에는 1차 처리가 끝난 상태에서 `추가 검색` 관련 수치만 계속 변하는 것처럼 표시됨

### 1.2 1차 처리도 캐시를 강제로 무시함

기존 호출이 항상 `force:true`여서 동일 키워드의 유효한 12시간 캐시가 있어도 다시 조사했습니다.

### 1.3 중복 QStash 메시지의 진행 위치 보호가 부족함

같은 start·batch 메시지가 다시 전달될 때 이미 처리된 위치 또는 완료 항목을 다시 건드릴 가능성이 있었습니다.

### 1.4 관리자 진행률이 실제 1차 처리 수를 보여주지 못함

`retry_wait`는 완료 수에서 빠지므로 30개를 한 차례 조사했어도 화면에는 완료가 거의 증가하지 않고 추가 검색만 증가하는 것처럼 보였습니다.

---

## 2. v8.0.27 처리 흐름

```text
후보 수집
→ TOP30 확정
→ 1차 콘텐츠 처리: 3개씩 10개 QStash 배치
→ stage 저장·검증
→ 추가 조사가 필요한 항목만 분리
→ 자동 추가 검색: 최대 6개씩 소배치
→ stage·중복 콘텐츠 재검증
→ finalize: 검증과 원자적 공개만 수행
```

### 자동 시도 횟수

- 1차 조사: 키워드당 1회
- 자동 추가 검색: 필요한 항목만 1회
- 자동 총 시도: 키워드당 최대 2회
- 관리자 명시적 재개: 키워드당 최대 3회까지 허용

### 실행 단계 상한

최악의 경우에도 다음 범위 안에 들어옵니다.

```text
start 1회
+ 1차 배치 10회
+ 추가 검색 배치 최대 5회
+ finalize 1회
= 최대 17단계
```

기존 안전 상한 18단계 안에서 종료됩니다.

---

## 3. 주요 수정 내용

### 검색·재시도

- `finalize`에서 외부 검색과 AI 콘텐츠 생성 완전 제거
- `retry` 전용 QStash phase 추가
- 자동 추가 검색은 `retry_wait` 항목만 처리
- 추가 검색 배치 크기 최대 6개
- 추가 검색 동시 처리 최대 3개
- 자동 시도 횟수 최대 2회로 고정
- 시도 한도 초과 시 `KEYWORD_CONTENT_EXHAUSTED`로 종료
- 같은 오류로 무한 재큐잉하지 않음

### 중복 메시지 방지

- start 중복 메시지는 기존 실행을 자동으로 처음부터 재개하지 않음
- batch cursor와 `lastCompletedCursor`로 이미 끝난 배치 무시
- v8.0.26 실행 데이터의 기존 `batchCursor`도 이어받음
- retry cursor로 이미 끝난 추가 검색 소배치 무시
- phase별 Redis 잠금 적용
- QStash deduplication ID에 `trigger` 포함
- 관리자 명시적 재개가 이전 자동 retry dedupe ID에 막히지 않음

### 완료 항목 보호

- 이미 `generated` 또는 `reused`인 항목은 시도 횟수 판정보다 먼저 stage를 확인하고 건너뜀
- 같은 1차 batch가 재전달돼도 `retry_wait`, `failed`, `stopped` 항목을 바로 재검색하지 않음
- 재검색은 retry phase 또는 관리자 명시적 재개에서만 수행

### 캐시

- 1차 시도는 동일 키워드의 유효한 기존 콘텐츠 캐시를 사용할 수 있음
- 2차 자동 추가 검색부터 강제 재조사
- 캐시 키워드와 현재 확정 키워드가 일치하는지 검증
- 고정 TOP30 공개 검증을 통과한 캐시만 재사용

### stage·중복 검증

- finalize 전에 30개 stage를 Redis 기준으로 재확인
- stage 누락 또는 읽기 실패 항목만 retry 대상으로 이동
- 피드 제목 또는 본문이 중복된 후순위 항목만 retry 대상으로 이동
- 중복 재생성도 자동 시도 한도 안에서만 수행
- finalize는 검색하지 않고 최종 검증과 원자적 저장만 수행

### Fact Ledger fallback

- `fact.text`뿐 아니라 `fact.claim`도 사실문으로 사용
- `evidenceSources`가 비어 있어도 `factLedger.sources`의 정상 URL을 근거로 복구 가능
- 키워드 기본정보형 콘텐츠의 제목·요약·상세 제목 보정
- 구조화 사실이 충분한데도 추가 검색으로 반복되는 경우 감소

### 관리자 화면

기존의 모호한 완료 수 대신 다음을 분리 표시합니다.

- TOP 키워드 전체 수
- 1차 처리 수
- 콘텐츠 준비 수
- 재시도 대기 수
- 실패 수
- 추가 검색 처리 수
- 1차 키워드 위치
- 실행 단계

---

## 4. 배포 후 기존 반복 실행 처리

v8.0.26에서 이미 반복 중인 실행은 새 코드 배포만으로 데이터가 삭제되지는 않습니다.

권장 순서:

1. v8.0.27 배포
2. 관리자 페이지에서 기존 실행의 `작업 중단` 실행
3. 기존 반복 실행은 재개하지 않고 새 `TOP 즉시 시작` 실행
4. 새 실행에서 `1차 처리 30/30` 이후 재시도 대기 항목만 소배치 처리되는지 확인

Redis `FLUSHALL`이나 TOP 데이터 삭제는 필요하지 않습니다.

---

## 5. 버전 정보

```json
{
  "appVersion": "8.0.27",
  "contentVersion": 125,
  "trendCacheVersion": 46,
  "automaticKeywordAttempts": 2,
  "manualKeywordAttempts": 3,
  "retryBatchSize": 6,
  "maxRunSteps": 18,
  "maxRunMinutes": 60
}
```

콘텐츠 버전과 Redis namespace는 변경하지 않았으므로 기존 공개 콘텐츠를 전부 재생성할 필요가 없습니다.

---

## 6. 배포 명령

```powershell
cd ".\STELLATE_v8.0.27_FULL"
npm install
npm run test:v8027
npm run build
vercel --prod
```

배포 후 확인:

```text
https://stellate.co.kr/api/version
https://stellate.co.kr/admin
```

---

## 7. 검증 결과

- `npm run test:v8027`: 통과
- `npm run test:v8`: 전체 통과
- `npm run build`: 통과
- Next.js 프로덕션 컴파일: 성공
- `/admin` 빌드: 성공
- `/api/jobs/update-trends` 빌드: 성공

## 8. 실제 운영환경 확인이 필요한 항목

다음은 로컬 테스트만으로 완전히 재현할 수 없어 배포 후 관리자 화면과 QStash 로그에서 확인해야 합니다.

- 운영 Redis에 남아 있는 기존 v8.0.26 실행 상태
- 이미 QStash에 예약된 이전 finalize 메시지 수
- 실제 외부 검색 API 응답시간
- 운영 환경에서 30개 중 자동 추가 검색이 필요한 실제 개수
