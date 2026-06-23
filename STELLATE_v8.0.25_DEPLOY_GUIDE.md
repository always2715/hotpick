# STELLATE v8.0.25 배포 가이드

## 1. 배포 전

1. 운영 Upstash 백업
2. Vercel 환경변수 확인
3. 기존 TOP 갱신 실행이 진행 중이면 관리자에서 `현재 TOP 작업 중단`
4. 기존 공개 TOP은 삭제하지 않음

## 2. 테스트와 배포

```bash
npm ci --no-audit --no-fund
npm run test:v8
npm run build
vercel --prod
```

## 3. 버전 확인

`/api/version` 예상 핵심값:

```json
{
  "appVersion": "8.0.25",
  "contentVersion": 125,
  "trendCacheVersion": 46,
  "engine": "fixed-keyword-content-stop-control-v8025",
  "publicTopPolicy": "fixed_keyword_content_v15",
  "maxKeywordAttempts": 3,
  "maxRunSteps": 18,
  "maxRunMinutes": 60
}
```

## 4. 최초 실행

1. `TOP 미리 계산` 실행
2. 대표 키워드 30개 확인
3. `TOP 실제 적용` 또는 `TOP 즉시 시작`
4. 관리자 진행 상태 확인
5. 상세·피드·제목 30건 준비 후 공개 확인

이전 버전에서 시작한 실패 실행보다 새 실행을 권장합니다.

## 5. 중단 방법

관리자 화면의 다음 위치에서 중단할 수 있습니다.

- 빠른 작업: `현재 TOP 작업 중단`
- 실행 이력 행: `작업 중단`

중단 요청 시:

- 실행 상태가 `stop_requested`로 변경
- 처리 중인 한 소작업이 응답 또는 제한시간 종료 후 중단
- 다음 QStash 배치 미실행
- 최종 원자적 공개 미실행
- 기존 공개 TOP 유지

## 6. 자동 중단

- 키워드 최대 3회
- 실행 최대 18단계
- 실행 최대 60분

자동 제한에 걸리면 `stopped_timeout`으로 종료합니다.
