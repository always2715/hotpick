import Parser from 'rss-parser';
import { detectCategoryDetailed } from './categories.js';
import { evaluateTrendCandidate, tokenSimilarity, articleSignatureSet } from './rankingEngine.js';
import { researchCandidateRejectionReasons, researchCandidateEntryRejectionReasons } from './trendSelectionPolicy.js';
import { selectStableTop30 } from './top30Selection.js';
import { resolveEditorialKeyword, resolveTop30Keyword } from './editorialTitle.js';
import { PUBLIC_TOP_COUNT } from './topConfig.js';

export const TOP_TARGET_COUNT = PUBLIC_TOP_COUNT;
export const TOP_RESEARCH_POOL_LIMIT = 120;
export const TOP_DISCOVERY_POOL_LIMIT = 240;

const NAVER_NEWS_DISCOVERY_QUERIES = [
  { key:'breaking', query:'속보', categoryHint:'general' },
  { key:'politics', query:'정치', categoryHint:'politics' },
  { key:'economy', query:'경제', categoryHint:'economy' },
  { key:'society', query:'사회', categoryHint:'general' },
  { key:'tech', query:'IT 과학', categoryHint:'tech' },
  { key:'life', query:'생활 문화', categoryHint:'life' },
  { key:'entertainment', query:'연예', categoryHint:'entertainment' },
  { key:'sports', query:'스포츠', categoryHint:'sports' },
];

const GOOGLE_NEWS_DISCOVERY_FEEDS = [
  { key:'headlines', categoryHint:'general', url:'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko' },
  { key:'nation', categoryHint:'politics', url:'https://news.google.com/rss/headlines/section/topic/NATION?hl=ko&gl=KR&ceid=KR:ko' },
  { key:'business', categoryHint:'economy', url:'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko' },
  { key:'technology', categoryHint:'tech', url:'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko' },
  { key:'entertainment', categoryHint:'entertainment', url:'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=ko&gl=KR&ceid=KR:ko' },
  { key:'sports', categoryHint:'sports', url:'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=ko&gl=KR&ceid=KR:ko' },
  { key:'science', categoryHint:'tech', url:'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=ko&gl=KR&ceid=KR:ko' },
  { key:'health', categoryHint:'life', url:'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=ko&gl=KR&ceid=KR:ko' },
];

const parser = new Parser({
  timeout: 8000,
  customFields: {
    item: [
      ['ht:approx_traffic', 'approxTraffic'],
      ['ht:picture', 'picture'],
      ['ht:picture_source', 'pictureSource'],
      ['ht:news_item', 'newsItems', { keepArray: true }],
    ],
  },
});

const STOP_WORDS = new Set(['속보','뉴스','오늘','영상','실시간','최신','공개','논란','화제','기자','관련','단독','발표','업데이트','확인','공식','발견','전문','전체','추가','기준','이후','이전','해당','내용','무료','할인','이벤트','광고','대한','통해','위한','에서','으로','한다','했다']);
const BLOCKED_WORDS = ['도박','불법','성인','야동','토토','베팅','카지노','포르노'];
const GENERIC_SINGLE_WORDS = new Set(['공장','순위','사건','사고','결과','경기','선수','배우','가수','기업','학교','병원','정부','날씨','여행','주식','영화','드라마','화재','폭발','논란','발표']);
const VIDEO_PATTERNS = [/official\s*(mv|video|audio|lyric)/gi,/\bMV\b/g,/\[MV\]/g,/music\s*video/gi,/lyric\s*video/gi,/\[LIVE\]/gi,/\[풀버전\]/g,/하이라이트/g,/Highlight/gi,/EP\.\d+/gi,/\d+화/g];
const SYNONYMS = { '아이폰17':'아이폰 17','iphone17':'아이폰 17','iphone 17':'아이폰 17','삼전':'삼성전자','sk하이닉스':'SK하이닉스','bts':'BTS','방탄소년단':'BTS','방탄':'BTS','blackpink':'블랙핑크','byd':'비야디' };

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}
function normalize(value = '') { return stripHtml(value).toLowerCase().replace(/[^0-9a-zㄱ-힣\s]/gi, ' ').replace(/\s+/g, ' ').trim(); }
function tokenize(value = '') {
  return normalize(value).split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token));
}
function tokenizeEntity(value = '') {
  return normalize(value).split(' ').filter(token => {
    if (!token || STOP_WORDS.has(token)) return false;
    if (/^[가-힣]+$/.test(token)) return token.length >= 1;
    return token.length > 1;
  });
}
function parseTraffic(text) {
  if (!text) return 500;
  const value = String(text).replace(/,/g, '').replace(/\+/g, '').trim();
  const number = parseFloat(value) || 500;
  if (/M|백만/i.test(value)) return number * 1000000;
  if (/K|천/i.test(value)) return number * 1000;
  if (/만/.test(value)) return number * 10000;
  return number;
}
function hoursSince(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0 ? Math.max(0, (Date.now() - time) / 3600000) : 999;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }


const TOP_INTENT_TOKEN_PATTERNS = [
  /^(출시|출시일|공개|업데이트|신제품|기능|서비스)$/,
  /^(경기|결과|점수|순위|중계|라인업|명단|출전|결장|부상|복귀|이적|영입|계약|재계약|은퇴|우승|득점|골)$/,
  /^(실적|매출|영업이익|순이익|주가|배당|투자|인수|합병|매각|수주|공시|가격|요금|할인|환율|금리)$/,
  /^(논란|사과|해명|입장|열애|결혼|이혼|컴백|앨범|신곡|공연|콘서트|예매|티켓|방송|드라마|영화|시청률|출연)$/,
  /^(정책|법안|규제|제도|시행|개정|지원금|세금|선거|투표)$/,
  /^(장애|오류|먹통|중단|해킹|랜섬웨어|유출|보안|취약점|사고|화재|폭발|지진|태풍|폭우|폭설|한파|폭염|날씨)$/,
];

