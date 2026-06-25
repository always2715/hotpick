# STELLATE v8.0.48

STELLATE 최신 전체 소스입니다.

이번 버전은 TOP25 생성 후보에 잘린 기사 문구·편집 라벨이 들어가고, `INSUFFICIENT_KEYWORD_EVIDENCE`가 1회 만에 영구 실패하며, 실패 전에 실행별 stage·snapshot·slug alias가 남지 않던 문제를 수정했습니다.

핵심 변경:
- 명백한 문장 조각과 `기자수첩·사설·칼럼` 형태를 TOP25 고정 전에 제외
- 제외된 자리에는 관심도 상대순위의 다음 정상 후보를 승격해 25개 풀 유지
- 출처 제목은 사실 근거가 아니라 대표 엔티티를 찾는 검색 힌트로만 사용
- 독립 조사 후 대표 엔티티를 다시 검증해 공개 키워드 확정
- `INSUFFICIENT_KEYWORD_EVIDENCE`를 제한된 확장 조사 재시도 대상으로 변경
- 근거 부족 실패 전에도 stage·snapshot·slug alias 체크포인트 저장
- 문장 조각이 들어 있는 과거 고정 후보 풀은 관리자 재개를 차단하고 새 실행 안내

TOP25 상대순위 → 성공 후보 TOP20 공개, 누적 피드, 피드 최소 1,000자·약 5,000자 권장, TOP 요약 최대 1,000자, NEW·유지·순위변동, Unsplash 500개 풀 정책은 유지합니다.

GitHub Desktop 적용에는 `STELLATE_v8.0.48_REPLACE_ONLY.zip`을 사용하고 전체를 저장소 최상위에 덮어쓴 뒤 `APPLY_STELLATE_v8.0.48_CLEANUP.bat`을 실행하십시오.
