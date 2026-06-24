# STELLATE v8.0.33

## 목적

v8.0.33은 TOP20 작업이 `17/20`, `stage_not_found`, `stage_identity_mismatch`로 반복 종료되는 운영 흐름을 다시 분석해 수정한 버전입니다.

이번 버전은 stage 키를 하나 더 추가하는 수준이 아니라 다음 네 가지를 함께 수정합니다.

1. QStash 요청 제한시간과 Redis 단계 잠금 충돌
2. 기사 제목의 숫자·서술 조각이 TOP20 키워드로 확정되는 문제
3. 실행·순위가 바뀔 때 달라지는 candidateId를 영구 콘텐츠 식별자로 사용한 문제
4. 작업 상태와 실제 저장 콘텐츠가 달라졌을 때 복구하지 못하는 문제

## 확인된 근본 원인

### 1. QStash 재시도를 성공으로 소비하던 단계 잠금

기존 처리 흐름은 Vercel/QStash 요청 제한이 300초인데 단계 잠금은 360초였습니다.

한 후보의 조사·AI 생성이 300초를 넘어 요청이 강제 종료되면 다음 상태가 남을 수 있었습니다.

```text
작업 상태: processing
stage: 없음
snapshot: 없음
단계 lock: 최대 360초 유지
```

QStash가 같은 요청을 재시도해도 잠금이 남아 있으면 기존 코드는 `stepAlreadyRunning:true`를 포함한 성공 응답을 반환했습니다. QStash는 이를 처리 완료로 인식하므로 같은 cursor의 재시도가 끝났고, 해당 후보는 영구적으로 stage가 없는 상태가 될 수 있었습니다.

v8.0.33은 다음처럼 변경했습니다.

- 단계 잠금 TTL: 360초 → 240초
- lock 충돌을 HTTP 성공으로 처리하지 않음
- `trend_step_lock_busy` 오류를 발생시켜 QStash가 같은 cursor를 다시 시도하도록 함
- QStash 한 요청에서 후보 1개만 처리
- 자동 시도 최대 3회
- 이미 저장된 stage/snapshot이 있으면 task 상태와 무관하게 먼저 복구

### 2. 기사 제목 조각을 키워드로 확정

실패 로그의 다음 항목은 독립 키워드가 아니라 기사 제목 일부였습니다.

```text
13.61포인트(1.53 오른
나란히 2경기
질문에 답하는
```

이런 문구는 조사 검색어로도 부정확하고, 대표 엔티티를 안정적으로 찾기 어렵습니다.

v8.0.33은 TOP20 확정 전에 다음을 제거합니다.

- 괄호가 닫히지 않은 문자열
- 숫자와 단위로 시작하는 기사 조각
- `나란히`, `질문에`, `답하는`, `오른`, `내린` 등의 서술 조각
- `개월만`, `전에는 꼭`처럼 문장이 중간에 잘린 형태

제외된 자리는 다음 정상 후보가 순위대로 채워 TOP20을 유지합니다.

정상적인 제품·모델 숫자는 유지합니다.

```text
아이폰 18 → 유지
HBM4 출하 4개월만 → HBM4로 정규화
유인영 45세 전에는 꼭 → 유인영으로 정규화
```

### 3. candidateId를 영구 식별자로 오인

candidateId는 실행 ID와 순위에 따라 달라질 수 있습니다. 과거 실행의 동일 콘텐츠가 다음과 같이 저장될 수 있습니다.

```text
이전 실행 candidateId: r7-old
현재 실행 candidateId: r2-new
slug: kim-jong-un
대표 키워드: 김정은
```

기존 로직은 ID가 다르다는 이유로 같은 콘텐츠를 거부할 수 있었습니다.

v8.0.33은 다음 순서로 동일성을 확인합니다.

1. 현재 candidateId 정확히 일치
2. 현재 publicationStageId 정확히 일치
3. 다른 실행이라도 slug와 대표 키워드가 의미상 일치
4. 현재 실행 안에서 다른 후보 ID가 명확히 확인되면 거부

이전 콘텐츠 버전은 동일성만 인정하고, 현재 Fact Ledger로 다시 구성한 후 현재 실행 stage로 승격합니다.

### 4. 작업 상태와 실제 저장 결과 불일치

요청이 stage 저장 직후 종료되면 task는 `processing`으로 남을 수 있습니다. 반대로 task 업데이트는 됐지만 콘텐츠 저장이 실패할 수도 있습니다.

v8.0.33에서는 후보를 처리하기 전에 항상 다음 순서로 실제 저장 결과를 먼저 확인합니다.