const TOPIC_RULES = [
  { label:'보안 이슈', pattern:/해킹|랜섬웨어|개인정보\s*유출|정보\s*유출|침해\s*사고|취약점|보안\s*사고/, categories:['tech','ai'], minSupport:1 },
  { label:'서비스 장애', pattern:/서비스\s*장애|접속\s*(?:불가|오류)|먹통|시스템\s*오류|운영\s*중단/, categories:['tech','ai','economy'], minSupport:1 },
  { label:'사고 상황', pattern:/화재|폭발|붕괴|추락|충돌|사망|구조|대피|사고/, minSupport:1 },
  { label:'기상 상황', pattern:/태풍|폭우|호우|폭설|한파|폭염|지진|미세먼지|기상/, categories:['life'], minSupport:1 },
  { label:'수사·재판 진행', pattern:/수사|압수수색|기소|구속|재판|판결|혐의/, categories:['politics'], minSupport:1 },
  { label:'선거 진행 상황', pattern:/선거|투표|개표|당선|낙선/, categories:['politics'], minSupport:1 },
  { label:'정책 변화', pattern:/정책|법안|규제|제도|시행|개정|지원금|세금|기준금리/, categories:['politics','economy'], minSupport:1 },
  { label:'실적 발표', pattern:/실적|매출|영업이익|순이익|분기\s*(?:실적|매출)|공시/, categories:['economy','tech'], minSupport:1 },
  { label:'출시 일정', pattern:/출시일|출시\s*일정|사전\s*예약|신제품|제품\s*공개/, categories:['tech','ai','economy'], minSupport:1 },
  { label:'제품·서비스 변화', pattern:/출시|업데이트|기능\s*추가|서비스\s*개편/, categories:['tech','ai','economy'], minSupport:1 },
  { label:'시장·가격 변동', pattern:/주가|증시|코스피|코스닥|환율|가상자산|비트코인|이더리움|시가총액|목표가|시세|(?:가격|요금|구독료|판매가|출고가)\s*(?:인상|인하|상승|하락|변동)|급등|급락/, categories:['economy','tech'], minSupport:2, keywordSupport:true },
  { label:'사업 계획', pattern:/투자|인수|합병|매각|수주|협약|사업\s*계획/, categories:['economy','tech'], minSupport:1 },
  { label:'거취 변화', pattern:/이적|영입|재계약|계약\s*연장|방출|은퇴/, categories:['sports'], minSupport:1 },
  { label:'출전 상황', pattern:/부상|결장|복귀|출전|명단|라인업|선발\s*등판/, categories:['sports'], minSupport:1 },
  { label:'경기 결과', pattern:/승리|패배|무승부|득점|결승|준결승|우승|경기\s*결과|스코어|끝내기/, categories:['sports'], minSupport:1 },
  { label:'경기 활약', pattern:/등판|투구|세이브|홀드|탈삼진|호투|역투|활약|마무리\s*투수/, categories:['sports'], minSupport:1 },
  { label:'새 활동 소식', pattern:/컴백|앨범|신곡|뮤직비디오|공연|콘서트|팬미팅/, categories:['entertainment'], minSupport:1 },
  { label:'시청률 변화', pattern:/시청률.{0,12}(?:상승|하락|기록|최고|돌파)|자체\s*최고\s*시청률/, categories:['entertainment'], minSupport:1 },
  { label:'방송 내용 공개', pattern:/예고편|선공개|방송\s*예정|회차|에피소드|본방송|방영/, categories:['entertainment'], minSupport:1 },
  { label:'출연 소식', pattern:/캐스팅|출연\s*(?:확정|발표|합류)|주연\s*(?:확정|발탁)/, categories:['entertainment'], minSupport:1 },
  { label:'방송·작품 소식', pattern:/드라마|영화|예능|방송|시청률|캐스팅|출연|웹툰|웹소설/, categories:['entertainment'], minSupport:2, keywordSupport:true },
  { label:'공식 입장', pattern:/열애|결혼|이혼|논란|사과|해명|공식\s*입장/, categories:['entertainment','politics','sports'], minSupport:1 },
  { label:'이용 일정', pattern:/운항|항공|공항|입국|출국|비자|노선|여행/, categories:['life'], minSupport:1 },
];

const NEUTRAL_TOP_TOPIC_RULES = TOPIC_RULES;
const STANDARD_TOP_TOPICS = new Set(NEUTRAL_TOP_TOPIC_RULES.map(rule => rule.label).concat(['현재 상황']));
const GENERIC_TOPICS = new Set(['현재 상황','공식 발표','관련 소식','최근 이슈','새로운 소식','최신 소식','화제','관심 증가']);

function isTopIntentToken(token = '') {
  return TOP_INTENT_TOKEN_PATTERNS.some(pattern => pattern.test(token));
}

