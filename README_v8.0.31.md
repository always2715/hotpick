# STELLATE v8.0.31 — TOP20 전환 및 갱신 완료 안정화

## 버전

- appVersion: `8.0.31`
- contentVersion: `127`
- trendCacheVersion: `47`
- 공개 순위 수: `20`
- TOP 정책: `fixed_keyword_content_v16_top20`
- Redis namespace: 기존 `stellate:v7` 유지

---

## 1. 이번 오류에서 확인된 직접 원인

운영 오류 예시는 다음과 같았습니다.

```text
[top30_fixed_content_incomplete]
확정된 TOP30 키워드 중 상세·피드·제목이 25/30만 완료

박민원 총장 불신임: 실제 사실문 대신 일반화된 Fact 문구가 포함됨
HBM4 출하 4개월만: stage_not_found
줄투표: stage_not_found
유인영 45세 전에는 꼭: stage_not_found
질문에 답하는: stage_not_found
```

### 1.1 `stage_not_found` 원인

콘텐츠 생성 결과가 정상이어도 실행별 stage가 저장되지 않는 경로가 있었습니다.

기존 흐름 일부:

```text
콘텐츠 생성 또는 기존 콘텐츠 재사용
→ slug 기준 stage 또는 콘텐츠만 저장
→ 함수 반환
→ 호출부에서 runId 기준 stage를 다시 저장
```

Vercel/QStash 요청이 함수 반환 직후 종료되거나, 출처 지문이 같아 기존 콘텐츠를 재사용하는 분기로 빠지면 `runId:candidateId` 기준 stage 저장이 누락될 수 있었습니다. 최종 공개 단계는 실행별 stage만 읽기 때문에 실제 콘텐츠가 있어도 `stage_not_found`로 처리됐습니다.

### 1.2 일반화 Fact 때문에 항목 전체가 탈락한 원인

Fact Ledger에 구체적인 사실과 다음 같은 일반 문구가 함께 들어온 경우가 있었습니다.

```text
상태 변화가 확인됐습니다.
공식 발표가 확인됐습니다.
수치 변화가 확인됐습니다.
```

기존 검증은 일반화 Fact가 하나라도 있으면 구체적인 Fact가 함께 있어도 항목 전체를 실패 처리할 수 있었습니다.

### 1.3 TOP30을 TOP20으로 숫자만 줄이면 안 되는 이유

기존 코드에는 다음 영역마다 30개 기준이 따로 존재했습니다.

- 후보 확정
- 후보 identity와 stage ID
- 1차 배치와 재시도
- 완료 조건
- 원자적 공개
- Redis 저장 검증
- 피드 인덱스 복구
- 관리자 진행률과 안내 문구
- 메인 화면 표시
- 텔레그램 문구
- 기존 실행 재개 조건
- 회귀 테스트

일부만 20으로 바꾸면 `20개 생성 → 30개 요구 → 공개 실패`가 다시 발생하므로 중앙 설정으로 통합했습니다.

---

## 2. TOP20 전환 내용

`lib/topConfig.js`를 추가해 공개 순위 수를 중앙 관리합니다.

```js
export const PUBLIC_TOP_COUNT = 20;
export const PUBLIC_TOP10_COUNT = 10;
export const TOP_POLICY_VERSION = 'fixed_keyword_content_v16_top20';
```

다음 영역을 모두 TOP20 기준으로 변경했습니다.

- 후보 약 90개 수집 정책은 유지
- 후보 중 상대순위 TOP20 확정
- 고유 `candidateId` 20개 생성
- 실행별 stage 20개 생성
- 상세·피드·제목 20개 준비 확인
- 피드 20건 준비 확인
- 20건이 모두 준비된 경우에만 원자적 공개
- 관리자 진행률 `20/20`
- 메인 화면 TOP20
- 피드 복구 대상 TOP20
- 텔레그램 전체 TOP20
- 21위 이하 후보로 숫자 채우기 금지
- TOP10 인스타그램 정책은 기존대로 유지

### 호환성을 위해 유지한 이름

다음 함수명이나 Redis key 일부에는 `top30` 문자열이 남을 수 있습니다.

```text
selectStableTop30
generateTop30
stable_top30 계열 key
fixedTop30Flow 옵션 alias
```

