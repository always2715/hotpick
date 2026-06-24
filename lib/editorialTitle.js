function stripHtml(value='') {
  return String(value||'')
    .replace(/<[^>]*>/g,' ')
    .replace(/&quot;/g,'"')
    .replace(/&amp;/g,'&')
    .replace(/&#39;/g,"'")
    .replace(/\s+/g,' ')
    .trim();
}

const GENERIC_SHORT_TITLES = new Set([
  '최근 이슈','최근 소식','최신 소식','새 소식','현재 상황','주요 상황','최근 상황',
  '공식 발표','주요 발표','관련 발표','관련 소식','핵심 변화','주요 변화','상태 변화',
  '수치 변화','시장 가격 변동','가격 변동','주가 변동','시장 동향','최근 동향','주요 동향',
  '최근 흐름','핵심 내용 확인','확인된 사실','주요 내용 공개','핵심 사실 공개','핵심 내용',
  '관련 내용','사건 정리','이슈 정리','향후 전망','관심 증가','화제 집중','반응 확산',
  '업데이트','주요 이슈','실시간 이슈','종합 정리'
]);

const VAGUE_EVENT_TITLES = new Set([
  '입장 발표','입장 공개','활동 정보','주요 활동','기본정보 공개','내용 공개','관련 입장','정책 입장',
  '질문 답변','공식 답변','주요 발언','일정 발표','계획 발표','정보 공개','현황 공개'
]);

const GENERIC_KEYWORDS = new Set([
  '뉴스','속보','이슈','화제','논란','사건','사고','정보','소식','현재','상황','공식','발표',
  '변화','동향','전망','순위','검색어','오늘','실시간','최신','관련','주요','핵심'
]);

const PARTICLE_SUFFIXES = [
  '으로부터','에서부터','에게서는','한테서는','이라고','이라는','이라며','라고','라며',
  '에서는','에게서','한테서','으로는','로부터','으로서','으로써','까지는','부터는',
  '에게는','한테는','와의','과의','에도','에서','에게','한테','께서','으로','로는',
  '에는','보다','처럼','만큼','부터','까지','은','는','이','가','을','를','의','에','와','과','도','만'
];

const KEYWORD_BOUNDARIES = new Set([
  '주가','가격','시세','요금','환율','금리','매출','실적','영업이익','순이익','배당','투자','인수','합병',
  '출시','출시일','공개','발표','확정','결정','승인','선정','진출','결승','우승','승리','패배','탈락',
  '인상','인하','상승','하락','급등','급락','증가','감소','장애','오류','먹통','중단','종료','복구',
  '유출','해킹','수사','기소','판결','사과','해명','결혼','이혼','열애','임신','출산','복귀','은퇴',
  '입대','전역','이적','영입','계약','부상','결장','출전','득점','컴백','신곡','앨범','영화','드라마','출하','불신임','질문','답변','총장','나란히',
  '예고편','시청률','공연','콘서트','정책','법안','규제','시행','개정','날씨','태풍','폭우','폭설',
  '화재','폭발','사망','사고','이유','전망','정리','소식','상황','동향','논란','화제'
]);

// TOP 키워드는 기사 문구가 아니라 검색 가능한 대표 주체 하나만 저장합니다.
// 제품·작품명은 띄어쓰기가 있더라도 하나의 고유명사로 취급합니다.
const ENTITY_ROLE_PREFIXES = new Set([
  '가수','배우','방송인','개그맨','코미디언','모델','유튜버','크리에이터','작가','감독','선수','코치',
  '대통령','총리','장관','의원','시장','도지사','회장','대표','CEO','셰프','교수','박사','그룹','기업','회사','브랜드'
].map(value=>value.toLowerCase()));

const ENTITY_TRAILING_NOISE = new Set([
  ...KEYWORD_BOUNDARIES,
  '전국투어','투어','팬미팅','예매','티켓','일정','장소','근황','입장','거취','보도','인터뷰','차기작','주연','출하','불신임','질문','답변','총장','나란히',
  '신제품','신형','차세대','신작','서비스','기능','혜택','판매','예약','사전예약','사전예매','행사','무대','활동',
  '알아보기','관련','공식','최근','오늘','이번','새','새로운','최신','핵심','주요'
].map(value=>value.toLowerCase()));

const PRODUCT_ROOTS = new Set([
  '아이폰','아이패드','맥북','아이맥','에어팟','애플워치','비전프로',
  '갤럭시','플레이스테이션','엑스박스','닌텐도','테슬라','제네시스','그랜저','쏘나타','아이오닉','EV'
].map(value=>value.toLowerCase()));

const PRODUCT_MODEL_TOKENS = new Set([
  'z','s','a','m','프로','pro','맥스','max','울트라','ultra','플러스','plus','미니','mini','에어','air',
  '폴드','fold','플립','flip','노트','note','엣지','edge','라이트','lite','시리즈','series'
].map(value=>value.toLowerCase()));

const GENERIC_ENTITY_SINGLES = new Set([
  '지하철','버스','철도','공항','날씨','공연','콘서트','축제','영화','드라마','앨범','서비스','제품','스마트폰',
  '자동차','전기차','주식','금리','환율','정책','요금','경기','대회','선수','가수','배우','방송','무대','합동'
].map(value=>value.toLowerCase()));

function isNoiseEntityToken(value='') {
  const token=stripParticle(String(value||'').toLowerCase());
  return !token||ENTITY_ROLE_PREFIXES.has(token)||ENTITY_TRAILING_NOISE.has(token)||GENERIC_KEYWORDS.has(token);
}

function stripEntityRolePrefix(tokens=[]) {
  const rows=[...tokens];
  while(rows.length>1&&ENTITY_ROLE_PREFIXES.has(stripParticle(rows[0]).toLowerCase()))rows.shift();
  return rows;
}

function stripEntityTrailingNoise(tokens=[]) {
  const rows=[...tokens];
  while(rows.length>1&&ENTITY_TRAILING_NOISE.has(stripParticle(rows.at(-1)).toLowerCase()))rows.pop();
  return rows;
}

function normalizeEntityTokens(tokens=[]) {
  return stripEntityTrailingNoise(stripEntityRolePrefix(tokens.map(token=>String(token||'').trim()).filter(Boolean)))
    .filter(token=>!['및','그리고','또는','혹은','대','vs','VS'].includes(token));
}

function isProductKeywordTokens(tokens=[]) {
  if(!tokens.length)return false;
  const lowered=tokens.map(token=>token.toLowerCase());
  if(!lowered.some(token=>PRODUCT_ROOTS.has(token)))return false;
  if(tokens.length===1)return true;
  return lowered.slice(1).every(token=>PRODUCT_MODEL_TOKENS.has(token)||/^\d+[a-z]*$/i.test(token)||/^[a-z]\d+$/i.test(token));
}

function productKeywordFragments(tokens=[]) {
  const out=[];
  for(let index=0;index<tokens.length;index++){
    if(!PRODUCT_ROOTS.has(tokens[index].toLowerCase()))continue;
    const product=[tokens[index]];
    for(let cursor=index+1;cursor<tokens.length&&product.length<4;cursor++){
      const token=tokens[cursor];
      const lowered=token.toLowerCase();
      if(ENTITY_TRAILING_NOISE.has(stripParticle(lowered))||ENTITY_ROLE_PREFIXES.has(lowered))break;
      if(PRODUCT_MODEL_TOKENS.has(lowered)||/^\d+[a-z]*$/i.test(token)||/^[a-z]\d+$/i.test(token))product.push(token);
      else break;
    }
    if(product.length)out.push(product.join(' '));
  }
  return out;
}

function splitEntitySegments(value='') {
  return cleanHeadline(value)
    .replace(/\s+(?:및|그리고|또는|혹은|vs\.?|대)\s+/gi,' | ')
    .replace(/\s*[,&/＋+]\s*/g,' | ')
    .split('|').map(segment=>segment.trim()).filter(Boolean);
}

function atomicEntityPenalty(keyword='',contexts=[]) {
  const tokens=tokenize(keyword);
  if(tokens.length<=1||isProductKeywordTokens(tokens))return 0;
  const normalized=normalizeForCompare(keyword);
  const exactMentions=(contexts||[]).filter(context=>normalizeForCompare(context).includes(normalized)).length;
  const individual=tokens.map(token=>(contexts||[]).filter(context=>normalizeForCompare(context).includes(normalizeForCompare(token))).length);
  // 두 독립 주체를 기사 앞부분에서 단순 결합한 문자열은 대표 키워드로 사용하지 않습니다.
  if(exactMentions===0&&individual.filter(count=>count>0).length>=2)return 24;
  return 0;
}

const ACTION_ALIASES = [
  {label:'발표',pattern:/발표(?:했|하|됐|되|한다|된다)?/},
  {label:'공개',pattern:/공개(?:했|하|됐|되|한다|된다)?/},
  {label:'확정',pattern:/확정(?:했|하|됐|되|한다|된다)?|결정(?:했|하|됐|되)|승인(?:했|하|됐|되)|선정(?:됐|되)/},
  {label:'출시',pattern:/출시(?:했|하|됐|되|한다|된다)?|발매(?:했|하|됐|되)/},
  {label:'시행',pattern:/시행(?:했|하|됐|되|한다|된다)?|도입(?:했|하|됐|되)/},
  {label:'개편',pattern:/개편(?:했|하|됐|되)?|개정(?:했|하|됐|되)|변경(?:했|하|됐|되)/},
  {label:'진출',pattern:/진출(?:했|하|됐|되)?|결승행|본선행/},
  {label:'우승',pattern:/우승(?:했|하|확정|했다|한다)?/},
  {label:'승리',pattern:/승리(?:했|하|했다|한다)?|제압(?:했|하)/},
  {label:'패배',pattern:/패배(?:했|하|했다|한다)?|탈락(?:했|하|됐다|된다)?/},
  {label:'득점',pattern:/득점(?:했|하|했다|한다)?|골을?\s*(?:기록|성공)/},
  {label:'인상',pattern:/인상(?:했|하|됐|되|한다|된다)?|상향(?:했|하|됐|되)/},
  {label:'인하',pattern:/인하(?:했|하|됐|되|한다|된다)?|하향(?:했|하|됐|되)/},
  {label:'상승',pattern:/상승(?:했|하|됐다|된다)?|급등(?:했|하|했다)?|올랐|증가(?:했|하|했다)?/},
  {label:'하락',pattern:/하락(?:했|하|됐다|된다)?|급락(?:했|하|했다)?|내렸|감소(?:했|하|했다)?/},
  {label:'중단',pattern:/중단(?:했|하|됐|되|한다|된다)?|중지(?:했|하|됐|되)/},
  {label:'종료',pattern:/종료(?:했|하|됐|되|한다|된다)?|폐지(?:했|하|됐|되)/},
  {label:'복구',pattern:/복구(?:했|하|됐|되|한다|된다)?|정상화(?:됐|되|했다|한다)/},
  {label:'장애 발생',pattern:/장애가?\s*(?:발생|확인)|접속\s*(?:오류|불가)|먹통/},
  {label:'유출',pattern:/유출(?:됐|되|했|하|발생)?|노출(?:됐|되|했|하)|탈취(?:됐|되|했|하)/},
  {label:'해킹',pattern:/해킹(?:됐|되|당했|발생)?|침해(?:됐|되|사고)/},
  {label:'수사 착수',pattern:/수사에?\s*(?:착수|돌입)|조사에?\s*(?:착수|돌입)|압수수색/},
  {label:'기소',pattern:/기소(?:됐|되|했|하)|송치(?:됐|되|했|하)/},
  {label:'판결',pattern:/판결(?:했|하|나왔|선고)|선고(?:됐|되|했|하)/},
  {label:'계약 체결',pattern:/계약을?\s*(?:체결|맺)|협약을?\s*(?:체결|맺)|제휴(?:했|하|됐다|된다)/},
  {label:'투자 확대',pattern:/투자를?\s*(?:확대|늘리|추진)|출자를?\s*(?:확대|추진)/},
  {label:'인수',pattern:/인수(?:했|하|됐다|된다)|합병(?:했|하|됐다|된다)/},
  {label:'사임',pattern:/사임(?:했|하|했다)|사퇴(?:했|하|했다)|퇴진(?:했|하|했다)/},
  {label:'취임',pattern:/취임(?:했|하|했다)|선임(?:됐|되|했다)|임명(?:됐|되|했다)/},
  {label:'복귀',pattern:/복귀(?:했|하|했다|한다)|재합류(?:했|하|했다)/},
  {label:'이적',pattern:/이적(?:했|하|했다|한다)|영입(?:됐|되|했다)/},
  {label:'연기',pattern:/연기(?:됐|되|했|하)|일정이?\s*(?:변경|미뤄)/},
  {label:'취소',pattern:/취소(?:됐|되|했|하)|철회(?:됐|되|했|하)/},
  {label:'임신 발표',pattern:/임신(?:을|이|한)?\s*(?:발표|공개|확인)|임신\s*소식/},
  {label:'출산 발표',pattern:/출산(?:을|이|한)?\s*(?:발표|공개|확인)|출산\s*소식/},
  {label:'결혼 발표',pattern:/결혼(?:을|이|한)?\s*(?:발표|공개|확인)|결혼\s*소식/},
  {label:'열애 인정',pattern:/열애(?:를|를?\s*)?(?:인정|발표|공개|확인)/},
  {label:'은퇴 발표',pattern:/은퇴(?:를|를?\s*)?(?:발표|선언|공개)/},
];

const FILLER_WORDS = new Set([
  '직접','관련','대한','이번','해당','최근','현재','주요','공식','사실','소식','내용','입장',
  '것으로','통해','위해','놓고','두고','전격','새로운','새','추가','처음','다시','결국'
]);

function normalizeForCompare(value='') {
  return stripHtml(value).toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
}

function stripParticle(value='') {
  let token=String(value||'').trim();
  for(const suffix of PARTICLE_SUFFIXES){
    if(token.length>suffix.length+1&&token.endsWith(suffix)){
      token=token.slice(0,-suffix.length);
      break;
    }
  }
  return token;
}

function tokenize(value='') {
  return stripHtml(value).toLowerCase().replace(/[^0-9a-z가-힣+._-\s]/g,' ')
    .split(/\s+/).map(stripParticle).filter(Boolean);
}

function meaningfulTokens(value='') {
  return tokenize(value).filter(token=>token.length>1&&!FILLER_WORDS.has(token)&&!GENERIC_KEYWORDS.has(token));
}

function jaccardSimilarity(a='',b='') {
  const left=new Set(meaningfulTokens(a));
  const right=new Set(meaningfulTokens(b));
  if(!left.size||!right.size)return 0;
  let common=0;left.forEach(token=>{if(right.has(token))common+=1;});
  return common/new Set([...left,...right]).size;
}

function longestCommonSubstringRatio(a='',b='') {
  const left=normalizeForCompare(a),right=normalizeForCompare(b);
  if(!left||!right)return 0;
  const row=new Array(right.length+1).fill(0);let best=0;
  for(let i=1;i<=left.length;i++){
    let diagonal=0;
    for(let j=1;j<=right.length;j++){
      const saved=row[j];
      row[j]=left[i-1]===right[j-1]?diagonal+1:0;
      if(row[j]>best)best=row[j];
      diagonal=saved;
    }
  }
  return best/Math.min(left.length,right.length);
}

function cleanHeadline(value='') {
  return stripHtml(value)
    .replace(/^\s*[\[【](?:속보|단독|종합|영상|포토|전문|인터뷰)[^\]】]*[\]】]\s*/,' ')
    .replace(/[“”"'‘’]/g,' ')
    .replace(/…+|\.{2,}/g,' ')
    .replace(/\s+[\-–—|｜:]\s+[^\-–—|｜:]{2,30}$/,' ')
    .replace(/^(?:오늘|어제|내일|이번|최근)\s+/,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function keywordFragments(value='') {
  const out=[];
  const push=value=>{
    const text=cleanHeadline(value).replace(/\s+/g,' ').trim();
    if(text&&!out.includes(text))out.push(text);
  };
  for(const segment of splitEntitySegments(value)){
    const text=segment.replace(/\s+·\s+.*/,'').trim();
    if(!text)continue;
    const words=text.split(/\s+/)
      .map(word=>word.replace(/^[^0-9a-zA-Z가-힣+._-]+|[^0-9a-zA-Z가-힣+._-]+$/g,''))
      .filter(Boolean);
    if(!words.length)continue;
    let boundary=words.length;
    for(let index=0;index<words.length;index++){
      const token=stripParticle(words[index]).toLowerCase();
      const numericFragment=(index===0&&/^\d+(?:[.,]\d+)*$/i.test(token))||/^\d+(?:[.,]\d+)*(?:%|퍼센트|포인트|원|달러|위|세|개월|경기|점|승|패)$/i.test(token);
      const sentenceFragment=/(?:했다|한다|됐다|된다|입니다|합니다|인가요|일까요|오른|내린|올랐|내렸|답하는|질문하는|앞둔|나란히|만에|개월만)$/.test(token);
      if(KEYWORD_BOUNDARIES.has(token)||ENTITY_TRAILING_NOISE.has(token)||numericFragment||sentenceFragment){
        boundary=index;
        break;
      }
    }
    const entityWords=normalizeEntityTokens(words.slice(0,boundary));
    if(!entityWords.length)continue;

    // 제품·작품의 모델명은 중간에서 잘라 쓰지 않고 완성형 후보를 우선합니다.
    for(const product of productKeywordFragments(entityWords))push(product);

    push(entityWords.join(' '));
    if(entityWords.length>=3&&!isProductKeywordTokens(entityWords))push(entityWords.slice(0,2).join(' '));
    for(const token of entityWords){
      if(!isNoiseEntityToken(token)&&stripParticle(token).length>=2)push(stripParticle(token));
    }
  }
  return out.filter(Boolean);
}

export function validateEditorialKeyword(value='') {
  const keyword=cleanHeadline(value).replace(/\s+·\s+.*/,'').trim();
  const reasons=[];
  const tokens=tokenize(keyword);
  if(!keyword)reasons.push('empty');
  if(keyword.length<2)reasons.push('too_short');
  if(keyword.length>30)reasons.push('too_long');
  if(tokens.length<1||tokens.length>4)reasons.push('token_count');
  if(GENERIC_KEYWORDS.has(keyword.toLowerCase()))reasons.push('generic_keyword');
  if(/[·|｜,/&+]|\s(?:및|그리고|또는|혹은|vs\.?|대)\s/i.test(keyword))reasons.push('multiple_entities');
  if(tokens.some(token=>ENTITY_ROLE_PREFIXES.has(token.toLowerCase())))reasons.push('role_prefix');
  if(tokens.some((token,index)=>index>0&&ENTITY_TRAILING_NOISE.has(token.toLowerCase())))reasons.push('event_mixed');
  if(/^\d+$/.test(keyword))reasons.push('numeric_only');
  if(/[!?]/.test(keyword)||/(?:입니다|합니다|했습니다|됩니다|됐습니다|인가요|일까요|이유|정리|전망)$/.test(keyword))reasons.push('sentence_like');
  const stripped=tokens.map(stripParticle);
  if(stripped.length&&stripped.every(token=>KEYWORD_BOUNDARIES.has(token)||GENERIC_KEYWORDS.has(token)))reasons.push('event_only');
  return {valid:reasons.length===0,keyword,reasons};
}

const INVALID_TOP_LEADING = /^(?:나란히|연속|질문(?:에|을)?|답하는|오른|내린|앞둔|무려|결국|단독|속보)(?:\s|$)/;
const NUMERIC_MARKET_FRAGMENT = /^\d+(?:[.,]\d+)*(?:%|퍼센트|포인트|원|달러|위|점)?(?:\s|$)/i;
const GENERIC_ACTOR_ADJECTIVE_FRAGMENT = /^(?:여야|여당|야당|정부|당국|업계|시장|전문가|관계자|정치권|노사|양측)\s+[가-힣A-Za-z0-9-]+(?:적|적인|관련|대한|놓고|두고|앞두고)$/;

export function validateTopCandidateKeyword(value='') {
  const base=validateEditorialKeyword(value);
  const reasons=[...base.reasons];
  const keyword=base.keyword;
  const opens=(keyword.match(/[([{【]/g)||[]).length;
  const closes=(keyword.match(/[)\]}】]/g)||[]).length;
  if(opens!==closes)reasons.push('unbalanced_bracket');
  if(NUMERIC_MARKET_FRAGMENT.test(keyword))reasons.push('numeric_headline_fragment');
  if(INVALID_TOP_LEADING.test(keyword))reasons.push('leading_sentence_fragment');
  if(GENERIC_ACTOR_ADJECTIVE_FRAGMENT.test(keyword))reasons.push('generic_actor_adjective_fragment');
  if(/(?:오른|내린|올랐|내렸|답하는|질문하는|앞둔|나란히|개월만|경기만|전에는\s*꼭|징벌적)$/.test(keyword))reasons.push('trailing_sentence_fragment');
  const tokens=tokenize(keyword);
  const meaningful=tokens.filter(token=>/[가-힣a-zA-Z]/.test(token)&&!GENERIC_KEYWORDS.has(token.toLowerCase())&&!KEYWORD_BOUNDARIES.has(stripParticle(token).toLowerCase()));
  if(tokens.length&&meaningful.length===0)reasons.push('no_entity_token');
  return {valid:reasons.length===0,keyword,reasons:[...new Set(reasons)]};
}

function factRows(ledger={}) {
  return Array.isArray(ledger?.facts)?ledger.facts.filter(fact=>fact&&fact.text):[];
}

function candidateSupport(value='',contexts=[]) {
  const normalized=normalizeForCompare(value);
  if(!normalized)return 0;
  let score=0;
  for(const context of contexts){
    const source=normalizeForCompare(context);
    if(!source)continue;
    if(source.includes(normalized))score+=3;
    else {
      const tokens=meaningfulTokens(value);
      const sourceTokens=new Set(meaningfulTokens(context));
      const common=tokens.filter(token=>sourceTokens.has(token)||[...sourceTokens].some(other=>other.includes(token)||token.includes(other))).length;
      if(common>=Math.min(2,tokens.length))score+=1;
    }
  }
  return score;
}

export function resolveEditorialKeyword(input={}) {
  const ledger=input.ledger||input.factLedger||{};
  const facts=factRows(ledger);
  const sourceTitles=Array.isArray(input.sourceTitles)?input.sourceTitles:[];
  const detailText=String(input.detailContent||'');
  const candidates=[];
  const push=(value,source,base)=>{
    for(const fragment of keywordFragments(value)){
      const quality=validateEditorialKeyword(fragment);
      if(!quality.valid)continue;
      candidates.push({keyword:quality.keyword,source,base});
    }
  };
  push(input.topKeyword,'topKeyword',70);
  push(input.keyword,'keyword',60);
  push(input.rawKeyword,'rawKeyword',50);
  push(input.displayTitle,'displayTitle',35);
  for(const term of input.candidateTerms||[])push(term,'candidateTerm',45);
  for(const fact of facts){
    const subject=stripHtml(fact.subject||'');
    if(subject&&subject.length>=2)push(subject,'factSubject',62+(fact.status==='confirmed'?8:0));
  }
  const contexts=[...facts.map(fact=>fact.text),detailText,...sourceTitles].filter(Boolean);
  const scored=candidates.map(row=>{
    const tokenCount=tokenize(row.keyword).length;
    const support=candidateSupport(row.keyword,contexts);
    let score=row.base+Math.min(24,support*4)-Math.max(0,tokenCount-2)*4-Math.max(0,row.keyword.length-16)*0.8;
    if(tokenCount===2)score+=3;
    if(/^[A-Z0-9][A-Z0-9+._-]*$/i.test(row.keyword))score+=4;
    if(/[가-힣a-zA-Z]+\s*\d+$/.test(row.keyword))score+=3;
    return {...row,score,support};
  }).sort((a,b)=>b.score-a.score||b.support-a.support||a.keyword.length-b.keyword.length);
  const winner=scored[0];
  return winner
    ? {ok:true,keyword:winner.keyword,source:winner.source,score:Number(winner.score.toFixed(2)),candidates:scored.slice(0,10)}
    : {ok:false,keyword:'',source:'unresolved',score:0,candidates:[]};
}


export function resolveTop30Keyword(input={}) {
  const sourceTitles=(Array.isArray(input.sourceTitles)?input.sourceTitles:[]).map(stripHtml).filter(Boolean).slice(0,12);
  const contexts=[...sourceTitles,...(Array.isArray(input.contexts)?input.contexts:[])].filter(Boolean);
  const candidates=[];
  const add=(value,source,base)=>{
    for(const fragment of keywordFragments(value)){
      const quality=validateTopCandidateKeyword(fragment);
      if(!quality.valid)continue;
      const tokens=tokenize(quality.keyword);
      const support=candidateSupport(quality.keyword,contexts);
      const titleMentions=sourceTitles.filter(title=>normalizeForCompare(title).includes(normalizeForCompare(quality.keyword))).length;
      let score=base+Math.min(35,support*5)+Math.min(24,titleMentions*8);
      if(source==='rawKeyword'||source==='keyword')score-=support===0?16:0;
      if(source==='sourceTitle')score+=titleMentions>=2?14:0;
      if(tokens.length===1)score+=quality.keyword.length>=3?8:-8;
      if(tokens.length===1&&GENERIC_ENTITY_SINGLES.has(tokens[0].toLowerCase()))score-=28;
      if(tokens.length===2)score+=3;
      if(tokens.length===2&&GENERIC_ENTITY_SINGLES.has(tokens[1].toLowerCase()))score+=10;
      if(tokens.length>3)score-=10;
      if(quality.keyword.length>18)score-=8;
      if(KEYWORD_BOUNDARIES.has(tokens.at(-1)))score-=22;
      if(/(?:관련|소식|이유|전망|정리|상황|동향|알아보기)$/.test(quality.keyword))score-=30;
      if(/^[A-Z0-9][A-Z0-9+._-]*$/i.test(quality.keyword))score+=5;
      if(/[가-힣a-zA-Z]+\s*\d+$/.test(quality.keyword))score+=5;
      if(isProductKeywordTokens(tokens))score+=12+Math.max(0,tokens.length-1)*4;
      score-=atomicEntityPenalty(quality.keyword,contexts);
      candidates.push({keyword:quality.keyword,source,score,support,titleMentions,product:isProductKeywordTokens(tokens)});
    }
  };
  add(input.topKeyword,'topKeyword',58);
  add(input.keyword,'keyword',54);
  add(input.rawKeyword,'rawKeyword',46);
  for(const term of input.candidateTerms||[])add(term,'candidateTerm',50);
  for(const title of sourceTitles)add(title,'sourceTitle',42);
  // 같은 제품명의 중간 조각(예: '갤럭시 Z')보다 완성형 모델명(예: '갤럭시 Z 폴드')을 선택합니다.
  for(const row of candidates){
    for(const other of candidates){
      if(row===other)continue;
      const left=normalizeForCompare(row.keyword),right=normalizeForCompare(other.keyword);
      const completeNamedPhrase=other.product||other.titleMentions>=2;
      if(completeNamedPhrase&&left&&right.startsWith(left)&&right!==left&&other.titleMentions>=row.titleMentions&&other.support>=row.support){
        row.score-=14;
        other.score+=6;
      }
    }
  }
  const dedup=new Map();
  for(const row of candidates){
    const key=normalizeForCompare(row.keyword);
    const old=dedup.get(key);
    if(!old||row.score>old.score)dedup.set(key,row);
  }
  const scored=[...dedup.values()].sort((a,b)=>b.score-a.score||b.titleMentions-a.titleMentions||b.support-a.support||a.keyword.length-b.keyword.length);
  const winner=scored[0];
  if(winner)return {ok:true,keyword:winner.keyword,source:winner.source,score:Number(winner.score.toFixed(2)),candidates:scored.slice(0,12)};
  const fallback=resolveEditorialKeyword(input);
  const fallbackQuality=validateTopCandidateKeyword(fallback.keyword||'');
  return fallback.ok&&fallbackQuality.valid
    ? {...fallback,keyword:fallbackQuality.keyword}
    : {ok:false,keyword:'',source:'unresolved',score:0,candidates:scored.slice(0,12),reasons:fallbackQuality.reasons};
}

function removeKeywordFromText(value='',keyword='') {
  let text=stripHtml(value).replace(/\s+/g,' ').trim();
  const normalizedKeyword=stripHtml(keyword).replace(/\s+/g,' ').trim();
  if(normalizedKeyword){
    const escaped=normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    text=text.replace(new RegExp(`${escaped}(?:은|는|이|가|을|를|의|와|과|에게|에서|으로|로)?`,'gi'),' ');
  }
  return text.replace(/^[·|｜,:\-\s]+|[.!?]+$/g,'').replace(/\s+/g,' ').trim();
}

function canonicalEventObject(value='',keyword='') {
  const text=removeKeywordFromText(value,keyword)
    .replace(/[“”"'‘’]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  if(!text)return '';

  // 공연·예매처럼 자주 등장하는 복합 사건은 조사·접속사를 제거한 자연스러운 제목으로 먼저 정규화합니다.
  const location=(text.match(/([가-힣A-Za-z0-9]{2,12})\s*(?:공연|콘서트)/)||[])[1]||'';
  if(/(?:공연|콘서트)/.test(text)&&/예매/.test(text)&&/(?:일정|시작일|오픈|개시)/.test(text)){
    return `${location?`${location} `:''}공연 예매 일정`.trim();
  }
  if(/(?:공연|콘서트)/.test(text)&&/(?:일정|날짜|개최일)/.test(text)){
    return `${location?`${location} `:''}공연 일정`.trim();
  }
  if(/(?:공연|콘서트)/.test(text)&&/(?:장소|공연장)/.test(text)){
    return `${location?`${location} `:''}공연 장소 안내`.trim();
  }
  return '';
}

function normalizeObject(value='',keyword='') {
  const canonical=canonicalEventObject(value,keyword);
  if(canonical)return canonical;
  let text=removeKeywordFromText(value,keyword)
    .replace(/\([^)]{0,80}\)/g,' ')
    .replace(/\[[^\]]{0,80}\]/g,' ')
    .replace(/(?:에\s*)?(?:관한|대한)\s+/g,' ')
    .replace(/(?:관련한|관련된)\s+/g,' ')
    .replace(/(?:소식|사실|내용|입장)(?:을|를|이|가|은|는)?/g,' ')
    .replace(/(?:직접|전격|공식적으로|처음으로|최종적으로)/g,' ')
    .replace(/\s+/g,' ').trim();
  let tokens=text.split(/\s+/).map(token=>token.replace(/(?:은|는|이|가|을|를|의|에|에서|으로|로|와|과)$/,'')).filter(Boolean);
  tokens=tokens.filter(token=>!FILLER_WORDS.has(token)&&!['관한','대한','관련한','관련된'].includes(token));
  if(tokens.length>4)tokens=tokens.slice(-4);
  text=tokens.join(' ')
    .replace(/(?:셋째|둘째|첫째|넷째|다섯째)\s+아이\s+(임신|출산)/,'$&')
    .replace(/(첫째|둘째|셋째|넷째|다섯째)\s+아이\s+/,'$1 ')
    .replace(/\s+/g,' ').trim();
  return text;
}

function compactEventPhrase(object='',action='',keyword='') {
  let left=normalizeObject(object,keyword);
  if(/(?:공개되지|밝혀지지|확정되지|정해지지|알려지지|않았|아니다)/.test(`${object} ${action}`))return '';
  if(action==='임신 발표'){
    const ordinal=(left.match(/(?:첫째|둘째|셋째|넷째|다섯째|\d+째)/)||[])[0]||'';
    return `${ordinal?`${ordinal} `:''}임신 발표`.trim();
  }
  if(action==='출산 발표'){
    const ordinal=(left.match(/(?:첫째|둘째|셋째|넷째|다섯째|\d+째)/)||[])[0]||'';
    return `${ordinal?`${ordinal} `:''}출산 발표`.trim();
  }
  if(action==='결혼 발표'||action==='열애 인정'||action==='은퇴 발표')return action;
  if(!left)return '';
  if(action==='확정'&&/(진출|출연|출시|개봉|방영|우승|합류|이적|계약)$/.test(left))return `${left} 확정`;
  if(action==='발표'&&/(임신|출산|결혼|은퇴|계획|실적|정책|일정)$/.test(left))return `${left} 발표`;
  if(action==='공개'&&/(임신|출산|결혼|일정|명단|신작|제품|서비스|기능|영상|예고편)$/.test(left))return `${left} 공개`;
  if(action==='장애 발생'&&/장애$/.test(left))return `${left} 발생`;
  return `${left} ${action}`.replace(/\s+/g,' ').trim();
}

function findActionMatches(value='') {
  const text=stripHtml(value);
  const matches=[];
  for(const row of ACTION_ALIASES){
    const regex=new RegExp(row.pattern.source,row.pattern.flags.includes('g')?row.pattern.flags:`${row.pattern.flags}g`);
    let match;
    while((match=regex.exec(text))){
      matches.push({index:match.index,length:match[0].length,label:row.label,raw:match[0]});
      if(regex.lastIndex===match.index)regex.lastIndex+=1;
    }
  }
  return matches.sort((a,b)=>a.index-b.index||b.length-a.length);
}

function cleanShortTitle(value='',keyword='') {
  let title=removeKeywordFromText(value,keyword)
    .replace(/^(?:관련|대한|이번|해당|최근|현재|주요|공식)\s+/,'')
    .replace(/[“”"'‘’]/g,'')
    .replace(/\s+/g,' ').trim();
  if(title.includes(' · '))title=title.split(' · ').at(-1).trim();
  if(title.length>18){
    const tokens=title.split(/\s+/);
    while(tokens.length>1&&tokens.join(' ').length>18)tokens.shift();
    title=tokens.join(' ').slice(0,18).trim();
  }
  return title;
}

export function extractEventPhraseFromText(value='',keyword='') {
  const text=removeKeywordFromText(value,keyword)
    .replace(/^[^,:]{1,30}(?:기자|특파원)\s*[=:,-]?\s*/,'')
    .replace(/\s+/g,' ').trim();
  if(!text||/(?:공개되지|밝혀지지|확정되지|정해지지|알려지지|않았|아니다)/.test(text))return '';
  const matches=findActionMatches(text);
  for(const action of matches){
    const sentenceStart=Math.max(text.lastIndexOf('.',action.index-1),text.lastIndexOf('?',action.index-1),text.lastIndexOf('!',action.index-1),text.lastIndexOf(',',action.index-1),text.lastIndexOf('·',action.index-1))+1;
    const before=text.slice(sentenceStart,action.index).trim();
    const phrase=cleanShortTitle(compactEventPhrase(before,action.label,keyword),keyword);
    const quality=validateEditorialEventTitle(phrase,{keyword});
    if(quality.valid)return quality.event;
  }
  return '';
}

function titleSimilarToSource(keyword='',event='',sourceTitles=[]) {
  const candidate=`${keyword} ${event}`.trim();
  const normalizedCandidate=normalizeForCompare(candidate);
  if(!normalizedCandidate)return false;
  return (Array.isArray(sourceTitles)?sourceTitles:[]).some(source=>{
    const normalizedSource=normalizeForCompare(source);
    if(!normalizedSource)return false;
    const lengthRatio=Math.min(normalizedCandidate.length,normalizedSource.length)/Math.max(normalizedCandidate.length,normalizedSource.length);
    if(normalizedCandidate===normalizedSource)return true;
    const containment=(normalizedSource.includes(normalizedCandidate)||normalizedCandidate.includes(normalizedSource))&&lengthRatio>=0.88;
    const tokenScore=jaccardSimilarity(candidate,source);
    const substringScore=longestCommonSubstringRatio(candidate,source);
    return containment||(lengthRatio>=0.76&&tokenScore>=0.84)||(lengthRatio>=0.72&&substringScore>=0.93);
  });
}

export function validateEditorialEventTitle(value='',options={}) {
  const keyword=String(options.keyword||'').trim();
  const event=cleanShortTitle(value,keyword);
  const reasons=[];
  if(!event)reasons.push('empty');
  if(event.length<4)reasons.push('too_short');
  if(event.length>18)reasons.push('too_long');
  if(GENERIC_SHORT_TITLES.has(event))reasons.push('generic_event');
  if(VAGUE_EVENT_TITLES.has(event)||/^(?:입장|내용|정보|활동|계획|일정|정책)\s*(?:발표|공개|확인|정보)?$/.test(event))reasons.push('vague_event');
  if(/^(?:현재|최근|주요|공식|관련|핵심)\s*(?:상황|소식|내용|동향|발표|이슈|변화|흐름)?$/.test(event))reasons.push('generic_pattern');
  if(/[.!?]/.test(event)||/(?:입니다|합니다|했습니다|됩니다|됐습니다|인가요|일까요)$/.test(event))reasons.push('sentence_like');
  if(keyword&&normalizeForCompare(event)===normalizeForCompare(keyword))reasons.push('same_as_keyword');
  if(titleSimilarToSource(keyword,event,options.sourceTitles||[]))reasons.push('source_title_similarity');
  const hasAction=ACTION_ALIASES.some(row=>row.label===event||event.endsWith(row.label)||row.pattern.test(event));
  if(!hasAction)reasons.push('missing_action');
  return {valid:reasons.length===0,event,reasons};
}

function flattenPackageText(pkg={}) {
  const values=[pkg.summary,pkg.why,pkg.intro?.text,...(pkg.points||[])];
  for(const section of pkg.sections||[]){
    for(const paragraph of section?.paragraphs||[])values.push(typeof paragraph==='string'?paragraph:paragraph?.text);
  }
  for(const row of pkg.qa||[])values.push(row?.a);
  return values.map(stripHtml).filter(Boolean).join(' ');
}

function eventSupportScore(event='',keyword='',detailContent='',facts=[]) {
  const tokens=meaningfulTokens(event).filter(token=>!ACTION_ALIASES.some(row=>row.label===token));
  const contexts=[detailContent,...facts.map(fact=>fact.text)].filter(Boolean);
  if(!contexts.length)return 0;
  let best=0;
  for(const context of contexts){
    const contextTokens=new Set(meaningfulTokens(context));
    const overlap=tokens.filter(token=>contextTokens.has(token)||[...contextTokens].some(other=>other.includes(token)||token.includes(other))).length;
    const actionSupported=ACTION_ALIASES.some(row=>(event.endsWith(row.label)||row.label===event)&&row.pattern.test(context));
    const score=(tokens.length?overlap/tokens.length:0)+(actionSupported?0.6:0)+(normalizeForCompare(context).includes(normalizeForCompare(event))?0.5:0);
    if(score>best)best=score;
  }
  return best;
}

function candidateRowsFromDetail(detailContent='',keyword='') {
  const sentences=stripHtml(detailContent).split(/(?<=[.!?다요])\s+|\n+/).map(value=>value.trim()).filter(Boolean);
  return sentences.slice(0,80).map(text=>extractEventPhraseFromText(text,keyword)).filter(Boolean);
}

function verifiedFixedKeyword(keyword='',ledger={},sourceTitles=[],options={}) {
  const base=cleanHeadline(keyword).slice(0,30);
  const contexts=[...factRows(ledger).map(fact=>fact.text),...(Array.isArray(sourceTitles)?sourceTitles:[]),String(options.detailContent||'')].filter(Boolean);
  const baseQuality=validateTopCandidateKeyword(base);
  const baseSupport=candidateSupport(base,contexts);
  const resolved=resolveEditorialKeyword({
    topKeyword:base,keyword:base,rawKeyword:options.rawKeyword||base,displayTitle:options.displayTitle||'',
    candidateTerms:options.candidateTerms||[],ledger,detailContent:options.detailContent||'',sourceTitles,
  });
  const candidate=cleanHeadline(resolved.keyword||'').slice(0,30);
  const candidateQuality=validateTopCandidateKeyword(candidate);
  const candidateSupportScore=candidateSupport(candidate,contexts);
  const baseKey=normalizeForCompare(base),candidateKey=normalizeForCompare(candidate);
  const isSafeSimplification=Boolean(candidateKey&&baseKey&&baseKey!==candidateKey&&(baseKey.includes(candidateKey)||candidateKey.includes(baseKey)));
  if((!baseQuality.valid&&candidateQuality.valid)||(candidateQuality.valid&&isSafeSimplification&&candidateSupportScore>=Math.max(2,baseSupport+1))){
    return {ok:true,keyword:candidate,source:'post_research_verified_keyword',support:candidateSupportScore,originalKeyword:base};
  }
  return {ok:Boolean(base&&baseQuality.valid),keyword:base,source:'fixed_ranked_keyword_verified',support:baseSupport,originalKeyword:base,reasons:baseQuality.reasons};
}

export function derivePostResearchTitle(keyword='',pkg={},ledger={},sourceTitles=[],options={}) {
  const facts=factRows(ledger);
  const detailContent=String(options.detailContent||flattenPackageText(pkg));
  const keywordResult=options.fixedKeyword===true
    ? verifiedFixedKeyword(keyword,ledger,sourceTitles,{...options,detailContent})
    : resolveEditorialKeyword({
      topKeyword:pkg.topKeyword||keyword,
      keyword,
      rawKeyword:options.rawKeyword||keyword,
      displayTitle:options.displayTitle||'',
      candidateTerms:options.candidateTerms||[],
      ledger,
      detailContent,
      sourceTitles,
    });
  const selectedKeyword=keywordResult.keyword||cleanHeadline(keyword).slice(0,30);
  const candidates=[];
  const add=(value,source,base,fact=null)=>{
    const comparisonTitles=source==='fact_ledger_fallback'?[]:sourceTitles;
    const quality=validateEditorialEventTitle(value,{keyword:selectedKeyword,sourceTitles:comparisonTitles});
    if(!quality.valid)return;
    const support=eventSupportScore(quality.event,selectedKeyword,detailContent,facts);
    if(support<0.55)return;
    const specificTokens=meaningfulTokens(quality.event).filter(token=>!['입장','내용','정보','활동','계획','일정','관련','주요'].includes(token));
    if(!specificTokens.length)return;
    const confirmedBonus=fact&&(fact.status==='confirmed'||['official','authorized'].includes(String(fact.sourceType||'')))?24:0;
    const issueBonus=fact&&String(fact.scope||'issue')==='issue'?12:0;
    const numericBonus=/\d/.test(quality.event)?4:0;
    candidates.push({event:quality.event,source,factId:fact?.id||'',score:base+support*20+confirmedBonus+issueBonus+numericBonus});
  };

  add(pkg.shortTitle||pkg.coreEvent||'','ai_after_detail',88,null);
  for(const value of candidateRowsFromDetail(detailContent,selectedKeyword))add(value,'detail_content',100,null);
  for(const fact of facts.filter(fact=>fact.status==='confirmed'||['official','authorized'].includes(String(fact.sourceType||''))))add(extractEventPhraseFromText(fact.text,selectedKeyword),'fact_ledger_fallback',118,fact);
  for(const fact of facts.filter(fact=>fact.status!=='confirmed'&&!['official','authorized'].includes(String(fact.sourceType||''))))add(extractEventPhraseFromText(fact.text,selectedKeyword),'fact_ledger_fallback',82,fact);

  candidates.sort((a,b)=>b.score-a.score||a.event.length-b.event.length);
  const winner=candidates[0]||null;
  if(!winner){
    return {
      topKeyword:selectedKeyword,
      topTopic:'',shortTitle:'',topTitle:'',displayTitle:selectedKeyword,
      titleStatus:facts.length?'review_required':'pending_content',titleReady:false,titleSource:'unresolved',
      titleValidationReasons:[facts.length?'구체적인 핵심 사건을 추출하지 못했습니다.':'Fact Ledger와 상세 콘텐츠가 준비되지 않았습니다.'],
      keywordSource:keywordResult.source||'unresolved',keywordCandidates:keywordResult.candidates||[],
    };
  }
  const topTitle=`${selectedKeyword} · ${winner.event}`.replace(/\s+/g,' ').trim().slice(0,64);
  return {
    topKeyword:selectedKeyword,topTopic:winner.event,shortTitle:winner.event,topTitle,displayTitle:topTitle,
    titleStatus:'ready',titleReady:true,titleSource:winner.source,titleValidationReasons:[],titleEvidenceFactIds:winner.factId?[winner.factId]:[],
    keywordSource:keywordResult.source||'unresolved',keywordCandidates:keywordResult.candidates||[],keywordVerification:{support:Number(keywordResult.support||0),originalKeyword:keywordResult.originalKeyword||keyword},
  };
}