function normalizeTopPhrase(value = '', max = 24) {
  return cleanKeyword(value).replace(/[,:;!?"'“”‘’\[\](){}<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function longestCommonSubstringLength(a = '', b = '') {
  const left = normalize(a).replace(/\s+/g, '');
  const right = normalize(b).replace(/\s+/g, '');
  if (!left || !right) return 0;
  const prev = new Array(right.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= left.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= right.length; j++) {
      const saved = prev[j];
      prev[j] = left[i - 1] === right[j - 1] ? diagonal + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diagonal = saved;
    }
  }
  return best;
}

function looksLikeArticlePhrase(topic = '', sourceTitles = []) {
  if (!topic || STANDARD_TOP_TOPICS.has(topic)) return false;
  const normalizedTopic = normalize(topic);
  const topicTokens = tokenize(topic);
  if (!normalizedTopic || topicTokens.length < 2) return true;
  if (/속보|단독|전격|충격|결국|왜|무슨\s*일|밝혔|전했|보도|인터뷰|전문|총정리/.test(normalizedTopic)) return true;
  if (/[.!?]|[“”‘’"']/.test(topic) || /(?:다|요|습니다)$/.test(topic)) return true;
  return (sourceTitles || []).some(source => {
    const normalizedSource = normalize(source);
    if (!normalizedSource) return false;
    if (normalizedTopic.length >= 8 && normalizedSource.includes(normalizedTopic)) return true;
    const sourceTokens = new Set(tokenize(source));
    const overlap = topicTokens.filter(token => sourceTokens.has(token)).length / Math.max(1, topicTokens.length);
    if (topicTokens.length >= 3 && overlap >= 0.8) return true;
    return longestCommonSubstringLength(topic, source) >= Math.min(12, Math.max(8, Math.floor(normalizedTopic.replace(/\s+/g, '').length * 0.75)));
  });
}

function categoryAllowsRule(rule = {}, categoryHint = '') {
  if (!Array.isArray(rule.categories) || !rule.categories.length || !categoryHint || categoryHint === 'general') return true;
  return rule.categories.includes(categoryHint);
}

function uniqueContextRows(contexts = []) {
  const rows=(Array.isArray(contexts)?contexts:[contexts]).map(stripHtml).map(value=>value.replace(/\s+/g,' ').trim()).filter(Boolean);
  const seen=new Set();
  return rows.filter(value=>{const key=normalize(value);if(!key||seen.has(key))return false;seen.add(key);return true;});
}

function topicSupportForRule(rule = {}, keyword = '', contexts = [], categoryHint = '') {
  if (!categoryAllowsRule(rule, categoryHint)) return { supportCount:0, keywordMatched:false, supported:false };
  const rows=uniqueContextRows(contexts);
  const supportRows=rows.filter(row=>rule.pattern.test(normalize(row)));
  const keywordMatched=rule.pattern.test(normalize(keyword));
  const required=Math.max(1,Number(rule.minSupport||1));
  const supportCount=supportRows.length+(keywordMatched&&rule.keywordSupport?1:0);
  return {supportCount,keywordMatched,supportRows,supported:supportCount>=required};
}

export function inferSupportedTopTopic(keyword = '', contexts = [], categoryHint = '') {
  const rows=uniqueContextRows(contexts);
  const scored=TOPIC_RULES.map((rule,index)=>({rule,index,...topicSupportForRule(rule,keyword,rows,categoryHint)}))
    .filter(row=>row.supported)
    .sort((a,b)=>b.supportCount-a.supportCount||a.index-b.index);
  const best=scored[0];
  return best
    ? {topic:best.rule.label,supportCount:best.supportCount,confidence:Math.min(1,0.45+best.supportCount*0.2),rule:best.rule.label,supportRows:best.supportRows}
    : {topic:'현재 상황',supportCount:0,confidence:0,rule:'none',supportRows:[]};
}

export function pickNeutralTopTopic(keyword = '', contexts = [], categoryHint = '') {
  return inferSupportedTopTopic(keyword,contexts,categoryHint).topic;
}

function customTopicSupported(topic = '', contexts = []) {
  const tokens=tokenize(topic).filter(token=>!isTopIntentToken(token));
  if(tokens.length<1)return false;
  return uniqueContextRows(contexts).some(source=>{
    const sourceTokens=new Set(tokenize(source));
    const overlap=tokens.filter(token=>sourceTokens.has(token)||[...sourceTokens].some(value=>value.includes(token)||token.includes(value))).length;
    return overlap>=Math.min(2,tokens.length);
  });
}

export function buildNeutralTopTitleParts(keyword = '', contexts = [], preferredKeyword = '', preferredTopic = '', options = {}) {
  const raw = cleanKeyword(keyword || preferredKeyword);
  if (!raw) return { topKeyword:'', topTopic:'', topTitle:'', topTitleSource:'neutral_signal',topTopicSupport:0,topTitleConfidence:0,titleValidationReasons:['주체 없음'] };
  const sourceTitles = uniqueContextRows(contexts);
  const categoryHint=String(options?.categoryHint||'');
  const manualApproved=options?.manualApproved===true;

  const preferredKeywordTokens = tokenizeEntity(preferredKeyword).filter(token => !isTopIntentToken(token));
  const rawEntityTokens = tokenizeEntity(raw).filter(token => !isTopIntentToken(token));
  const entityTokens = preferredKeywordTokens.length ? preferredKeywordTokens : (rawEntityTokens.length ? rawEntityTokens : tokenizeEntity(raw));
  let topKeyword = normalizeTopPhrase(entityTokens.slice(0, 4).join(' ') || raw, 24);
  if (!topKeyword || /^(현재|관련|주요|핵심)$/.test(topKeyword)) topKeyword = normalizeTopPhrase(raw, 24);

  const inferred = inferSupportedTopTopic(raw, sourceTitles, categoryHint);
  const candidateTopic = normalizeTopPhrase(preferredTopic, 24);
  const candidateTokens = tokenize(candidateTopic);
  const genericCandidate=GENERIC_TOPICS.has(candidateTopic)||candidateTopic==='현재 상황';
  const candidateShapeSafe = candidateTopic.length >= 4 && candidateTokens.length >= 1 && candidateTokens.length <= 5
    && !looksLikeArticlePhrase(candidateTopic, sourceTitles)
    && !candidateTokens.every(token => tokenize(topKeyword).includes(token));
  const standardCandidate=STANDARD_TOP_TOPICS.has(candidateTopic);
  const candidateEvidenceSupported=standardCandidate
    ? inferred.topic===candidateTopic&&inferred.supportCount>0
    : customTopicSupported(candidateTopic,sourceTitles);
  const candidateSafe = candidateShapeSafe&&!genericCandidate&&(manualApproved||candidateEvidenceSupported);
  const topTopic = candidateSafe ? candidateTopic : inferred.topic;
  const supportCount=candidateSafe&&manualApproved?Math.max(1,inferred.supportCount):inferred.supportCount;
  const reasons=[];
  if(!topKeyword)reasons.push('주체를 식별하지 못함');
  if(!topTopic||GENERIC_TOPICS.has(topTopic)||topTopic==='현재 상황')reasons.push('구체적 사건 유형을 식별하지 못함');
  if(!manualApproved&&supportCount<1)reasons.push('사건 유형을 뒷받침하는 기사 제목 근거 부족');
  if(topTopic==='시장·가격 변동'&&!['economy','tech'].includes(categoryHint))reasons.push('경제 문맥이 아닌 주체에 시장·가격 변동을 연결함');
  const topTitle = topTopic&&topTopic!=='현재 상황'?`${topKeyword} · ${topTopic}`.replace(/\s+/g, ' ').trim().slice(0, 52):topKeyword;
  return {
    topKeyword, topTopic, topTitle,
    topTitleSource:manualApproved?'admin_override':candidateSafe?'verified_rewrite':inferred.rule==='none'?'neutral_signal':'supported_signal',
    topTopicSupport:supportCount,topTitleConfidence:manualApproved?1:inferred.confidence,
    titleValidationReasons:[...new Set(reasons)],
  };
}

export function cleanKeyword(title) {
  if (!title) return '';
  let result = String(title);
  VIDEO_PATTERNS.forEach(pattern => { result = result.replace(pattern, ' '); });
  result = result
    .replace(/\[([^\]]*)\]/g, (_, inner) => /[ㄱ-힣]/.test(inner) ? ` ${inner} ` : ' ')
    .replace(/\(([^)]*)\)/g, (_, inner) => /[ㄱ-힣]/.test(inner) ? ` ${inner} ` : ' ')
    .replace(/[|｜~·•]/g, ' ')
    .replace(/[^\w\sㄱ-힣가-힣-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const synonym = SYNONYMS[result.toLowerCase()];
  if (synonym) return synonym;
  return result.slice(0, 60).trim();
}

export function isValidKeyword(keyword) {
  const value = String(keyword || '').trim();
  if (value.length < 2 || value.length > 60) return false;
  if (BLOCKED_WORDS.some(word => value.toLowerCase().includes(word))) return false;
  if (/^\d+$/.test(value) || /^[^ㄱ-힣a-zA-Z0-9]+$/.test(value)) return false;
  const tokens = tokenize(value);
  if (!tokens.length) return false;
  if (tokens.length === 1 && ['순위','검색','뉴스','오늘','실시간'].includes(tokens[0])) return false;
  return true;
}

export const CATEGORY_IMAGES = {};

export async function extractVisualKeyword(keyword, summary, apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:50, messages:[{ role:'user', content:`Unsplash 사진 검색용 영어 구문 3~6단어만 JSON으로 답하세요. 사건을 직접 보여 주는 물체·장소·현장을 선택하고, 특정 인물 얼굴·상표·로고는 피하세요. news, current trends, breaking news, protest, demonstration 같은 범용 장면은 금지합니다. 관련 장면을 특정하기 어렵다면 빈 문자열을 반환하세요.\n키워드: ${keyword}\n설명: ${summary || ''}\n{"query":"..."}` }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(String(data.content?.[0]?.text || '').replace(/```json|```/g, '').trim());
    return parsed.query || null;
  } catch { return null; }
}

export async function extractCoreKeyword(title) { return cleanKeyword(title); }
export async function classifyKeywordWithAI() { return null; }

export async function fetchCommunityTrends() {
  const sources = ['https://bbs.ruliweb.com/community/board/300143/rss','https://www.clien.net/service/rss'];
  const counter = new Map();
  for (const url of sources) {
    try {
      const feed = await parser.parseURL(url);
      (feed.items || []).slice(0, 20).forEach(item => {
        const keyword = cleanKeyword(item.title);
        if (isValidKeyword(keyword)) counter.set(keyword, (counter.get(keyword) || 0) + 1);
      });
    } catch {}
  }
  return [...counter.entries()].map(([keyword, count]) => ({ keyword, count })).sort((a,b) => b.count - a.count).slice(0, 20);
}

function extractGoogleRelatedNews(item) {
  const news = Array.isArray(item.newsItems) ? item.newsItems : [];
  return news.map(entry => {
    if (typeof entry === 'string') return { title: stripHtml(entry) };
    return {
      title: stripHtml(entry?.['ht:news_item_title'] || entry?.title || entry?._ || ''),
      source: stripHtml(entry?.['ht:news_item_source'] || entry?.source || ''),
      link: entry?.['ht:news_item_url'] || entry?.link || '',
    };
  }).filter(row => row.title);
}

function splitGoogleNewsTitle(value='') {
  const text=stripHtml(value).replace(/^\s*[\[【](?:속보|단독|종합|영상|포토)[^\]】]*[\]】]\s*/,'').trim();
  const parts=text.split(/\s+-\s+/).filter(Boolean);
  if(parts.length<2)return {headline:text,source:''};
  const source=parts.pop();
  return {headline:parts.join(' - ').trim(),source:source.trim()};
}

export function extractNewsDiscoveryKeyword(value='') {
  const {headline}=splitGoogleNewsTitle(value);
  const cleaned=cleanKeyword(headline)
    .replace(/^(?:속보|단독|종합|영상|포토)\s+/,'')
    .replace(/\s+/g,' ')
    .trim();
  const resolved=resolveTop30Keyword({
    topKeyword:cleaned,
    keyword:cleaned,
    rawKeyword:cleaned,
    sourceTitles:[headline],
  });
  return String(resolved?.keyword||cleaned).trim().slice(0,30);
}

function sleep(ms=0){return new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)));}

