# STELLATE v8.0.30 — TOP 즉시 중단 및 피드 표시 복구

## 버전

- appVersion: `8.0.30`
- contentVersion: `126`
- trendCacheVersion: `46`
- Redis namespace: `stellate:v7` 유지

## 수정 목적

1. 관리자 화면에서 현재 진행 중인 TOP 갱신을 확실하게 중단할 수 있게 합니다.
2. 상세 콘텐츠가 공개되어 있는데도 `/feed` 목록이 0건으로 보이는 문제를 복구합니다.
3. 피드 인덱스 오류가 빈 배열로 조용히 숨겨져 원인을 찾기 어려웠던 문제를 개선합니다.

## 확인된 문제점

### 1. 기존 중단은 요청 상태에 머물 수 있었음

기존 중단 처리는 `stop_requested`를 저장한 뒤 실행 작업이 다음 확인 지점에 도달하기를 기다리는 구조였습니다. 활성 실행 ID가 풀렸거나 QStash 전달이 지연된 경우 관리자 화면에서 중단 여부가 명확하지 않고, 실행 상태가 오래 남을 수 있었습니다.

### 2. 피드 목록이 인덱스에 과도하게 의존함

공개 상세 콘텐츠는 Redis `content:*`에 정상 저장돼 있어도 피드 Hash/ZSET 인덱스가 누락되거나 오래된 상태면 목록이 비어 보일 수 있었습니다.

### 3. 피드 조회 오류가 빈 배열로 숨겨짐

Redis 피드 조회 중 오류가 발생하면 오류 원인 없이 `[]`가 반환되는 경로가 있어, 화면에서는 단순히 “자료 없음”으로만 보일 수 있었습니다.

### 4. 관리자 피드 재구성이 실제 표시 건수를 확인하지 않음

피드 인덱스를 썼다는 것만으로 복구 성공으로 판단할 수 있고, 실제 `/feed` 조회에서 몇 건이 보이는지까지 검증하지 않았습니다.

## TOP 작업 중지 개선

관리자 `현황 → 빠른 작업`에 실행 중인 작업이 있을 때 다음 버튼이 표시됩니다.

```text
현재 TOP 작업 중단 (즉시)
```

버튼을 누르면:

1. 활성 실행 ID 또는 진행 중 실행 ID를 정확히 선택
2. 실행 상태를 `stop_requested`로 기록
3. 대기·처리·추가검색 작업을 `stopped`로 전환
4. 실행 상태를 즉시 `cancelled`로 확정
5. 활성 실행 잠금 해제
6. 다음 QStash 배치 시작 차단
7. 최종 TOP30 공개 차단
8. 기존 공개 TOP30 유지
9. 관리자 감사 이력 저장

이미 시작된 외부 HTTP/API 호출 자체는 네트워크 수준에서 즉시 종료되지 않을 수 있습니다. 다만 반환된 결과는 저장·공개에 사용하지 않고, 다음 배치와 최종 공개는 차단합니다.

## 피드 복구 개선

피드 읽기 순서는 다음과 같습니다.

```text
피드 인덱스 조회
→ 인덱스 자동 점검·복구
→ 여전히 0건이면 공개 상세 콘텐츠 원본 직접 조회
→ 목록용 피드 데이터 재구성
→ 실제 표시 건수 검증
```

### 공개 원본 fallback

피드 인덱스가 손상돼도 다음 조건을 만족하는 공개 상세 콘텐츠에서 목록을 직접 만듭니다.

- 상세 콘텐츠 준비 완료
- `status=published`
- `hidden_feed`, `private`, `trashed`가 아님
- 공개 품질 조건 통과
- 피드 제목과 요약 준비 완료

### compact feed record 표시 수정

목록용 피드 객체에는 상세 본문 전체가 없어도 됩니다. 다음 플래그가 정상이라면 피드 목록에서 표시합니다.

- `hasContent=true`
- `publicReady=true`
- `feedReady=true`
- `status=published`
- 제목·요약 존재

### 관리자 피드 재구성

관리자 `현황 → 빠른 작업`의 다음 버튼을 사용합니다.

```text
현재 TOP 피드 목록 재구성
```

이 작업은:

- 현재 TOP30 상세 원본 기준으로 피드 Hash/ZSET 인덱스를 강제 재작성
- 최신순·게시번호·조회수·카테고리 인덱스 복구
- 각 항목 저장 후 재검증
- 실제 피드 표시 건수 확인
- 상세 콘텐츠가 없는 항목만 별도 생성 큐 등록

정상 상세 콘텐츠가 있는 경우 AI를 다시 호출하지 않습니다.

## 피드 API 진단값

`GET /api/feed` 응답에 다음 필드가 추가·유지됩니다.

```json
{
  "items": [],
  "total": 0,
  "recovered": false,
  "errorCode": ""
}
```

- `recovered=true`: 인덱스 복구 또는 공개 원본 fallback으로 목록을 복구함
- `FEED_INDEX_FALLBACK`: 인덱스 조회 실패 후 원본 콘텐츠로 반환함
- `FEED_READ_FAILED`: 인덱스와 공개 원본 조회 모두 실패함

## 주요 변경 파일

- `lib/feedIndexPolicy.js`
- `lib/kv.js`
- `lib/jobs.js`
- `lib/trendRefreshJob.js`
- `pages/admin.js`
- `pages/api/admin-action.js`
- `pages/api/admin/status.js`
- `pages/api/feed.js`
- `pages/api/version.js`
- `styles/globals.css`
- `tests/v8030-stop-and-feed-recovery.test.mjs`
- `package.json`
- `package-lock.json`

## 테스트 결과

- `npm run test:v8030`: 통과
- `npm run test:v8`: 전체 통과
- `npm run build`: 통과
- Next.js 14.2.35 production build: 성공
- `/admin`, `/feed`, `/api/feed`, `/api/admin-action`, `/api/admin/status`, `/api/version`: 빌드 성공

테스트 중 표시되는 `MODULE_TYPELESS_PACKAGE_JSON`은 Node의 성능 경고이며 테스트 실패가 아닙니다.

## 배포

```powershell
Expand-Archive -Path ".\STELLATE_v8.0.30_FULL.zip" `
  -DestinationPath ".\STELLATE_v8.0.30" -Force

cd ".\STELLATE_v8.0.30\STELLATE_v8.0.30_FULL"

npm install
npm run test:v8030
npm run build
vercel --prod
```

## 배포 후 순서

1. `https://stellate.co.kr/api/version`에서 `appVersion: 8.0.30` 확인
2. 관리자 페이지 새로고침
3. 이전 TOP 작업이 남아 있으면 `현재 TOP 작업 중단 (즉시)` 실행
4. `현재 TOP 피드 목록 재구성` 한 번 실행
5. `/feed`와 `/api/feed?page=1&limit=40`에서 표시 건수 확인
6. 이후 새 TOP 작업 실행

Redis `FLUSHALL`, namespace 변경, 현재 공개 TOP 수동 삭제는 하지 않습니다.

## 운영 환경에서만 확인 가능한 부분

현재 운영 Redis의 실제 인덱스 손상 범위와 남아 있는 QStash 예약 메시지 수는 로컬 소스만으로 확인할 수 없습니다. v8.0.30은 해당 상태에서도 중단 플래그와 공개 원본 fallback으로 안전하게 동작하도록 수정한 버전입니다.