이는 기존 데이터와 관리자 도구의 호환성을 위한 내부 이름입니다. 실제 공개 수와 검증 기준은 `PUBLIC_TOP_COUNT = 20`을 사용합니다.

---

## 3. `stage_not_found` 수정

### 3.1 콘텐츠 함수 내부에서 실행별 stage 즉시 저장

`getCachedContent()`가 `stageOnly`로 호출되면 다음 모든 성공 경로에서 `publicationStageId` 기준 stage를 직접 저장합니다.

- 메모리 캐시 재사용
- Redis 저장 콘텐츠 재사용
- 출처 지문 동일로 기존 콘텐츠 재사용
- 신규 AI 콘텐츠 생성 성공
- Fact Ledger 기반 로컬 복구 성공
- 기존 검증 콘텐츠 업그레이드 성공

즉, 호출부에서 나중에 다시 저장하는 단계에 의존하지 않습니다.

### 3.2 출처 지문 동일 재사용 경로 보완

최종 점검에서 추가로 확인한 누락 경로입니다.

```text
sourceSignature 동일
→ 기존 콘텐츠 재사용
→ run-stage 저장 없이 반환
```

v8.0.31에서는 이 경우도 다음 정보를 넣어 실행별 stage를 저장합니다.

```text
stageCacheReused: true
stageReuseReason: source_signature_unchanged
```

### 3.3 legacy slug stage 자동 승격

이전 실행에서 slug 기준 stage만 남아 있어도 다음 조건을 확인한 뒤 실행별 stage로 복구합니다.

- 키워드 일치
- contentVersion 127 일치
- 상세 콘텐츠 준비
- 피드·제목 준비
- 공개 정확성 검증 통과

복구된 stage에는 다음 진단값을 남깁니다.

```text
stageRecoveredFrom: legacy_slug_stage
```

### 3.4 task 상태보다 실제 stage 우선

작업 상태 업데이트만 실패하고 stage는 정상 저장된 경우를 살리기 위해, finalize는 task 상태보다 실제 stage를 먼저 확인합니다. 정상 stage가 있으면 task를 `generated`로 복구합니다.

---

## 4. 일반화 Fact 처리 수정

### 변경 원칙

- 일반화 Fact는 저장·공개 대상에서 제거
- 구체적인 검증 Fact는 유지
- 제거 후 남은 Fact Ledger로 상세·피드·요약·제목을 다시 구성
- 구체적인 Fact가 하나도 없으면 억지로 내용 생성 금지
- 일반화 Fact가 남아 있는 콘텐츠는 공개 금지

예:

```text
제거: 상태 변화가 확인됐습니다.
유지: 학교법인은 6월 23일 총장 불신임 안건의 표결 결과를 공개했습니다.
```

직접 검색 결과 일부가 손상돼도 Fact Ledger에 정상 출처가 있으면 함께 병합하여 복구합니다. 출처는 canonical URL 기준으로 중복 제거합니다.

---

## 5. 기존 25/30 실행 처리

기존 TOP30 실행을 TOP20 실행으로 그대로 재개하면 안 됩니다.

이유:

- 후보 수가 30개로 저장됨
- rank·candidateId·publicationStageId가 TOP30 실행 기준
- 일부 stage가 구버전 contentVersion으로 생성됨
- TOP20의 정확한 1~20위와 일치한다고 보장할 수 없음

v8.0.31에서는 다음 조건이면 재개를 차단합니다.

```text
후보 수가 20개가 아님
또는 fixedTop20 플래그가 없음
```

관리자에는 다음 취지의 409 응답을 반환합니다.

```text
이 실행은 이전 TOP30 기준 작업이라 TOP20으로 안전하게 재개할 수 없습니다.
기존 작업을 중단하고 새 TOP 갱신을 시작하세요.
```

기존 공개 TOP은 삭제하지 않고 유지합니다.

---

## 6. 캐시·데이터 정책

- contentVersion: `126 → 127`
- trendCacheVersion: `46 → 47`
- 이전 저품질 콘텐츠와 TOP30 후보 캐시는 새 실행에 재사용하지 않음
- Redis namespace는 그대로 유지
- 기존 공개 데이터는 새 TOP20 공개 성공 전까지 유지
- `FLUSHALL` 금지
- 기존 Redis key 이름을 강제 변경하지 않음