function attachNaverDiagnostics(rows=[],diagnostics={}){
  try{Object.defineProperty(rows,'diagnostics',{value:diagnostics,enumerable:false,configurable:true});}
  catch{rows.diagnostics=diagnostics;}
  return rows;
}

function naverDiscoveryErrorMessage(feedDiagnostics=[]){
  const failed=(feedDiagnostics||[]).filter(row=>!row.ok);
  if(!failed.length)return '';
  return failed.map(row=>`${row.key}:${row.error||`HTTP ${row.status||0}`}`).slice(0,8).join(', ');
}

async function fetchNaverDiscoveryFeed(feed,feedIndex,clientId,clientSecret){
  const feedDiagnostic={key:feed.key,query:feed.query,ok:false,status:0,attempts:0,rawItems:0,recentItems:0,keywordItems:0,invalidDates:0,error:'',rateLimitRemaining:null};
  const maxAttempts=3;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    feedDiagnostic.attempts=attempt;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    let res=null;
    try{
      const url=`https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(feed.query)}&display=100&start=1&sort=date`;
      res=await fetch(url,{headers:{'X-Naver-Client-Id':clientId,'X-Naver-Client-Secret':clientSecret,'Accept':'application/json'},signal:controller.signal});
      feedDiagnostic.status=Number(res.status||0);
      const remaining=res.headers?.get?.('x-rate-limit-remaining');
      feedDiagnostic.rateLimitRemaining=remaining==null?null:Number(remaining);
      const body=await res.text();
      if(!res.ok){
        const compact=String(body||'').replace(/\s+/g,' ').slice(0,180);
        feedDiagnostic.error=`naver_http_${res.status}${compact?`: ${compact}`:''}`;
        if((res.status===429||res.status>=500)&&attempt<maxAttempts){
          await sleep(res.status===429?1200*attempt:500*attempt);
          continue;
        }
        return {rows:[],diagnostic:feedDiagnostic};
      }
      let data={};
      try{data=body?JSON.parse(body):{};}catch(error){
        feedDiagnostic.error=`naver_json_parse_failed: ${String(error?.message||error).slice(0,120)}`;
        if(attempt<maxAttempts){await sleep(350*attempt);continue;}
        return {rows:[],diagnostic:feedDiagnostic};
      }
      const items=Array.isArray(data.items)?data.items:[];
      feedDiagnostic.rawItems=items.length;
      const rows=[];
      for(let index=0;index<items.length;index++){
        const item=items[index]||{};
        const headline=stripHtml(item.title||'').replace(/\s+/g,' ').trim();
        const keyword=extractNewsDiscoveryKeyword(headline);
        const publishedAt=item.pubDate||item.publishedAt||null;
        const publishedTime=new Date(publishedAt||0).getTime();
        if(!Number.isFinite(publishedTime)||publishedTime<=0){feedDiagnostic.invalidDates+=1;continue;}
        if(hoursSince(publishedAt)>36)continue;
        feedDiagnostic.recentItems+=1;
        if(!keyword||!isValidKeyword(keyword))continue;
        feedDiagnostic.keywordItems+=1;
        const link=item.originallink||item.link||'';
        let source='네이버 뉴스';
        try{source=new URL(link).hostname.replace(/^www\./,'')||source;}catch{}
        rows.push({
          rawKeyword:headline,keyword,trafficText:'네이버 뉴스',trafficValue:Math.max(500,4200-(feedIndex*180+index*8)),
          googleRank:130+feedIndex*100+index,publishedAt:new Date(publishedTime).toISOString(),
          relatedNews:[{title:headline,source,link,publishedAt:new Date(publishedTime).toISOString()}],
          discoverySource:'naver_news',discoveryFeed:feed.key,categoryHint:feed.categoryHint,
        });
      }
      feedDiagnostic.ok=true;
      feedDiagnostic.error='';
      return {rows,diagnostic:feedDiagnostic};
    }catch(error){
      feedDiagnostic.error=error?.name==='AbortError'?'naver_timeout':String(error?.message||'naver_request_failed').slice(0,180);
      if(attempt<maxAttempts){await sleep(500*attempt);continue;}
      return {rows:[],diagnostic:feedDiagnostic};
    }finally{clearTimeout(timer);}
  }
  return {rows:[],diagnostic:feedDiagnostic};
}

export async function fetchNaverNewsDiscovery() {
  const clientId=String(process.env.NAVER_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.NAVER_CLIENT_SECRET||'').trim();
  const diagnostics={configured:Boolean(clientId&&clientSecret),requestedFeeds:NAVER_NEWS_DISCOVERY_QUERIES.length,successfulFeeds:0,failedFeeds:0,rawItems:0,recentItems:0,keywordItems:0,dedupedCandidates:0,invalidDates:0,feeds:[],error:''};
  if(!clientId||!clientSecret){
    diagnostics.error='naver_credentials_missing';
    return attachNaverDiagnostics([],diagnostics);
  }

  // 네이버 검색 API의 초당 요청 제한과 서버리스 동시 실행을 고려해 순차 호출합니다.
  // 각 분야는 최대 3회 재시도하며 429/5xx/timeout을 빈 배열로 숨기지 않습니다.
  const collected=[];
  for(let feedIndex=0;feedIndex<NAVER_NEWS_DISCOVERY_QUERIES.length;feedIndex++){
    const feed=NAVER_NEWS_DISCOVERY_QUERIES[feedIndex];
    const result=await fetchNaverDiscoveryFeed(feed,feedIndex,clientId,clientSecret);
    diagnostics.feeds.push(result.diagnostic);
    diagnostics.rawItems+=Number(result.diagnostic.rawItems||0);
    diagnostics.recentItems+=Number(result.diagnostic.recentItems||0);
    diagnostics.keywordItems+=Number(result.diagnostic.keywordItems||0);
    diagnostics.invalidDates+=Number(result.diagnostic.invalidDates||0);
    if(result.diagnostic.ok)diagnostics.successfulFeeds+=1;else diagnostics.failedFeeds+=1;
    collected.push(...(result.rows||[]));
    const remaining=result.diagnostic.rateLimitRemaining;
    await sleep(Number.isFinite(remaining)&&remaining<=1?1100:180);
  }

  const rows=[];const seen=new Set();
  for(const row of collected){
    const key=discoveryIdentity(row.keyword);
    if(!key||seen.has(key))continue;
    seen.add(key);rows.push(row);
    if(rows.length>=TOP_DISCOVERY_POOL_LIMIT)break;
  }
  diagnostics.dedupedCandidates=rows.length;
  diagnostics.error=naverDiscoveryErrorMessage(diagnostics.feeds);
  if(!diagnostics.successfulFeeds){
    const error=new Error(diagnostics.error||'naver_discovery_all_feeds_failed');
    error.code='naver_discovery_failed';
    error.diagnostics=diagnostics;
    throw error;
  }
  return attachNaverDiagnostics(rows,diagnostics);
}

