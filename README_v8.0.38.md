# STELLATE v8.0.38

STELLATE v8.0.38은 **TOP 선정·집계·승격·공개 로직을 그대로 유지**하면서 대표 이미지 선택만 `Unsplash 100개 사전 풀` 방식으로 분리한 버전입니다.

## 핵심 변경

- TOP/피드/상세/인스타 대표 이미지는 계속 Unsplash만 허용
- 공식 사이트·언론사·기사 OG·YouTube 썸네일은 대표 이미지에서 제외
- 콘텐츠 생성 시 개별 키워드로 Unsplash를 실시간 검색하지 않음
- 관리자에서 10개 카테고리 × 10개, 총 100개 풀을 한 번 구축해 Redis에 저장
- 콘텐츠 생성 완료 후 카테고리·분위기·소재·톤을 분석해 풀 내부에서만 점수 선택
- 최근 20개 사용 이미지와 동일 화면 중복 후보를 우선 제외
- 기존 콘텐츠의 정상 Unsplash 이미지와 관리자 수동 지정 이미지는 유지
- 신규 콘텐츠에만 자동 이미지를 배정
- 이미지 풀 조회·사용 이력 저장 실패는 콘텐츠 생성이나 TOP 공개 실패로 전파하지 않음
- 관리자에서 미리보기, 카테고리 필터, 분위기 제목·태그 수정, 활성/비활성화, 사용 횟수 확인, 콘텐츠 수동 고정 지원

## TOP 정책은 변경 없음

- 관심도 상대순위 상위 25개를 생성·검증 후보로 고정
- 성공 후보를 원래 `selectionRank` 순으로 정렬
- 성공 후보 상위 20개 공개
- 상위 후보 실패 시 21~25위 성공 후보 승격
- 성공 후보가 20개 미만이면 기존 TOP20 유지
- 이미지 점수·이미지 유무·Unsplash API 결과는 TOP 점수에 사용하지 않음

## 버전

- appVersion: 8.0.38
- contentVersion: 133
- trendCacheVersion: 52
- generationPoolCount: 25
- publicTopCount: 20
- thumbnailPoolSize: 100
- thumbnailPoolCategories: 10
- QStash dedupe: `update-trends-v837` 유지

## 배포 후 순서

1. Vercel 배포가 Ready인지 확인
2. `/api/version`에서 `appVersion 8.0.38`, `thumbnailRankingIsolation true` 확인
3. 관리자 → `썸네일 이미지` → `100개 풀 구축` 실행
4. 자동 1차 검수된 표본을 확인하고 부적합 이미지는 비활성화 또는 메타데이터 수정
5. 이후 신규 콘텐츠부터 사전 풀 이미지가 자동 배정되는지 확인

v8.0.37 TOP 엔진과 Redis namespace는 변경하지 않았으므로 기존 정상 공개 TOP을 삭제하거나 Redis를 초기화하지 않습니다. 진행 중인 v8.0.37 TOP 실행도 이미지 변경만으로 중단할 필요가 없습니다.

## 검증 결과

- `npm run test:v8`: PASS
- JavaScript/MJS `node --check`: PASS
- `npm run build`: PASS
- 빌드 산출물 `next start -p 3210`: 정상 시작
- `/api/version`: HTTP 200

## 정직한 운영 한계

실제 Unsplash 사진 100건은 운영 `UNSPLASH_ACCESS_KEY`가 있어야 관리자 구축 작업으로 채워집니다. 이 배포본에는 100개 내부 슬롯·분류·점수·관리 기능이 포함되어 있지만, 사진 파일 자체를 번들에 포함하거나 서비스 스토리지 WebP로 미리 저장하지 않았습니다. 현재 구현은 Unsplash CDN URL과 출처 메타데이터를 Redis에 보존합니다.

새 채팅에서는 `STELLATE_PROJECT_HANDOFF_v8.0.38.txt`를 먼저 읽어 전체 프로젝트 상태를 파악하세요.