현재 공개 데이터가 30건이면 메인과 관리자에서는 우선 20건만 읽습니다. 새 TOP20 실행이 성공하면 20건 기준으로 원자적 교체됩니다.

---

## 7. 작업 단계와 완료 조건

```text
후보 수집
→ 중복·스팸 제거
→ 상대순위 TOP20 확정
→ 1차 처리: 3개씩 소배치
→ 실패 항목만 추가 검색: 최대 6개씩
→ 실행별 stage 20건 검증
→ 상세·피드·제목 20/20 확인
→ 피드 품질 확인
→ TOP20 원자적 공개
```

제한:

- 키워드별 자동 최대 2회
- 관리자 수동 재개 포함 최대 3회
- 전체 최대 18단계
- 전체 최대 60분
- finalize에서 외부 검색·AI 생성 금지
- 최종 복구는 저장된 Fact Ledger와 검증 콘텐츠만 사용

---

## 8. GitHub Desktop용 제외 파일

`.gitignore`를 추가했습니다.

```text
node_modules/
.next/
out/
.vercel/
.env
.env.local
.env.*.local
*.log
```

배포 ZIP에도 `node_modules`와 `.next`를 포함하지 않습니다. GitHub의 100MB 파일 제한을 초과한 `next-swc` 파일이 다시 커밋되는 것을 방지합니다.

---

## 9. 테스트 및 빌드

```powershell
npm install
npm run test:v8031
npm run test:v8
npm run build
```

검증 항목:

- 공개 수 20 중앙 설정
- 후보 확정 20
- candidateId 20개 고유
- 실행별 stage ID 생성
- 출처 지문 동일 재사용 시 실행별 stage 저장
- legacy slug stage 승격
- 일반화 Fact 제거
- 구체 Fact 유지
- 일반화 Fact만 있는 콘텐츠 공개 차단
- 이전 TOP30 실행 재개 차단
- 상세·피드·제목 20건 원자적 공개
- 관리자 TOP20 문구
- 메인 TOP20 표시
- 피드 복구 TOP20
- Next.js 프로덕션 빌드

---

## 10. 배포 후 필수 실행 순서

1. `/api/version`에서 아래 값을 확인합니다.

```json
{
  "appVersion": "8.0.31",
  "contentVersion": 127,
  "trendCacheVersion": 47,
  "publicTopCount": 20
}
```

2. 관리자에서 현재 남아 있는 TOP30 작업을 `현재 TOP 작업 중단 (즉시)`로 중단합니다.
3. 기존 `25/30` 실행은 재개하지 않습니다.
4. `TOP 즉시 시작`으로 새 TOP20 실행을 시작합니다.
5. 관리자에서 다음 값을 확인합니다.

```text
후보 확정 20
1차 처리 20/20
상세·피드·제목 준비 20/20
피드 준비 20/20
공개 20
```

6. 필요할 때만 `현재 TOP 피드 목록 재구성`을 실행합니다.

---

## 11. 배포 명령

```powershell
npm install
npm run test:v8031
npm run build
vercel --prod
```

GitHub Desktop을 사용하는 경우:

1. 기존에 Clone한 `hotpick` 폴더에서 `.git`을 유지합니다.
2. 이 배포본의 파일을 프로젝트 루트에 덮어씁니다.
3. `node_modules`, `.next`, `.env.local`, `.vercel`은 커밋하지 않습니다.
4. GitHub Desktop에서 변경사항을 확인합니다.
5. `release: STELLATE v8.0.31 TOP20 stability`로 커밋합니다.
6. `Push origin`을 실행합니다.
7. Vercel 자동 배포가 끝나면 `/api/version`을 확인합니다.

---

## 12. 운영 환경에서만 확인 가능한 항목

다음은 소스와 로컬 테스트만으로 확정할 수 없습니다.

- 현재 Upstash Redis에 남은 구 TOP30 실행 상태
- 이미 예약된 구버전 QStash 메시지 개수
- 실제 외부 검색·뉴스·YouTube API 응답 품질
- Vercel 운영 환경변수 설정 상태

v8.0.31은 구 실행의 안전한 재개를 차단하고 새 TOP20 실행만 허용하지만, 배포 후 관리자에서 기존 실행을 한 번 중단하는 절차가 필요합니다.