export async function fetchGoogleNewsDiscovery() {
  const batches=await mapLimit(GOOGLE_NEWS_DISCOVERY_FEEDS,4,async(feed,feedIndex)=>{
    try{
      const parsed=await parser.parseURL(feed.url);
      return (parsed.items||[]).slice(0,15).map((item,index)=>{
        const {headline,source}=splitGoogleNewsTitle(item.title||'');
        const keyword=extractNewsDiscoveryKeyword(headline);
        const publishedAt=item.pubDate||item.isoDate||null;
        if(!keyword||!isValidKeyword(keyword)||!publishedAt||hoursSince(publishedAt)>36)return null;
        return {
          rawKeyword:headline,keyword,trafficText:'Google 뉴스',trafficValue:Math.max(500,3200-(feedIndex*150+index*20)),
          googleRank:20+feedIndex*15+index,publishedAt,
          relatedNews:[{title:headline,source:source||'Google 뉴스',link:item.link||'',publishedAt}],
          discoverySource:'google_news',discoveryFeed:feed.key,categoryHint:feed.categoryHint,
        };
      }).filter(Boolean);
    }catch(error){
      return [];
    }
  });
  const rows=[];const seen=new Set();
  for(const row of batches.flat()){
    const key=discoveryIdentity(row.keyword);
    if(!key||seen.has(key))continue;
    seen.add(key);rows.push(row);
    if(rows.length>=TOP_DISCOVERY_POOL_LIMIT)break;
  }
  return rows;
}

export async function fetchGoogleTrends() {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const feed = await parser.parseURL('https://trends.google.com/trending/rss?geo=KR');
      const primaryRows = (feed.items || []).slice(0, 50).map((item, index) => {
        const rawKeyword = stripHtml(item.title);
        const keyword = cleanKeyword(rawKeyword);
        const trafficText = item.approxTraffic || item['ht:approx_traffic'] || '500+';
        return {
          rawKeyword,
          keyword,
          trafficText,
          trafficValue: parseTraffic(trafficText),
          googleRank: index + 1,
          publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
          relatedNews: extractGoogleRelatedNews(item),
          discoverySource:'google_trends',
        };
      }).filter(item => isValidKeyword(item.keyword));
      // Google Trends RSS가 10개 안팎만 제공하는 경우에도 관련 뉴스 제목을
      // 별도 사건 후보로 확장해 관리자 후보와 조사 풀을 30개 이상 확보합니다.
      const expanded=[];
      primaryRows.forEach((row,rowIndex)=>{
        expanded.push(row);
        (row.relatedNews||[]).slice(0,5).forEach((news,newsIndex)=>{
          const keyword=extractNewsDiscoveryKeyword(news?.title||'');
          if(!keyword||!isValidKeyword(keyword))return;
          expanded.push({
            rawKeyword:news.title,keyword,trafficText:'Google Trends 관련 뉴스',
            trafficValue:Math.max(500,Number(row.trafficValue||500)-newsIndex*25),
            googleRank:50+rowIndex*5+newsIndex,publishedAt:news.publishedAt||row.publishedAt,
            relatedNews:[news],discoverySource:'google_trends_related_news',categoryHint:row.categoryHint||'general',
          });
        });
      });
      const rows=mergeKeywords(expanded).slice(0,TOP_DISCOVERY_POOL_LIMIT);
      if (rows.length) return rows;
      lastError = new Error('Google Trends RSS가 비어 있거나 유효한 한국어 후보가 없습니다.');
    } catch (error) {
      lastError = error;
      console.error(`Google Trends 시도 ${attempt + 1} 실패:`, error.message);
    }
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1200));
  }
  const error = new Error(`Google Trends 후보 수집 실패: ${lastError?.message || '빈 응답'}`);
  error.code = 'google_trends_empty';
  throw error;
}


export function buildBalancedDiscoveryPool(googleTrendsRows=[],googleNewsRows=[],naverNewsRows=[],communityRows=[],limit=TOP_DISCOVERY_POOL_LIMIT){
  const sources=[
    {key:'google_trends',rows:Array.isArray(googleTrendsRows)?googleTrendsRows:[]},
    {key:'google_news',rows:Array.isArray(googleNewsRows)?googleNewsRows:[]},
    {key:'naver_news',rows:Array.isArray(naverNewsRows)?naverNewsRows:[]},
    {key:'community',rows:Array.isArray(communityRows)?communityRows:[]},
  ];
  const result=[];
  let cursor=0;
  while(result.length<limit&&sources.some(source=>cursor<source.rows.length)){
    for(const source of sources){
      if(result.length>=limit)break;
      const row=source.rows[cursor];
      if(row)result.push(row);
    }
    cursor+=1;
  }
  return result;
}

export function mergeKeywords(rows) {
  // v8.0.16: 후보 수집 단계에서는 표현이 사실상 같은 항목만 합칩니다.
  // 같은 인물·기업을 포함해도 행동과 대상이 다르면 별도 관심사로 유지합니다.
  const result = [];
  for (const item of rows || []) {
    const normalized = discoveryIdentity(item?.keyword || item?.rawKeyword || '');
    if (!normalized) continue;
    const duplicate = result.find(existing => {
      const other = discoveryIdentity(existing?.keyword || existing?.rawKeyword || '');
      if (normalized === other) return true;
      const left = tokenize(item.keyword || ''), right = tokenize(existing.keyword || '');
      if (!left.length || !right.length) return false;
      const common = left.filter(token => right.includes(token)).length;
      const similarity = common / Math.max(left.length, right.length);
      const lengthRatio = Math.min(normalized.length, other.length) / Math.max(normalized.length, other.length);
      return similarity >= 0.95 && lengthRatio >= 0.9;
    });
    if (!duplicate) result.push(item);
    else {
      const incoming = Number(item.trafficValue || 0);
      const current = Number(duplicate.trafficValue || 0);
      if (incoming > current) Object.assign(duplicate, item);
      duplicate.interestSignals = [...new Set([...(duplicate.interestSignals || []), item.discoverySource || 'unknown'])];
    }
  }
  return result;
}

function discoveryIdentity(value='') {
  return normalize(cleanKeyword(value)).replace(/\s+/g,'');
}

// 관리자 승인 후보와 직전 TOP은 현재 Google Trends RSS에 다시 나타나지 않아도
// 재조사할 수 있어야 합니다. 승인 저장 후 다음 RSS 목록에서 사라져 승인 효과가
// 없어지는 문제를 막고, 이전 공개 TOP도 최신 콘텐츠 버전으로 재검증할 수 있게 합니다.
export function mergeDiscoverySeeds(googleRows=[], manualApprovals=[], previousCandidates=[], limit=50) {
  const rows=[];
  const seen=new Set();
  const push=(row={})=>{
    const keyword=cleanKeyword(row.keyword||row.rawKeyword||row.topKeyword||row.displayTitle||'');
    const key=discoveryIdentity(keyword);
    if(!key||seen.has(key)||!isValidKeyword(keyword))return;
    seen.add(key);
    rows.push({...row,keyword,rawKeyword:row.rawKeyword||keyword});
  };

  // 수동 승인 후보는 최우선 조사 대상으로 유지합니다.
  (Array.isArray(manualApprovals)?manualApprovals:[]).filter(row=>row?.approved!==false).forEach((approval,index)=>{
    const overrides=approval.overrides||{};
    const keyword=overrides.topKeyword||approval.keyword||approval.eventKey||'';
    push({
      rawKeyword:keyword,keyword,trafficText:'관리자 승인',trafficValue:500,
      googleRank:90+index,publishedAt:approval.approvedAt||new Date().toISOString(),relatedNews:[],
      manualSeed:true,manualApprovalSeed:approval,
    });
  });

  mergeKeywords(googleRows).forEach(push);

  // 직전 정상 TOP은 신규 후보가 부족할 때 마지막 보충 풀로 유지합니다.
  // 오래된 내용을 신규 사건처럼 확정하지 않으며 selectionBucket=maintained로만 사용합니다.
  (Array.isArray(previousCandidates)?previousCandidates:[]).slice(0,TOP_TARGET_COUNT).forEach((item,index)=>{
    push({
      ...item,rawKeyword:item.rawKeyword||item.keyword||item.topKeyword,
      keyword:item.keyword||item.topKeyword||item.displayTitle,
      trafficText:item.trafficText||'직전 TOP 유지',trafficValue:Number(item.trafficValue||500),
      googleRank:Number(item.googleRank||220+index),publishedAt:item.publishedAt||item.updatedAt||new Date().toISOString(),
      relatedNews:Array.isArray(item.relatedArticles)?item.relatedArticles:Array.isArray(item.relatedNews)?item.relatedNews:[],
      previousSeed:true,maintainedCandidate:true,
    });
  });

  return rows.slice(0,Math.max(1,Math.min(TOP_DISCOVERY_POOL_LIMIT,Number(limit||50))));
}

