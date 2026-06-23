# STELLATE v8.0.26 관리자 로그인 500 복구판

## 직접 원인

`POST /api/admin/login`은 정상적으로 200을 반환하고 세션 쿠키도 발급했지만, 로그인 후 이동하는 `/admin`의 서버 렌더링에서 정의되지 않은 `<Stat>` 컴포넌트를 호출해 아래 오류가 발생했습니다.

```text
ReferenceError: Stat is not defined
```

같은 관리자 파일에서 `ManageRow`, `AuditRow`, `InstagramCard`도 사용만 되고 정의가 빠져 있어, 첫 화면을 복구해도 TOP 관리·피드 관리·인스타·변경 이력 탭에서 추가 오류가 발생할 수 있는 상태였습니다.

## 수정 사항

- `Stat` 관리자 현황 카드 복구
- `ManageRow` TOP·피드 관리 행 복구
- `AuditRow` 관리자 변경 이력 표시 복구
- `InstagramCard` 인스타 카드 미리보기·저장 대상 복구
- 관리자 SSR 데이터 조회를 fail-safe 방식으로 변경
- Redis 또는 일부 조회가 지연·실패해도 `/admin` 전체가 500으로 종료되지 않도록 안전 모드 추가
- 관리자 페이지 입력 배열 기본값 처리
- 앱 버전 `8.0.26` 반영
- 콘텐츠 버전은 `125` 유지하여 기존 콘텐츠 재생성·캐시 초기화를 방지
- 관리자 컴포넌트 누락 재발 방지 테스트 추가

## 배포

기존 v8.0.25 프로젝트를 이 전체본으로 교체하고 기존 Vercel 환경변수를 그대로 유지한 뒤 배포합니다.

필수 관리자 환경변수:

```text
ADMIN_PASSWORD
SESSION_SECRET
```

기존 Redis namespace와 데이터는 변경하지 않습니다.

## 확인 방법

1. `/api/version`에서 `appVersion: 8.0.26` 확인
2. `/admin-login`에서 로그인
3. 로그인 후 `/admin`이 HTTP 200으로 열리는지 확인
4. 현황·TOP 관리·피드 관리·인스타·변경 이력 탭 확인

## 로컬 검증 결과

- 로그인 API: 200
- 관리자 세션 쿠키 발급: 정상
- 로그인 후 `/admin`: 200
- `ReferenceError: Stat is not defined`: 재현되지 않음
- 정의되지 않은 관리자 JSX 컴포넌트 검사: 통과
