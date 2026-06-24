const commonPrompt = (keyword, news, categoryLabel) => `당신은 모바일 뉴스·트렌드 콘텐츠 에디터입니다.
주제: "${keyword}"
분류: ${categoryLabel}
확인된 최신 자료:\n${news}

작성 원칙:
- 제공된 최신 자료에 있는 사실만 사용하세요.
- 웹에서 처음 이 주제를 본 사람도 바로 이해할 수 있게 쉬운 존댓말로 쓰세요.
- 보고서·공문체, 상투적인 도입, 불필요한 결론은 피하세요.
- 문단은 2~3문장으로 짧게 작성하세요.
- 확인되지 않은 원인·전망·수치·과거 사실은 추가하지 마세요.
- 표가 꼭 필요한 경우가 아니면 자연스러운 문장과 짧은 목록을 사용하세요.
- 전체 본문은 공백 포함 최소 1,000자 이상 작성하세요. 확인 자료가 충분하면 약 5,000자를 권장하되, 자료가 적으면 같은 사실을 반복하거나 일반론을 추가해 억지로 늘리지 마세요.
- 기사별 내용을 단순 나열하지 말고, 여러 출처에서 공통으로 확인되는 사실을 묶어 독자가 이해하기 쉬운 흐름으로 재구성하세요.
- 각 문단에는 새로운 정보가 있어야 하며 같은 의미를 표현만 바꿔 반복하지 마세요.
- 첫 문단은 핵심 사건을 바로 설명하고, "최근 화제가 되고 있습니다" 같은 빈 문장으로 시작하지 마세요.
- 출처에서 확인된 사실과 아직 확인되지 않은 부분을 명확히 구분하세요.
- 마지막 문단은 뻔한 감상이나 요약 반복 대신, 독자가 앞으로 확인해야 할 일정·발표·쟁점을 정리하세요.

고정 목차를 억지로 맞추지 말고, 자료에 맞춰 아래 중 필요한 섹션 3~4개만 선택하세요.
## 지금 관심받는 이유
## 무슨 일이 있었나요?
## 이것만 알아두세요
## 숫자·일정으로 보기
## 앞으로 확인할 점

각 섹션 제목은 내용에 맞게 더 자연스럽게 바꿔도 됩니다.`;