export function calcGoogleScore(trafficValue, rank) {
  const traffic = Math.log10(Math.max(500, trafficValue)) * 7;
  const rankScore = Math.max(0, 18 - (rank - 1) * 0.5);
  return Math.round(clamp(traffic + rankScore, 10, 45));
}
export function calcNaverScore(count) { return Math.round(clamp(Math.log2(Math.max(1, count + 1)) * 5, 0, 22)); }
export function calcYoutubeScore(videos) {
  if (!Array.isArray(videos) || !videos.length) return 0;
  const velocity = videos.slice(0, 3).reduce((sum, video) => sum + (Number(video.viewCount || 0) / Math.max(1, hoursSince(video.publishedAt))), 0) / Math.min(3, videos.length);
  return Math.round(clamp(Math.log10(Math.max(1, velocity)) * 2.5, 1, 12));
}
export function calcSourceBonus(hasGoogle, hasNaver, hasYoutube) { return (hasGoogle ? 2 : 0) + (hasNaver ? 4 : 0) + (hasYoutube ? 2 : 0); }
export function calcPersistenceBonus(keyword, previousRanks) {
  const prev = previousRanks?.[keyword];
  return prev ? (prev <= 10 ? 4 : prev <= 20 ? 2 : 1) : 0;
}

function sourceTrustScore(items = []) {
  const trusted = ['yna.co.kr','newsis.com','kbs.co.kr','imbc.com','sbs.co.kr','ytn.co.kr','chosun.com','joongang.co.kr','donga.com','hani.co.kr','khan.co.kr','mk.co.kr','hankyung.com','etnews.com','zdnet.co.kr','gov.kr','go.kr'];
  const domains = unique(items.map(item => {
    try { return new URL(item.link || '').hostname.replace(/^www\./, ''); } catch { return item.source || ''; }
  }));
  const official = domains.filter(domain => /(^|\.)go\.kr$|gov\.kr$|\.com$/.test(domain) && trusted.some(t => domain.includes(t))).length;
  return { score: clamp(domains.length * 3 + official * 3, 0, 12), domains, official };
}

function stableTrendKey(value = '') {
  return normalize(cleanKeyword(value)).replace(/\s+/g, '-').slice(0, 80);
}

function pickTopTitleParts(keyword, articles = [], relatedNews = [], categoryHint = '') {
  const candidates = [...articles, ...relatedNews].map(item => stripHtml(item.title)).filter(Boolean);
  return buildNeutralTopTitleParts(keyword, candidates, '', '', {categoryHint});
}

function buildSearchQuery(keyword, displayTitle) {
  if (displayTitle && displayTitle !== keyword) return displayTitle.slice(0, 60);
  return keyword;
}

function buildEventKey(keyword, displayTitle) {
  const tokens = unique(tokenize(`${displayTitle} ${keyword}`)).slice(0, 7).sort();
  return tokens.join('-') || normalize(keyword).replace(/\s+/g, '-');
}

function relevanceScore(keyword, articles = []) {
  const keyTokens = tokenize(keyword);
  if (!articles.length || !keyTokens.length) return 0;
  const scores = articles.slice(0, 8).map(article => {
    const titleTokens = tokenize(article.title);
    const common = keyTokens.filter(token => titleTokens.some(t => t.includes(token) || token.includes(t))).length;
    return common / keyTokens.length;
  });
  return Math.round((scores.reduce((a,b) => a + b, 0) / scores.length) * 15);
}

function ambiguityPenalty(keyword, displayTitle, articleCount) {
  const tokens = tokenize(keyword);
  let penalty = 0;
  if (tokens.length === 1 && GENERIC_SINGLE_WORDS.has(keyword)) penalty += 14;
  if (tokens.length === 1 && keyword.length <= 3) penalty += 8;
  if (displayTitle === keyword && penalty > 0) penalty += 8;
  if (articleCount === 0) penalty += 12;
  return clamp(penalty, 0, 25);
}

