export const CATEGORIES = {
  entertainment: {
    label: '연예/문화',
    color: '#9F77DD',
    heroBg: 'linear-gradient(135deg,#EEEDFE 0%,#CEC6F6 50%,#AFA9EC 100%)',
    titleColor: '#26215C',
    metaColor: '#534AB7',
    keywords: ['콘서트','드라마','영화','아이돌','가수','배우','넷플릭스','공연','뮤지컬','팝업','축제','시상식'],
    prompt: (keyword, news) => `당신은 연예/문화 전문 블로거입니다.
키워드: "${keyword}"
관련 뉴스: ${news}

아래 조건으로 블로그 글을 작성하세요.
- 도입: 왜 지금 화제인지 (100자)
- 핵심 정보: 일정/장소/가격 등 실용 정보 (250자)
- 꿀팁: 독자에게 유용한 팁 3가지 (200자)
- 마무리: 한줄 정리 (50자)
- 소제목은 ## 마크다운 사용
- 절대 금지: "~해보겠습니다", "~알아보도록 하겠습니다"
- 총 분량: 700~1000자`,
  },
  sports: {
    label: '스포츠',
    color: '#1D9E75',
    heroBg: 'linear-gradient(135deg,#E1F5EE 0%,#9FE1CB 50%,#5DCAA5 100%)',
    titleColor: '#04342C',
    metaColor: '#0F6E56',
    keywords: ['축구','야구','농구','손흥민','월드컵','올림픽','경기','리그','선수','K리그','EPL','NBA'],
    prompt: (keyword, news) => `당신은 스포츠 전문 블로거입니다.
키워드: "${keyword}"
관련 뉴스: ${news}

아래 조건으로 블로그 글을 작성하세요.
- 도입: 경기/선수 현황 요약 (100자)
- 핵심 정보: 일정/결과/기록 (250자)
- 분석: 간단한 전망 또는 배경 (200자)
- 마무리: 한줄 정리 (50자)
- 소제목은 ## 마크다운 사용
- 절대 금지: 문어체, 과도한 감탄
- 총 분량: 700~1000자`,
  },
  tech: {
    label: 'IT/테크',
    color: '#378ADD',
    heroBg: 'linear-gradient(135deg,#E6F1FB 0%,#B5D4F4 50%,#85B7EB 100%)',
    titleColor: '#042C53',
    metaColor: '#185FA5',
    keywords: ['갤럭시','아이폰','AI','노트북','앱','삼성','애플','출시','스펙','업데이트','iOS','안드로이드'],
    prompt: (keyword, news) => `당신은 IT 전문 블로거입니다.
키워드: "${keyword}"
관련 뉴스: ${news}

아래 조건으로 블로그 글을 작성하세요.
- 도입: 제품/서비스 핵심 특징 요약 (100자)
- 핵심 스펙/기능 (250자)
- 구매/활용 팁 (200자)
- 마무리: 한줄 정리 (50자)
- 소제목은 ## 마크다운 사용
- 절대 금지: 문어체, 불필요한 수식어
- 총 분량: 700~1000자`,
  },
  economy: {
    label: '경제',
    color: '#BA7517',
    heroBg: 'linear-gradient(135deg,#FAEEDA 0%,#FAC775 50%,#EF9F27 100%)',
    titleColor: '#412402',
    metaColor: '#633806',
    keywords: ['주식','환율','부동산','금리','청약','코인','펀드','경제','물가','보험','재테크','투자'],
    prompt: (keyword, news) => `당신은 경제 전문 블로거입니다.
키워드: "${keyword}"
관련 뉴스: ${news}

아래 조건으로 블로그 글을 작성하세요.
- 도입: 현재 상황 요약 (100자)
- 핵심 수치/데이터 (250자)
- 전망 또는 주의사항 (200자)
- 마무리: 한줄 정리 (50자)
- 소제목은 ## 마크다운 사용
- 절대 금지: 투자 권유, 확정적 전망
- 총 분량: 700~1000자`,
  },
  travel: {
    label: '여행',
    color: '#D4537E',
    heroBg: 'linear-gradient(135deg,#FBEAF0 0%,#F4C0D1 50%,#ED93B1 100%)',
    titleColor: '#4B1528',
    metaColor: '#993556',
    keywords: ['여행','맛집','카페','숙소','제주','부산','서울','해외','휴가','관광','호텔','항공'],
    prompt: (keyword, news) => `당신은 여행/맛집 전문 블로거입니다.
키워드: "${keyword}"
관련 뉴스: ${news}

아래 조건으로 블로그 글을 작성하세요.
- 도입: 왜 지금 뜨는 장소/여행지인지 (100자)
- 핵심 정보: 위치/가격/운영시간 (250자)
- 추천 포인트 3가지 (200자)
- 마무리: 한줄 정리 (50자)
- 소제목은 ## 마크다운 사용
- 절대 금지: 문어체, 과도한 감탄
- 총 분량: 700~1000자`,
  },
  life: {
    label: '생활',
    color: '#639922',
    heroBg: 'linear-gradient(135deg,#EAF3DE 0%,#C0DD97 50%,#97C459 100%)',
    titleColor: '#173404',
    metaColor: '#3B6D11',
    keywords: ['다이어트','운동','피부','헬스','요리','청소','인테리어','건강','식단','패션','뷰티','육아'],
    prompt: (keyword, news) => `당신은 라이프스타일 전문 블로거입니다.
키워드: "${keyword}"
관련 뉴스: ${news}

아래 조건으로 블로그 글을 작성하세요.
- 도입: 왜 지금 관심받는지 (100자)
- 핵심 방법/정보 (250자)
- 실용 팁 3가지 (200자)
- 마무리: 한줄 정리 (50자)
- 소제목은 ## 마크다운 사용
- 절대 금지: 문어체, 근거없는 효능 주장
- 총 분량: 700~1000자`,
  },
  general: {
    label: '트렌드',
    color: '#888780',
    heroBg: 'linear-gradient(135deg,#F1EFE8 0%,#D3D1C7 50%,#B4B2A9 100%)',
    titleColor: '#2C2C2A',
    metaColor: '#5F5E5A',
    keywords: [],
    prompt: (keyword, news) => `당신은 트렌드 전문 블로거입니다.
키워드: "${keyword}"
관련 뉴스: ${news}

아래 조건으로 블로그 글을 작성하세요.
- 도입: 왜 지금 화제인지 (100자)
- 핵심 정보 (250자)
- 독자에게 유용한 팁 (200자)
- 마무리: 한줄 정리 (50자)
- 소제목은 ## 마크다운 사용
- 절대 금지: 문어체
- 총 분량: 700~1000자`,
  },
};

export function detectCategory(keyword) {
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (key === 'general') continue;
    if (cat.keywords.some((kw) => keyword.includes(kw))) return key;
  }
  return 'general';
}
