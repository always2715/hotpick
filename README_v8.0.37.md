# STELLATE v8.0.37

## 핵심 변경

### Unsplash 전용 대표 이미지
- TOP, 피드, 상세, 인스타 카드 대표 이미지는 Unsplash만 사용합니다.
- 공식 사이트, 언론사, YouTube 썸네일은 대표 이미지로 사용하지 않습니다.
- 저장된 과거 이미지가 비-Unsplash이면 새 공개 데이터에서 제거합니다.
- Unsplash 키가 없거나 검색 결과가 없으면 카테고리 색상·아이콘 fallback을 표시합니다.

### 카테고리 기반 이미지 선택
- 검색어에 개별 인물명, 기업명, 상품명, 기사 제목을 넣지 않습니다.
- 연예/문화, 스포츠, IT/테크, AI, 경제, 여행, 생활, 정치/사회, 트렌드별 고정 검색어 세트를 사용합니다.
- 같은 카테고리 안에서도 4개 검색어를 안정적으로 순환하고 같은 실행에서는 동일 사진 ID를 중복 사용하지 않습니다.

### 관련 영상
- 관련 영상 링크, 제목, 채널, 날짜는 유지합니다.
- 공개 화면에서는 YouTube 썸네일을 렌더링하지 않고 재생 아이콘형 카드만 표시합니다.

## 버전
- appVersion: 8.0.37
- contentVersion: 133
- trendCacheVersion: 52
- generationPoolCount: 25
- publicTopCount: 20
- QStash dedupe: update-trends-v837

## 배포 후
1. `/api/version`에서 8.0.37, contentVersion 133, trendCacheVersion 52 확인
2. 이전 실행 중단
3. 새 TOP 작업 실행
4. 새 TOP/피드/상세 대표 이미지가 `images.unsplash.com`인지 확인
5. 비-Unsplash 이미지가 남으면 해당 항목을 재생성하거나 새 TOP 공개 완료 후 재확인