function similarity(a, b) {
  const ta = tokenize(a); const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const common = ta.filter(token => tb.includes(token)).length;
  return common / new Set([...ta, ...tb]).size;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function normalizeApprovalKey(value='') { return normalize(value).replace(/\s+/g,''); }
function findManualApproval(item={}, approvals=[]) {
  if(item?.manualApprovalSeed?.approved!==false&&item?.manualApprovalSeed)return item.manualApprovalSeed;
  const keys=[item.eventKey,item.trendKey,item.keyword,item.rawKeyword].map(normalizeApprovalKey).filter(Boolean);
  return (Array.isArray(approvals)?approvals:[]).find(row=>row?.approved!==false&&[row.key,row.eventKey,row.keyword,row?.overrides?.topKeyword].map(normalizeApprovalKey).filter(Boolean).some(key=>keys.includes(key)))||null;
}
export function applyManualCandidateApproval(item={}, approvals=[]) {
  const approval=findManualApproval(item,approvals);
  if(!approval)return item;
  const overrides=approval.overrides||{};
  const category=String(overrides.category||item.category||'general');
  const titleParts=buildNeutralTopTitleParts(
    item.keyword||item.rawKeyword||'',
    (item.relatedArticles||[]).map(row=>row?.title||''),
    overrides.topKeyword||item.topKeyword||item.keyword||'',
    overrides.topTopic||item.topTopic||'',
    {categoryHint:category,manualApproved:true},
  );
  const topKeyword=String(overrides.topKeyword||titleParts.topKeyword||item.topKeyword||item.keyword||'').trim();
  const topTopic=String(overrides.topTopic||titleParts.topTopic||item.topTopic||'').trim();
  const topTitle=String(overrides.topTitle||[topKeyword,topTopic].filter(Boolean).join(' · ')||item.topTitle||item.displayTitle||'').trim();
  return {
    ...item,...titleParts,category,topKeyword,topTopic,topTitle,displayTitle:topTitle,
    searchQuery:String(overrides.searchQuery||`${topKeyword} ${topTopic}`||item.searchQuery||item.keyword).trim(),
    manualApproved:true,manualApprovalKey:approval.key||normalizeApprovalKey(item.eventKey||item.keyword),
    manualApproval:{...approval,overrides:{...overrides,topKeyword,topTopic,topTitle,category}},
    reviewRequired:false,
  };
}

export async function generateTop30(fetchTrendSignal, fetchYoutubeVideosFull, previousRanks = {}, options = {}) {
  const onStage=typeof options.onStage==='function'?options.onStage:async()=>{};
  await onStage('discovering_candidates');
  let google=[];
  let googleNews=[];
  let naverNews=[];
  let community=[];
  let googleTrendsError='';
  let googleNewsError='';
  let naverNewsError='';
  let communityError='';
  let naverDiscoveryDiagnostics={configured:false,requestedFeeds:NAVER_NEWS_DISCOVERY_QUERIES.length,successfulFeeds:0,failedFeeds:0,rawItems:0,recentItems:0,keywordItems:0,dedupedCandidates:0,invalidDates:0,feeds:[],error:''};
  try {
    google=await fetchGoogleTrends();
  } catch (error) {
    googleTrendsError=String(error?.message||'Google Trends 후보 수집 실패');
  }
  try {
    googleNews=await fetchGoogleNewsDiscovery();
  } catch (error) {
    googleNewsError=String(error?.message||'Google 뉴스 후보 수집 실패');
  }
  try {
    naverNews=await fetchNaverNewsDiscovery();
    naverDiscoveryDiagnostics=naverNews?.diagnostics||naverDiscoveryDiagnostics;
  } catch (error) {
    naverNewsError=String(error?.message||'네이버 뉴스 후보 수집 실패');
    naverDiscoveryDiagnostics=error?.diagnostics||{...naverDiscoveryDiagnostics,error:naverNewsError};
  }
  try {
    const communitySignals=await fetchCommunityTrends();
    community=(Array.isArray(communitySignals)?communitySignals:[]).map((row,index)=>({
      rawKeyword:row.keyword,keyword:row.keyword,trafficText:'온라인 언급 신호',trafficValue:Math.max(500,Number(row.count||1)*500),
      googleRank:180+index,publishedAt:new Date().toISOString(),relatedNews:[],discoverySource:'community',categoryHint:'trend',
      communityCount:Number(row.count||1),interestSignals:['community'],
    }));
  } catch (error) {
    communityError=String(error?.message||'온라인 관심 신호 수집 실패');
  }
  const fallbackSeeds=(options.manualApprovals||[]).length+(options.previousCandidates||[]).length;
  if(!google.length&&!googleNews.length&&!naverNews.length&&!community.length&&!fallbackSeeds){
    const error=new Error(googleTrendsError||googleNewsError||naverNewsError||'TOP 후보 수집 실패');
    error.code='discovery_sources_empty';
    throw error;
  }
  const balancedDiscovery=buildBalancedDiscoveryPool(google,googleNews,naverNews,community,TOP_DISCOVERY_POOL_LIMIT);
  const merged = mergeDiscoverySeeds(
    balancedDiscovery,
    options.manualApprovals||[],
    options.previousCandidates||[],
    TOP_DISCOVERY_POOL_LIMIT,
  ).slice(0, TOP_DISCOVERY_POOL_LIMIT);
  const searchTrendScores = typeof options.fetchSearchTrendScores === 'function'
    ? await options.fetchSearchTrendScores(merged.map(item => item.keyword)).catch(() => ({}))
    : {};

  await onStage('validating_events',{candidateCount:merged.length});
  const candidates = await mapLimit(merged, 5, async (item) => {
    const signal = await fetchTrendSignal(item.keyword).catch(error => ({ ok:false, count:0, items:[], error:error?.message||'trend_signal_failed' }));
    const articles = Array.isArray(signal?.items) ? signal.items : [];
    const articleContext=[...articles,...(item.relatedNews||[])].map(row=>row?.title||'').join(' ');
    const categoryResult = detectCategoryDetailed(item.keyword, `${articleContext} ${item.categoryHint||''}`);
    const titleParts = pickTopTitleParts(item.keyword, articles, item.relatedNews, categoryResult.category);
    const displayTitle = titleParts.topTitle || item.keyword;
    const searchQuery = buildSearchQuery(item.keyword, `${titleParts.topKeyword} ${titleParts.topTopic}`.trim());
    const trendKey = stableTrendKey(item.rawKeyword || item.keyword);
    const previousRank = previousRanks[trendKey] || previousRanks[item.keyword] || previousRanks[normalize(item.keyword).replace(/\s+/g,'')] || null;
    let youtubeSupport = 0;
    let youtubeVideos = [];
    // YouTube는 순위 후보나 폴백이 아니라 상위 후보의 보조 신호(최대 3점)로만 사용합니다.
    if (typeof fetchYoutubeVideosFull === 'function' && Number(item.googleRank || 99) <= 12) {
      youtubeVideos = await fetchYoutubeVideosFull(searchQuery).catch(() => []);
      youtubeSupport = Math.min(3, Math.round(calcYoutubeScore(youtubeVideos) / 4));
    }
    const evaluation = evaluateTrendCandidate({
      keyword:item.keyword, trafficValue:item.trafficValue, googleRank:item.googleRank,
      articles, relatedNews:item.relatedNews, datalab:searchTrendScores[item.keyword] || null,
      previousRank, categoryConfidence:categoryResult.confidence, youtubeSupport,
    });
    const dominantArticles=evaluation.dominantArticles||[];
    const eventContext=dominantArticles.map(row=>row.title);
    const neutral=buildNeutralTopTitleParts(item.keyword,eventContext,titleParts.topKeyword,titleParts.topTopic,{categoryHint:categoryResult.category});
    const keywordResolution=resolveTop30Keyword({
      topKeyword:neutral.topKeyword,
      keyword:item.keyword,
      rawKeyword:item.rawKeyword||item.keyword,
      candidateTerms:[titleParts.topKeyword].filter(Boolean),
      sourceTitles:[...eventContext,...articles.slice(0,8).map(row=>row?.title||''),...(item.relatedNews||[]).slice(0,5).map(row=>row?.title||'')].filter(Boolean),
    });
    const canonicalKeyword=keywordResolution.keyword||neutral.topKeyword||item.keyword;
    const canonicalSearchQuery=buildSearchQuery(canonicalKeyword,`${canonicalKeyword} ${neutral.topTopic}`.trim());
    const eventTokens=unique(tokenize(`${canonicalKeyword} ${neutral.topTopic} ${eventContext.slice(0,3).join(' ')}`)).slice(0,8).sort();
    const eventKey=eventTokens.join('-')||stableTrendKey(canonicalKeyword);
    return {
      rawKeyword:item.rawKeyword, keyword:canonicalKeyword, trafficText:item.trafficText, trafficValue:item.trafficValue,
      googleRank:item.googleRank, publishedAt:item.publishedAt, trendKey, eventKey,
      topKeyword:canonicalKeyword, topTopic:neutral.topTopic, topTitle:'',
      topTitleSource:'keyword_only_pre_research',titleStatus:'pending_research',titleReady:false,researchTopicHint:neutral.topTopic,keywordSource:keywordResolution.source||null,keywordConfidence:Number(keywordResolution.score||0),keywordCandidates:(keywordResolution.candidates||[]).slice(0,5),topTopicSupport:neutral.topTopicSupport||0,topTitleConfidence:0,titleValidationReasons:neutral.titleValidationReasons||[], displayTitle:canonicalKeyword, searchQuery:canonicalSearchQuery,
      category:categoryResult.category, categoryConfidence:categoryResult.confidence, categoryReason:categoryResult.reason,
      datalab:searchTrendScores[item.keyword] || null,
      rankingScore:evaluation.score, qualityScore:evaluation.score, rankingGrade:evaluation.grade,
      rankingEligible:evaluation.eligible, mainVisible:evaluation.mainVisible, contentTier:evaluation.contentTier,
      reviewRequired:false, visibility:'private',
      independentSources:evaluation.independentSources, sourceDomains:evaluation.sourceDomains,
      officialSources:evaluation.officialSources, eventCoherence:evaluation.eventCoherence,
      rankingComponents:evaluation.components, rankingReasons:evaluation.hardReasons,
      rankingPenalties:evaluation.penalties, clusterCount:evaluation.clusterCount,
      dominantShare:evaluation.dominantShare, newestArticleHours:evaluation.freshness?.newestHours,
      relatedArticles:dominantArticles.slice(0,5).map(row=>({title:row.title,source:row.source||'',publishedAt:row.publishedAt||null,domain:row.domain||'',link:row.link||''})),
      youtubeSupport, youtubeVideos:youtubeVideos.slice(0,2), previousRank,
      eventSignatures:articleSignatureSet(dominantArticles),
      candidateType:(evaluation.independentSources>0&&evaluation.eventCoherence>=45&&neutral.topTopic&&neutral.topTopic!=='현재 상황')?'event':'interest',
      causeStatus:(evaluation.independentSources>0&&evaluation.eventCoherence>=45&&neutral.topTopic&&neutral.topTopic!=='현재 상황')?'confirmed':'unconfirmed',
      previousSeed:item.previousSeed===true,maintainedCandidate:item.maintainedCandidate===true,
      interestSignals:[item.discoverySource,Number(evaluation.components?.search||0)>0?'search':null,Number(evaluation.components?.newsVelocity||0)>0?'news':null,youtubeSupport>0?'youtube':null].filter(Boolean),
      trendSignalError:signal?.error||'', trendSignalOk:signal?.ok!==false,
    };
  });

  await onStage('ranking_events',{candidateCount:candidates.length});
  // v8은 여기서 공개 여부를 확정하지 않습니다. 조사 가능한 사건 후보만 선별한 뒤
  // 공식자료·신뢰 뉴스 기반 상세 콘텐츠와 Fact Ledger가 준비된 항목만 원자적으로 공개합니다.
  const approvedCandidates=candidates.map(item=>applyManualCandidateApproval(item,options.manualApprovals||[]));
  // v8.0.16: 절대 커트라인 없이 모든 정상 후보를 상대 점수로 정렬합니다.
  // 신규·상승 → 후속 → 진행 → 관심 증가 → 직전 TOP 유지 순으로 보충하고,
  // 카테고리 상한 때문에 목표 개수가 부족하면 상한을 자동 완화한 뒤 해제합니다.
  const selection=selectStableTop30(approvedCandidates,{limit:TOP_TARGET_COUNT});
  const trends=selection.rows.map((item,index)=>({
    ...item,rank:index+1,mainVisible:true,visibility:'private',limitedVerification:false,reviewRequired:false,
    contentTier:index<10?'full':'standard',publicTopPolicy:'research_pending_v3',publicReady:false,contentReady:false,
    badge:item.previousRank==null?'NEW':index<3?'HOT':Number(item.previousRank)-(index+1)>=5?'UP':'',
  }));
  const selectedByKey=new Map(trends.map(item=>[item.eventKey||item.trendKey||item.keyword,item]));
  const report=approvedCandidates.sort((a,b)=>b.rankingScore-a.rankingScore).map((item,index)=>{
    const selected=selectedByKey.get(item.eventKey||item.trendKey||item.keyword);
    return {
      candidateRank:index+1,keyword:item.keyword,rawKeyword:item.rawKeyword,eventKey:item.eventKey,trendKey:item.trendKey,topKeyword:item.topKeyword,topTopic:item.topTopic,topTitle:item.topTitle,displayTitle:item.displayTitle,searchQuery:item.searchQuery,category:item.category,categoryConfidence:item.categoryConfidence,topTopicSupport:item.topTopicSupport||0,topTitleConfidence:item.topTitleConfidence||0,titleValidationReasons:item.titleValidationReasons||[],manualApproved:item.manualApproved===true,manualApproval:item.manualApproval||null,rankingScore:item.rankingScore,
      rankingGrade:item.rankingGrade,eligible:item.rankingEligible,mainVisible:Boolean(selected),rankingEngineVisible:Boolean(item.mainVisible),selectionBucket:selected?.selectionBucket||item.selectionBucket||null,
      independentSources:item.independentSources,officialSources:item.officialSources,eventCoherence:item.eventCoherence,
      newestArticleHours:item.newestArticleHours,components:item.rankingComponents,
      reasons:selected?.rankingReasons||item.rankingReasons,penalties:item.rankingPenalties,sourceDomains:item.sourceDomains,
      clusterCount:item.clusterCount,dominantShare:item.dominantShare,contentTier:selected?.contentTier||item.contentTier,
      limitedVerification:false,
      researchEntryRejectionReasons:researchCandidateEntryRejectionReasons(item),
      automaticRejectionReasons:researchCandidateRejectionReasons({...item,manualApproved:false}),
      publicTopRejectionReasons:selected?[]:researchCandidateEntryRejectionReasons(item),
      publicTopPolicy:selected?.publicTopPolicy||'research_pending_v3',
    };
  });
  const selectedKeys=new Set(trends.map(item=>item.eventKey||item.trendKey||item.keyword));
  const reserveCandidates=approvedCandidates
    .filter(item=>!selectedKeys.has(item.eventKey||item.trendKey||item.keyword))
    .sort((a,b)=>Number(b.rankingScore||0)-Number(a.rankingScore||0));
  const researchPool=[...trends,...reserveCandidates]
    .filter((item,index,rows)=>rows.findIndex(row=>(row.eventKey||row.trendKey||row.keyword)===(item.eventKey||item.trendKey||item.keyword))===index)
    .slice(0,TOP_RESEARCH_POOL_LIMIT)
    .map((item,index)=>({
      ...item,rank:index+1,mainVisible:true,visibility:'private',limitedVerification:false,reviewRequired:false,
      contentTier:index<10?'full':'standard',publicTopPolicy:'research_pending_v3',publicReady:false,contentReady:false,
      reserveCandidate:index>=TOP_TARGET_COUNT,
    }));
  const strictVisible=trends.filter(item=>!item.limitedVerification).length;
  const limitedVisible=0;
  await onStage('ranking_complete',{selectedCount:trends.length,strictVisible,limitedVisible,rejectedCount:report.filter(x=>!x.mainVisible).length});
  return { trends, researchPool, candidates:report, diagnostics:{
    targetTopCount:TOP_TARGET_COUNT,researchPoolLimit:TOP_RESEARCH_POOL_LIMIT,rawCollectionTarget:'150-250',selection:selection.diagnostics,
    rawCollected:google.length+googleNews.length+naverNews.length+community.length,
    afterBasicNoiseRemoval:balancedDiscovery.length,afterClustering:merged.length,
    freshCount:Number(selection.diagnostics?.bucketCounts?.fresh||0)+Number(selection.diagnostics?.bucketCounts?.rising||0),
    followupCount:Number(selection.diagnostics?.bucketCounts?.followup||0),ongoingCount:Number(selection.diagnostics?.bucketCounts?.ongoing||0),
    interestOnlyCount:Number(selection.diagnostics?.bucketCounts?.interest||0),previousTopAvailable:(options.previousCandidates||[]).length,
    finalTopCount:trends.length,usedPreviousTopCount:Number(selection.diagnostics?.usedPreviousTopCount||0),
    googleCandidates:google.length,googleNewsCandidates:googleNews.length,naverNewsCandidates:naverNews.length,communityCandidates:community.length,
    naverDiscovery:naverDiscoveryDiagnostics,
    balancedDiscoveryCounts:{googleTrends:balancedDiscovery.filter(row=>row.discoverySource==='google_trends'||!row.discoverySource).length,googleNews:balancedDiscovery.filter(row=>row.discoverySource==='google_news').length,naverNews:balancedDiscovery.filter(row=>row.discoverySource==='naver_news').length,community:balancedDiscovery.filter(row=>row.discoverySource==='community').length},
    googleTrendsError,googleNewsError,naverNewsError:naverNewsError||naverDiscoveryDiagnostics?.error||'',communityError,
    usedFallbackSeeds:Boolean((googleTrendsError||googleNewsError||naverNewsError||communityError)&&merged.length),mergedCandidates:merged.length,eligible:trends.length,strictVisible,limitedVisible,rejected:report.filter(x=>!x.mainVisible).length,naverSignalFailures:approvedCandidates.filter(x=>x.trendSignalOk===false).length,naverSignalErrors:unique(approvedCandidates.map(x=>x.trendSignalError).filter(Boolean)).slice(0,5)
  } };
}