export const CATEGORIES = {
  entertainment: {
    label: '연예/문화', color: '#9F77DD', heroBg: 'linear-gradient(135deg,#EEEDFE,#AFA9EC)', titleColor: '#26215C', metaColor: '#534AB7', emoji: '🎤',
    keywords: ['아이돌','가수','배우','연예인','방송인','드라마','영화','콘서트','공연','뮤지컬','앨범','컴백','데뷔','티저','예고편','팬미팅','결혼','열애','출연','캐스팅','넷플릭스','티빙','웨이브','디즈니플러스','BTS','블랙핑크','뉴진스','에스파','아이브','트와이스','세븐틴','NCT','정연'],
    prompt: (keyword, news) => commonPrompt(keyword, news, '연예/문화'),
  },
  sports: {
    label: '스포츠', color: '#1D9E75', heroBg: 'linear-gradient(135deg,#E1F5EE,#5DCAA5)', titleColor: '#04342C', metaColor: '#0F6E56', emoji: '⚽',
    keywords: ['축구','야구','농구','배구','테니스','골프','수영','육상','태권도','e스포츠','월드컵','올림픽','챔피언스리그','프리미어리그','EPL','K리그','KBO','NBA','MLB','경기','결승','우승','득점','선발','트레이드','이적','감독','선수','구자욱','손흥민','이강인','김민재','오타니'],
    prompt: (keyword, news) => commonPrompt(keyword, news, '스포츠'),
  },
  tech: {
    label: 'IT/테크', color: '#378ADD', heroBg: 'linear-gradient(135deg,#E6F1FB,#85B7EB)', titleColor: '#042C53', metaColor: '#185FA5', emoji: '📱',
    keywords: ['갤럭시','아이폰','아이패드','맥북','스마트폰','노트북','반도체','GPU','CPU','NPU','앱','소프트웨어','업데이트','iOS','안드로이드','윈도우','출시','베타','클라우드','사이버보안','해킹','데이터센터','로봇','전기차','배터리','BYD','비야디','엔비디아','인텔','퀄컴','TSMC'],
    prompt: (keyword, news) => commonPrompt(keyword, news, 'IT/테크'),
  },
  ai: {
    label: 'AI', color: '#6C5CE7', heroBg: 'linear-gradient(135deg,#F0EDFF,#B8AEFF)', titleColor: '#2D235F', metaColor: '#5B4FC4', emoji: '✨',
    keywords: ['AI','인공지능','챗GPT','ChatGPT','Claude','Gemini','Copilot','생성형 AI','LLM','딥러닝','머신러닝','오픈AI','OpenAI','앤트로픽'],
    prompt: (keyword, news) => commonPrompt(keyword, news, 'AI'),
  },
  economy: {
    label: '경제', color: '#BA7517', heroBg: 'linear-gradient(135deg,#FAEEDA,#EF9F27)', titleColor: '#412402', metaColor: '#633806', emoji: '📈',
    keywords: ['주식','코스피','코스닥','나스닥','ETF','채권','코인','비트코인','부동산','아파트','청약','분양','전세','금리','환율','물가','GDP','상장','IPO','공모주','대출','배당','시장','기업','그룹','삼성그룹','삼성전자','현대차','금융','은행','보험'],
    prompt: (keyword, news) => commonPrompt(keyword, news, '경제'),
  },
  travel: {
    label: '여행', color: '#D4537E', heroBg: 'linear-gradient(135deg,#FBEAF0,#ED93B1)', titleColor: '#4B1528', metaColor: '#993556', emoji: '✈️',
    keywords: ['여행','관광','호텔','리조트','항공','비행기','공항','휴가','투어','맛집','제주','부산','경주','강릉','속초','전주','여수','일본','도쿄','오사카','교토','미국','유럽','크로아티아','태국','베트남','대만'],
    prompt: (keyword, news) => commonPrompt(keyword, news, '여행'),
  },
  life: {
    label: '생활', color: '#639922', heroBg: 'linear-gradient(135deg,#EAF3DE,#97C459)', titleColor: '#173404', metaColor: '#3B6D11', emoji: '🌿',
    keywords: ['건강','운동','다이어트','병원','약','날씨','폭염','태풍','미세먼지','요리','레시피','육아','교육','학교','수능','취업','이직','쇼핑','패션','반려동물','생활','지원금','연휴'],
    prompt: (keyword, news) => commonPrompt(keyword, news, '생활'),
  },
  politics: {
    label: '정치/사회', color: '#C0392B', heroBg: 'linear-gradient(135deg,#FDECEA,#EC8F87)', titleColor: '#4A0F0A', metaColor: '#922B21', emoji: '🏛️',
    keywords: ['대통령','국회','정부','정당','여당','야당','장관','의원','선거','정책','법안','검찰','경찰','법원','판결','재판','명예훼손','외교','국방','북한','사건','사고','범죄','재난','화재','폭발','실종','사망','시위','구속','수사','기소'],
    prompt: (keyword, news) => commonPrompt(keyword, news, '정치/사회'),
  },
  general: {
    label: '트렌드', color: '#888780', heroBg: 'linear-gradient(135deg,#F1EFE8,#B4B2A9)', titleColor: '#2C2C2A', metaColor: '#5F5E5A', emoji: '🔥', keywords: [],
    prompt: (keyword, news) => commonPrompt(keyword, news, '트렌드'),
  },
};

function normalize(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function detectCategoryDetailed(keyword, context = '') {
  const haystack = normalize(`${keyword} ${context}`);
  const scores = {};
  for (const [key, category] of Object.entries(CATEGORIES)) {
    if (key === 'general') continue;
    let score = 0;
    const matched = [];
    for (const token of category.keywords) {
      const normalizedToken = normalize(token);
      if (!normalizedToken || !haystack.includes(normalizedToken)) continue;
      const keywordMatch = normalize(keyword).includes(normalizedToken);
      score += keywordMatch ? 4 : 2;
      matched.push(token);
    }
    scores[key] = { score, matched };
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const [bestKey, best] = sorted[0] || ['general', { score: 0, matched: [] }];
  const second = sorted[1]?.[1]?.score || 0;
  const confidence = best.score <= 0 ? 0 : Math.min(0.99, 0.45 + best.score * 0.07 + Math.max(0, best.score - second) * 0.04);
  if (best.score < 2 || confidence < 0.58) {
    return { category: 'general', confidence: Math.max(0.35, confidence), reason: '분류 근거가 충분하지 않아 트렌드로 분류' };
  }
  return { category: bestKey, confidence, reason: `${best.matched.slice(0, 3).join(', ')} 관련 표현 확인` };
}

export function detectCategory(keyword, context = '') {
  return detectCategoryDetailed(keyword, context).category;
}