```text
candidateId snapshot
→ slug alias snapshot
→ publicationStageId alias snapshot
→ publication_stage
→ 기존 공개 콘텐츠
```

실제 콘텐츠가 있으면 task를 `generated` 또는 `reused`로 자동 복구하며 시도 횟수를 추가로 소모하지 않습니다.

## 실행별 콘텐츠 이중 저장

각 후보 콘텐츠는 다음 두 구조에 저장합니다.

```text
stellate:v7:publication_stage:{publicationStageId}
stellate:v7:cron:content:{runId}
```

실행별 snapshot Hash에는 다음 field를 같이 저장합니다.

```text
{candidateId}
slug:{slug}
stage:{publicationStageId}
```

하나의 field 또는 stage 키가 없어져도 나머지 alias에서 복구하고 누락된 candidateId field를 다시 기록합니다.

## 처리 구조

```text
외부 Cron 또는 관리자 TOP 즉시 시작
→ /api/cron
→ QStash start
→ 후보 수집·정규화
→ 잘린 문장 후보 제거
→ 상대순위 TOP20 확정
→ 후보 1개당 QStash 요청 1개
→ 저장 원본 선확인
→ 독립 조사·Fact Ledger·상세 생성
→ publication stage + 실행 snapshot 이중 저장
→ 추가 검색이 필요한 후보만 최대 2회 추가 시도
→ finalize 전 queued/processing/retry_wait 확인
→ 20개 검증 완료 시 원자적 공개
```

## 재시도와 제한

- 후보당 자동 총 시도: 최대 3회
- QStash 요청당 처리 후보: 1개
- 단계 lock TTL: 240초
- QStash 요청 제한: 300초
- 전체 최대 단계: 72
- 전체 최대 실행시간: 120분
- finalize에서는 외부 검색·AI 생성 금지
- 20개 미완성 시 기존 공개 TOP 유지

## 진단 메시지 개선

TOP20이 다시 실패할 경우 각 미완료 항목에 다음 정보가 함께 표시됩니다.

```text
status
candidatePhase
attempts
errorCode
```

예:

```text
김정은: 실행별 원본 없음 [status=processing, phase=research_and_generation, attempts=2, code=stage_not_found]
```

이 정보로 운영환경에서 실제 종료 지점을 확인할 수 있습니다.

## 버전

```json
{
  "appVersion": "8.0.33",
  "contentVersion": 129,
  "trendCacheVersion": 49,
  "publicTopCount": 20
}
```

이전 실패 실행과 이전 후보 캐시를 새 실행에 섞지 않기 위해 콘텐츠·트렌드 캐시 버전을 올렸습니다.

## 배포 후 실행 순서

1. GitHub Desktop에서 `STELLATE_v8.0.33_REPLACE_ONLY.zip`의 내용만 기존 `hotpick` 루트에 덮어씁니다.
2. `node_modules`, `.next`, `.env.local`, `.vercel`, `.git`은 복사하거나 커밋하지 않습니다.
3. GitHub Desktop에서 Commit 후 Push합니다.
4. Vercel 배포 완료 후 `/api/version`에서 `8.0.33`, `129`, `49`를 확인합니다.
5. 관리자에서 기존 실패 작업을 즉시 중단합니다.
6. 기존 실행은 재개하지 않습니다.
7. `TOP 즉시 시작`으로 새 TOP20 실행을 시작합니다.
8. 관리자에서 각 항목의 `status`, `candidatePhase`, `attempts`, `errorCode`를 확인합니다.

## 테스트 결과

- `npm run test:v8033`: 통과
- `npm run test:v8`: 전체 통과
- `npm run build`: 통과
- 로컬 프로덕션 `/api/version`: HTTP 200
- 비정상 기사 문장 조각 제외 후 정상 후보로 TOP20 보충: 통과
- 실행 간 candidateId가 달라도 slug+키워드 동일성 복구: 통과
- 현재 실행의 다른 candidateId 콘텐츠 거부: 통과
- candidate/slug/stage snapshot alias 저장: 통과

## 검증 한계

이 환경에서는 운영 Upstash Redis와 QStash 자격증명을 사용할 수 없으므로 실제 운영 TOP20 전체 실행은 수행하지 못했습니다. 로컬 단위·회귀 테스트와 Next.js 프로덕션 빌드까지 확인했습니다. 운영에서 다시 실패하면 v8.0.33부터 표시되는 `status`, `phase`, `attempts`, `code`가 실제 다음 분석 기준입니다.
