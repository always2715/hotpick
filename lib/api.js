import Parser from 'rss-parser';
import { detectCategory, detectCategoryDetailed, CATEGORIES } from './categories';
import { saveContent, saveReviewDraft, getContent, saveTrends, getCachedTrends, getPreviousRanks, recordTokenUsage, getTokenUsage, setContentStatus, CONTENT_STATUS, getTrendsUpdatedAt, acquireLock, releaseLock, updateContentFields, updateTrendFields, getExternalCache, setExternalCache, saveTrendCandidateReport, getTrendRules, savePublicationStage, saveTrendRunContentSnapshot } from './kv';
import { generateTop30, isValidKeyword, cleanKeyword, classifyKeywordWithAI, buildNeutralTopTitleParts } from './trends';
import { contentTierForTrend, isTopBriefEligible, shouldSkipSourceFetchForBrief } from './topContentPolicy';
import { ensurePromoCard, validateInstagramCards } from './instagram';
import { normalizeSourceItem, makeSourceSignature, buildFactLedger, assessCopyrightRisk, assessGrounding, decidePublication, cleanText, canonicalizeUrl, classifySource, isSourceRelevantToTopic } from './contentPolicy';
import { compareTrendSets } from './rankingEngine';
import { assertFreshTrendSet, summarizeTrendRefresh } from './trendRefreshPolicy';
import { evaluateCostGuard } from './costGuard';
import { isUnsplashImageUrl } from './images';
import { selectCuratedThumbnailForContent } from './thumbnailPoolService.js';
import { buildRelatedNews, buildRelatedContent, buildDiscoverySignals, buildTrendBrief, makeContentSignalSignature, sanitizeExternalLinksForStorage, sanitizeEvidenceForStorage, sanitizeLedgerForStorage, compactCopyrightRisk, contentIsReady, validateTrendBriefContent, validateDetailedTierShape, neutralRelatedLabel, hasDetailedEvidence, buildStructuredFactPrompt, generationPolicyFor } from './contentArchitecture';
import { buildDeterministicResearchPlan, normalizeResearchPlan, normalizeRelatedVideos, makeStructuredApiSource, mergeResearchBundle, researchCompleteness } from './researchPipeline';
import { splitOnlineReactionInputs, buildOnlineReactionRankingSignal, buildOnlineReactionSummary, buildOnlineReactionPromptInput, onlineReactionInputPolicy } from './onlineReactionPipeline';
import { resolveKmaBaseDateTime, resolveWeatherTargetDate } from './weatherResearch';
import { isAutomaticPublicationReady, fixedTop20ContentRejectionReasons, isFixedKeywordFeedReady } from './publicationPolicy';
import { derivePostResearchTitle, resolveTop30Keyword } from './editorialTitle.js';
import { buildVerifiedFallback } from './editorialContent.js';
import { sanitizePublicText } from './publicCopy.js';
import { deriveContentGrade, contentLengthRange } from './contentGrade.js';
import { FEED_DETAIL_MIN_CHARS, FEED_DETAIL_TARGET_CHARS, FEED_DETAIL_RECOMMENDED_MIN_CHARS, FEED_DETAIL_RECOMMENDED_MAX_CHARS } from './feedLengthPolicy.js';
import { naturalFeedHeading, buildFeedSummaryCard, feedHeadlineFromTitle, fullFeedTitle } from './feedFirstPipeline.js';
import { validateGeneratedPackageAccuracy, ledgerAccuracyReport, accurateFacts, isGenericFactText, sanitizeFactLedgerForPublication } from './contentAccuracy.js';
import { PUBLIC_TOP_COUNT, TOP_GENERATION_POOL_COUNT } from './topConfig.js';

const parser = new Parser({
  timeout: 8000,
  customFields: { item: [['source', 'sourceNode'], ['description', 'description']] },
});

// 동일 빌드/서버 인스턴스에서 외부 트렌드 API를 반복 호출하지 않도록 메모리 캐시
let localTrendsCache = null;
const LOCAL_TRENDS_TTL = 3 * 60 * 60 * 1000;
const TREND_CACHE_VERSION = 54;

// 최신 자료 기준 (기본 36시간, 환경변수 NEWS_MAX_AGE_HOURS로 조정 가능)
const NEWS_MAX_AGE_HOURS = Math.max(1, Number.parseInt(process.env.NEWS_MAX_AGE_HOURS || '36', 10) || 36);
const NEWS_MAX_AGE_MS = NEWS_MAX_AGE_HOURS * 60 * 60 * 1000;
export const CONTENT_VERSION = 137;

// 같은 서버/빌드 프로세스에서 Claude 인증 오류가 확인되면 이후 호출을 중단합니다.
// API 키 오류 때문에 모든 정적 페이지가 반복 실패하는 것을 방지합니다.
let claudeAuthUnavailable = false;
let claudeStructuredUnsupported = false;

function externalSignal(timeoutMs = 8000) {
  return AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 8000));
}

function parsePublishedAt(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0 ? time : 0;
}

function isRecentNewsDate(value) {
  const time = parsePublishedAt(value);
  return time > 0 && time >= Date.now() - NEWS_MAX_AGE_MS && time <= Date.now() + 5 * 60 * 1000;
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}

// 피드 제목은 기사 제목을 복사하지 않고, 검색 주제와 사건 핵심을 STELLATE 문체로 재구성합니다.
function headlineTokens(value = '') {
  return stripHtml(value).toLowerCase().replace(/[^0-9a-zㄱ-힣\s]/g, ' ').split(/\s+/)
    .filter(token => token.length > 1)
    .filter(token => !['속보','단독','종합','영상','포토','뉴스','오늘','공식','발표','관련','논란','화제'].includes(token));
}

function headlineSimilarity(a = '', b = '') {
  const left = new Set(headlineTokens(a));
  const right = new Set(headlineTokens(b));
  if (!left.size || !right.size) return 0;
  const common = [...left].filter(token => right.has(token)).length;
  return common / Math.max(1, Math.min(left.size, right.size));
}



function buildEditorialHeadline(keyword, source = '', summary = '') {
  const clean = input => stripHtml(String(input || '')).replace(/\s+/g, ' ').trim();
  const topic = clean(keyword);
  const sourceTokens = headlineTokens(`${summary} ${source}`)
    .filter(token => !headlineTokens(topic).includes(token))
    .slice(0, 5);
  if (sourceTokens.length >= 2) return `${topic}, ${sourceTokens.join(' ')}`.slice(0, 32);
  return `${topic}, 검증된 핵심 사실`.slice(0, 32);
}

function normalizeFeedTitle(keyword, value, fallbackSummary = '', sourceTitle = '', sourceTitles = []) {
  const clean = input => stripHtml(String(input || '')).replace(/\s+/g, ' ').trim();
  const normalizedKeyword = clean(keyword);
  let title = clean(value || fallbackSummary);
  const allSources = [sourceTitle, ...(Array.isArray(sourceTitles) ? sourceTitles : [])].map(clean).filter(Boolean);

  const looksCopied = allSources.some(source => title === source || headlineSimilarity(title, source) >= 0.82);
  const tooGeneric = !title || title === normalizedKeyword || title.length < 18 || title.length > 32 || /최신\s*(소식|뉴스|이슈)|화제입니다|관심이 높아/.test(title);
  if (looksCopied || tooGeneric) title = buildEditorialHeadline(normalizedKeyword, sourceTitle, fallbackSummary);

  if (normalizedKeyword && !headlineTokens(title).some(token => headlineTokens(normalizedKeyword).includes(token))) {
    title = `${normalizedKeyword}, ${title}`;
  }
  title = title.replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  if (allSources.some(source => title === source || headlineSimilarity(title, source) >= 0.88)) {
    title = `${normalizedKeyword}, 검증된 핵심 사실`.slice(0, 32);
  }
  return title;
}


function normalizeDetailTitle(keyword, value, feedTitle = '', sourceTitles = []) {
  const clean = input => stripHtml(String(input || '')).replace(/\s+/g, ' ').trim();
  const topic = clean(keyword);
  let title = clean(value);
  const sources = Array.isArray(sourceTitles) ? sourceTitles.map(clean).filter(Boolean) : [];
  const invalid = !title || title.length < 28 || title.length > 50 || sources.some(source => title === source || headlineSimilarity(title, source) >= 0.78);
  if (invalid) {
    const feed = clean(feedTitle);
    title = feed ? `${feed}, 확인된 배경과 핵심 내용` : `${topic}, 확인된 사실과 핵심 내용`;
  }
  if (topic && !headlineTokens(title).some(token => headlineTokens(topic).includes(token))) title = `${topic}, ${title}`;
  return title.replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 50);
}

function formatKoreanDateTime(value) {
  const time = parsePublishedAt(value);
  if (!time) return '';
  return new Date(time).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function sourceFromUrl(value, fallback = '뉴스') {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || fallback;
  } catch {
    return fallback;
  }
}

function mergeLatestNews(...groups) {
  const seen = new Set();
  return groups
    .flat()
    .filter(item => item?.title && isRecentNewsDate(item.publishedAt))
    .sort((a, b) => parsePublishedAt(b.publishedAt) - parsePublishedAt(a.publishedAt))
    .filter(item => {
      const key = stripHtml(item.title).replace(/\s+/g, ' ').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ─── TOP 품질 산정용 네이버 신호: 발견용으로만 사용 ───
export async function fetchNaverTrendSignal(keyword) {
  try {
    const CLIENT_ID = process.env.NAVER_CLIENT_ID;
    const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
    if (!keyword) return { ok:false, count:0, items:[], error:'naver_keyword_missing' };
    if (!CLIENT_ID || !CLIENT_SECRET) return { ok:false, count:0, items:[], error:'naver_credentials_missing' };
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=50&sort=date`,
      { headers: { 'X-Naver-Client-Id': CLIENT_ID, 'X-Naver-Client-Secret': CLIENT_SECRET }, signal: externalSignal(8000) }
    );
    if (!res.ok) return { ok:false, count:0, items:[], error:`naver_http_${res.status}` };
    const data = await res.json();
    const cutoff = Date.now() - NEWS_MAX_AGE_MS;
    const byDomain = new Map();
    const items = [];
    for (const item of data.items || []) {
      const published = parsePublishedAt(item.pubDate);
      if (!published || published < cutoff) continue;
      const link = canonicalizeUrl(item.originallink || item.link);
      const source = sourceFromUrl(link, '네이버뉴스');
      const used = byDomain.get(source) || 0;
      if (used >= 5) continue;
      byDomain.set(source, used + 1);
      items.push({
        title: stripHtml(item.title), link, source,
        publishedAt: new Date(item.pubDate).toISOString(), date: formatKoreanDateTime(item.pubDate),
        provider: 'naver', discoveryOnly: true, contentUsable: false,
      });
    }
    return { ok:true, count:items.length, items:items.slice(0,10), error:'' };
  } catch (error) {
    return { ok:false, count:0, items:[], error:error?.message||'naver_request_failed' };
  }
}

export async function fetchNaverArticleCount(keyword) {
  return (await fetchNaverTrendSignal(keyword)).count;
}

function localDateString(offsetDays=0){
  const now=new Date(Date.now()+9*60*60*1000+offsetDays*86400000);
  return now.toISOString().slice(0,10);
}

// 네이버 뉴스 문서 수와 검색량은 다른 지표입니다. DataLab은 검색 상승률 보조 신호로만 사용합니다.
export async function fetchNaverSearchTrendScores(keywords=[]) {
  const CLIENT_ID=process.env.NAVER_CLIENT_ID;
  const CLIENT_SECRET=process.env.NAVER_CLIENT_SECRET;
  const unique=[...new Set((Array.isArray(keywords)?keywords:[]).map(value=>String(value||'').trim()).filter(Boolean))].slice(0,40);
  if(!CLIENT_ID||!CLIENT_SECRET||!unique.length)return {};
  const result={};
  for(let start=0;start<unique.length;start+=5){
    const batch=unique.slice(start,start+5);
    try{
      const res=await fetch('https://openapi.naver.com/v1/datalab/search',{method:'POST',headers:{'Content-Type':'application/json','X-Naver-Client-Id':CLIENT_ID,'X-Naver-Client-Secret':CLIENT_SECRET},body:JSON.stringify({startDate:localDateString(-7),endDate:localDateString(0),timeUnit:'date',keywordGroups:batch.map((keyword,index)=>({groupName:`g${start+index}`,keywords:[keyword]}))}),signal:externalSignal(10000)});
      if(!res.ok)continue;
      const data=await res.json();
      (data.results||[]).forEach((row,index)=>{
        const keyword=batch[index];
        const values=(row.data||[]).map(point=>Number(point.ratio||0));
        const latest=values.at(-1)||0;
        const recent=values.slice(-2);const previous=values.slice(0,-2);
        const recentAvg=recent.length?recent.reduce((a,b)=>a+b,0)/recent.length:latest;
        const previousAvg=previous.length?previous.reduce((a,b)=>a+b,0)/previous.length:0;
        const growth=previousAvg>0?(recentAvg-previousAvg)/previousAvg:(recentAvg>0?1:0);
        result[keyword]={latest:Number(latest.toFixed(2)),recentAvg:Number(recentAvg.toFixed(2)),previousAvg:Number(previousAvg.toFixed(2)),growth:Number(Math.max(-1,Math.min(4,growth)).toFixed(3))};
      });
    }catch{}
  }
  return result;
}

// 네이버 검색결과는 콘텐츠 원문으로 저장·재가공하지 않고 발견 링크로만 사용합니다.
export async function fetchNaverNews(keyword) {
  try {
    const CLIENT_ID = process.env.NAVER_CLIENT_ID;
    const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) return [];
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=20&sort=date`,
      { headers: { 'X-Naver-Client-Id': CLIENT_ID, 'X-Naver-Client-Secret': CLIENT_SECRET }, signal: externalSignal(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).filter(item => isRecentNewsDate(item.pubDate)).map(item => {
      const originalLink = canonicalizeUrl(item.originallink || '');
      const naverLink = canonicalizeUrl(item.link || '');
      const link = originalLink || naverLink;
      const publishedAt = new Date(item.pubDate).toISOString();
      return {
        title: stripHtml(item.title), link, originalLink, naverLink,
        fallbackLinks: [originalLink, naverLink].filter(Boolean),
        source: sourceFromUrl(originalLink || naverLink, '네이버뉴스'),
        description: stripHtml(item.description || ''),
        publishedAt, date: formatKoreanDateTime(publishedAt), provider: 'naver',
        discoveryOnly: true, contentUsable: false,
      };
    }).sort((a,b)=>parsePublishedAt(b.publishedAt)-parsePublishedAt(a.publishedAt));
  } catch { return []; }
}


// ─── TOP 기반 AI 리서치·멀티소스 조사 ─────────────────────
export async function fetchNaverWebDocuments(keyword, display = 10) {
  try {
    const CLIENT_ID=process.env.NAVER_CLIENT_ID;
    const CLIENT_SECRET=process.env.NAVER_CLIENT_SECRET;
    if(!CLIENT_ID||!CLIENT_SECRET||!keyword)return [];
    const count=Math.max(1,Math.min(20,Number(display||10)));
    const res=await fetch(`https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(keyword)}&display=${count}`,{
      headers:{'X-Naver-Client-Id':CLIENT_ID,'X-Naver-Client-Secret':CLIENT_SECRET},signal:externalSignal(8000),
    });
    if(!res.ok)return [];
    const data=await res.json();
    return (data.items||[]).map(item=>{
      const link=canonicalizeUrl(item.link||'');
      const classification=classifySource(link,'naver_web');
      return {
        title:stripHtml(item.title),description:stripHtml(item.description||''),link,
        source:sourceFromUrl(link,'웹 문서'),provider:'naver_web',
        discoveryUsable:classification.discoveryUsable,evidenceUsable:false,contentUsable:false,
        sourceType:classification.sourceType,rightsBasis:classification.rightsBasis,
      };
    }).filter(item=>item.link);
  }catch{return [];}
}

function naverPostDateToIso(value='') {
  const text=String(value||'').replace(/[^0-9]/g,'');
  if(!/^20\d{6}$/.test(text))return null;
  const year=text.slice(0,4),month=text.slice(4,6),day=text.slice(6,8);
  const date=new Date(`${year}-${month}-${day}T00:00:00+09:00`);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}

// 온라인 반응은 사실 근거와 분리된 임시 입력입니다. 게시 시각을 확인할 수 있는
// 블로그·카페 검색 결과만 받고, 원문·계정·URL은 요약 생성 후 최종 데이터에 남기지 않습니다.
export async function fetchNaverOnlineReactionInputs(keyword, display=20) {
  try {
    const CLIENT_ID=process.env.NAVER_CLIENT_ID;
    const CLIENT_SECRET=process.env.NAVER_CLIENT_SECRET;
    if(!CLIENT_ID||!CLIENT_SECRET||!keyword)return [];
    const count=Math.max(1,Math.min(30,Number(display||20)));
    const headers={'X-Naver-Client-Id':CLIENT_ID,'X-Naver-Client-Secret':CLIENT_SECRET};
    const endpoints=[
      {type:'blog',url:`https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=${count}&sort=date`},
      {type:'cafe',url:`https://openapi.naver.com/v1/search/cafearticle.json?query=${encodeURIComponent(keyword)}&display=${count}&sort=date`},
    ];
    const rows=await Promise.all(endpoints.map(async endpoint=>{
      try{
        const res=await fetch(endpoint.url,{headers,signal:externalSignal(8000)});
        if(!res.ok)return [];
        const data=await res.json();
        return (data.items||[]).map(item=>({
          type:endpoint.type,
          title:stripHtml(item.title||''),
          description:stripHtml(item.description||''),
          link:canonicalizeUrl(item.link||''),
          publishedAt:naverPostDateToIso(item.postdate||item.pubDate||''),
          provider:`naver_${endpoint.type}`,
          temporary:true,
        })).filter(item=>item.link&&item.publishedAt);
      }catch{return [];}
    }));
    return rows.flat();
  }catch{return [];}
}

async function planTopicResearchWithAI(topicTitle, trendMeta={}) {
  const fallback=buildDeterministicResearchPlan(topicTitle,trendMeta);
  const apiKey=String(process.env.ANTHROPIC_API_KEY||'').trim();
  if(!apiKey||claudeAuthUnavailable)return fallback;
  // 명확한 유형은 비용과 지연을 줄이기 위해 결정론적 계획을 사용합니다.
  if(fallback.topicType!=='general')return fallback;
  const prompt=`STELLATE의 독립 조사 계획을 JSON으로 작성하세요.
확정 키워드: ${topicTitle}

원칙:
- TOP 후보 생성 과정의 기사 제목·사건 분류·요약은 입력으로 사용하지 않습니다.
- 확정 키워드만 기준으로 새 검색어를 만드세요.
- 최근 36시간 안에 게시·수정된 자료만 조사 대상으로 삼으세요.
- 공식자료·공공데이터·공식 페이지를 우선하고 뉴스는 교차 확인용으로 사용하세요.
- 카페·블로그·SNS는 온라인 동향 전용이며 사실 원장과 본문 근거로 사용하지 않습니다.
- query는 한국어 검색어 2~4개
JSON: {"topicType":"general|weather|sports|service_status|product|company|public_policy|entertainment|security","entity":"","eventType":"","queries":[""],"officialKinds":[""],"collectNews":true,"collectVideos":true,"detailedMinFacts":1}`;
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},signal:externalSignal(10000),
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:450,messages:[{role:'user',content:prompt}]})
    });
    if(!res.ok)return fallback;
    const data=await res.json();
    const parsed=JSON.parse(String(data.content?.[0]?.text||'').replace(/```json|```/g,'').trim());
    return normalizeResearchPlan({...parsed,planner:'ai'},topicTitle,trendMeta);
  }catch{return fallback;}
}

function weatherCodeLabel(code){
  const value=Number(code);
  if(value===0)return '맑음';
  if([1,2,3].includes(value))return '구름';
  if([45,48].includes(value))return '안개';
  if(value>=51&&value<=67)return '비';
  if(value>=71&&value<=77)return '눈';
  if(value>=80&&value<=82)return '소나기';
  if(value>=95)return '뇌우';
  return '기상 변화';
}

function kmaSkyLabel(value){
  const code=Number(value);
  if(code===1)return '맑음';
  if(code===3)return '구름 많음';
  if(code===4)return '흐림';
  return '기상 변화';
}

function kmaPtyLabel(value){
  const code=Number(value);
  return ({1:'비',2:'비 또는 눈',3:'눈',4:'소나기',5:'빗방울',6:'빗방울 또는 눈날림',7:'눈날림'})[code]||'';
}


function buildKmaUrl({serviceKey,baseDate,baseTime,nx,ny}){
  const encodedKey=/%[0-9A-F]{2}/i.test(serviceKey)?serviceKey:encodeURIComponent(serviceKey);
  return `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${encodedKey}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;
}

function parseKmaCityForecast(items=[], targetDate=''){
  const rows=(Array.isArray(items)?items:[]).filter(item=>String(item.fcstDate||'')===targetDate);
  if(!rows.length)return null;
  const temps=rows.filter(item=>item.category==='TMP').map(item=>Number(item.fcstValue)).filter(Number.isFinite);
  const pops=rows.filter(item=>item.category==='POP').map(item=>Number(item.fcstValue)).filter(Number.isFinite);
  const pty=rows.filter(item=>item.category==='PTY').map(item=>Number(item.fcstValue)).find(value=>value>0);
  const sky=rows.filter(item=>item.category==='SKY').map(item=>Number(item.fcstValue)).filter(Number.isFinite);
  if(!temps.length)return null;
  const condition=pty?kmaPtyLabel(pty):kmaSkyLabel(sky.length?Math.max(...sky):null);
  return {
    min:Math.min(...temps),max:Math.max(...temps),
    rain:pops.length?Math.max(...pops):null,condition,
  };
}

async function fetchKmaWeatherStructuredEvidence(plan, topicTitle=''){
  if(plan.topicType!=='weather')return [];
  const serviceKey=String(process.env.KMA_SERVICE_KEY||'').trim();
  if(!serviceKey)return [];
  const cities=[
    {name:'서울',nx:60,ny:127},{name:'부산',nx:98,ny:76},
    {name:'대구',nx:89,ny:90},{name:'대전',nx:67,ny:100},
    {name:'광주',nx:58,ny:74},{name:'제주',nx:52,ny:38},
  ];
  const {baseDate,baseTime}=resolveKmaBaseDateTime(new Date());
  const targetDate=resolveWeatherTargetDate(topicTitle,new Date());
  const rows=await mapWithConcurrency(cities,3,async city=>{
    try{
      const url=buildKmaUrl({serviceKey,baseDate,baseTime,nx:city.nx,ny:city.ny});
      const res=await fetch(url,{signal:externalSignal(9000),headers:{'User-Agent':'STELLATEBot/8.0.48 (+https://stellate.co.kr)'}});
      if(!res.ok)return null;
      const data=await res.json();
      const header=data?.response?.header||{};
      if(!['00','0'].includes(String(header.resultCode??'')))return null;
      const forecast=parseKmaCityForecast(data?.response?.body?.items?.item||[],targetDate);
      return forecast?{city:city.name,date:targetDate,...forecast}:null;
    }catch{return null;}
  });
  const valid=rows.filter(Boolean);
  if(!valid.length)return [];
  const displayDate=`${targetDate.slice(0,4)}-${targetDate.slice(4,6)}-${targetDate.slice(6,8)}`;
  const facts=valid.map(row=>`${displayDate} ${row.city}의 최저기온은 ${row.min}도, 최고기온은 ${row.max}도이며, 날씨 상태는 ${row.condition}${row.rain!=null?`, 최대 강수확률은 ${row.rain}%로 예보됐다`:''}`);
  const source=makeStructuredApiSource({
    source:'기상청 단기예보',link:'https://www.data.go.kr/data/15084084/openapi.do',sourceType:'official',
    rightsBasis:'public_data_attribution_type1',facts,publishedAt:new Date().toISOString(),
    metadata:{cities:valid.map(row=>row.city),topicType:'weather',baseDate,baseTime,targetDate,provider:'kma'},
  });
  return source?[source]:[];
}

async function fetchOpenMeteoWeatherStructuredEvidence(plan, topicTitle=''){
  if(plan.topicType!=='weather'||String(process.env.OPEN_METEO_ENABLED||'').toLowerCase()!=='true')return [];
  const cities=[
    {name:'서울',lat:37.5665,lon:126.9780},{name:'부산',lat:35.1796,lon:129.0756},
    {name:'대구',lat:35.8714,lon:128.6014},{name:'대전',lat:36.3504,lon:127.3845},
    {name:'광주',lat:35.1595,lon:126.8526},{name:'제주',lat:33.4996,lon:126.5312},
  ];
  const offset=/내일|익일/.test(topicTitle)?1:0;
  const rows=await mapWithConcurrency(cities,3,async city=>{
    try{
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=3`;
      const res=await fetch(url,{signal:externalSignal(8000),headers:{'User-Agent':'STELLATEBot/8.0.48 (+https://stellate.co.kr)'}});
      if(!res.ok)return null;
      const data=await res.json();
      const date=data.daily?.time?.[offset];
      const min=data.daily?.temperature_2m_min?.[offset];
      const max=data.daily?.temperature_2m_max?.[offset];
      const rain=data.daily?.precipitation_probability_max?.[offset];
      const code=data.daily?.weather_code?.[offset];
      if(!date||!Number.isFinite(Number(min))||!Number.isFinite(Number(max)))return null;
      return {city:city.name,date,min:Number(min),max:Number(max),rain:Number.isFinite(Number(rain))?Number(rain):null,condition:weatherCodeLabel(code)};
    }catch{return null;}
  });
  const valid=rows.filter(Boolean);
  if(!valid.length)return [];
  const facts=valid.map(row=>`${row.date} ${row.city}의 최저기온은 ${row.min}도, 최고기온은 ${row.max}도이며, 날씨 상태는 ${row.condition}${row.rain!=null?`, 최대 강수확률은 ${row.rain}%로 예보됐다`:''}`);
  const source=makeStructuredApiSource({
    source:'Open-Meteo',link:'https://open-meteo.com/',sourceType:'authorized',
    rightsBasis:'operator_confirmed_open_meteo_license',facts,publishedAt:new Date().toISOString(),
    metadata:{cities:valid.map(row=>row.city),topicType:'weather',provider:'open_meteo'},
  });
  return source?[source]:[];
}

async function fetchWeatherStructuredEvidence(plan, topicTitle=''){
  const official=await fetchKmaWeatherStructuredEvidence(plan,topicTitle);
  if(official.length)return official;
  return fetchOpenMeteoWeatherStructuredEvidence(plan,topicTitle);
}

async function fetchOfficialWebEvidence(plan, topicTitle='') {
  const queries=(plan.queries||[topicTitle]).slice(0,3);
  const docs=(await Promise.all(queries.map(query=>fetchNaverWebDocuments(query,10)))).flat();
  const seen=new Set();
  const officialCandidates=docs.filter(item=>{
    const url=canonicalizeUrl(item.link||'');
    if(!url||seen.has(url))return false;seen.add(url);
    const cls=classifySource(url,'naver_web');
    return cls.bodyFetchAllowed&&['official','authorized','trusted_news'].includes(cls.sourceType);
  }).slice(0,10);
  const enriched=await mapWithConcurrency(officialCandidates,3,fetchVerifiedSourceMetadata);
  return enriched.filter(item=>(item.evidenceUsable??item.contentUsable)&&['official','authorized','trusted_news'].includes(item.sourceType)).slice(0,10);
}

function buildProfileEvidence(items=[],topicTitle='') {
  const topicTokens=cleanText(topicTitle).toLowerCase().split(/\s+/).filter(token=>token.length>1);
  const seen=new Set();
  return (Array.isArray(items)?items:[]).map(item=>{
    const link=canonicalizeUrl(item.link||'');
    const text=cleanText(`${item.title||''} ${item.description||''}`);
    if(!link||text.length<24)return null;
    if(/blog\.naver\.com|cafe\.naver\.com|instagram\.com|facebook\.com|x\.com|twitter\.com/i.test(link))return null;
    if(topicTokens.length&&!topicTokens.some(token=>text.toLowerCase().includes(token)))return null;
    const classification=classifySource(link,'naver_web');
    const sourceType=['official','authorized','trusted_news','independent'].includes(classification.sourceType)?classification.sourceType:'independent';
    return normalizeSourceItem({...item,sourceType,rightsBasis:'profile_search_metadata_fact_verification',evidenceUsable:true,contentUsable:true,discoveryOnly:false,bodyFetchAllowed:false,textReuseAllowed:false,provider:'profile_metadata',evidenceScope:'profile'});
  }).filter(item=>{
    const key=item?.canonicalUrl||item?.link;if(!key||seen.has(key))return false;seen.add(key);return true;
  }).slice(0,6);
}

function attachProfileFacts(ledger={},profileEvidence=[],topicTitle='') {
  const baseSources=Array.isArray(ledger.sources)?[...ledger.sources]:[];
  const baseFacts=Array.isArray(ledger.facts)?[...ledger.facts]:[];
  const profileFacts=[];
  (Array.isArray(profileEvidence)?profileEvidence:[]).forEach((item,index)=>{
    const sourceId=`P${index+1}`;
    baseSources.push({id:sourceId,source:item.source||item.domain||'기본정보 자료',url:item.canonicalUrl||item.link||'',domain:item.domain||'',sourceType:item.sourceType||'independent',publishedAt:item.publishedAt||null,scope:'profile'});
    const sentences=cleanText(`${item.description||''} ${item.title||''}`).split(/(?<=[.!?다요])\s+|[•·]\s*/).map(cleanText)
      .filter(text=>text.length>=12&&text.length<=260)
      .filter(text=>/가수|배우|방송인|선수|기업|회사|제품|서비스|작품|프로그램|도시|지역|기관|그룹|팀|브랜드|활동|데뷔|소속|출신|장르|기능|특징/.test(text))
      .slice(0,2);
    sentences.forEach(text=>profileFacts.push({id:`PF${profileFacts.length+1}`,text,type:'profile',scope:'profile',subject:topicTitle,predicate:'',values:[],eventAt:null,publishedAt:item.publishedAt||null,modifiedAt:item.modifiedAt||null,sourceIds:[sourceId],sourceType:item.sourceType||'independent',status:'single_source',confidence:item.sourceType==='official'?1:0.78}));
  });
  return {...ledger,sources:baseSources,facts:[...profileFacts,...baseFacts],confirmedFacts:[...(ledger.confirmedFacts||[])],profileFactCount:profileFacts.length};
}

export async function researchTopic(keyword, context={}) {
  // TOP 후보의 순위 산정 자료는 사실 근거로 재사용하지 않습니다.
  // 다만 잘린 검색 문구를 대표 엔티티로 해석하기 위한 텍스트 힌트만 검색어 확장에 사용합니다.
  const unique=rows=>[...new Set((Array.isArray(rows)?rows:[]).map(cleanText).filter(Boolean))];
  const identityHints=unique([
    context.researchKeyword||keyword,
    ...(Array.isArray(context.identityHints)?context.identityHints:[]),
    ...(Array.isArray(context.candidateTerms)?context.candidateTerms:[]),
    context.originalRankedKeyword||'',
  ]).slice(0,8);
  const topicTitle=cleanText(identityHints[0]||keyword).slice(0,60);
  const researchAttempt=Math.max(1,Math.min(5,Number(context.researchAttempt||1)));
  const independentContext={keyword:topicTitle,topKeyword:topicTitle,researchKeyword:topicTitle,researchAttempt,identityHints};
  const cacheKey=`v848:a${researchAttempt}:${identityHints.join('|').toLowerCase().replace(/\s+/g,' ').trim()}`;
  const cached=await getExternalCache('topic_research',cacheKey);
  if(cached?.researchPlan&&cached?.factLedger)return cached;
  let plan=await planTopicResearchWithAI(topicTitle,independentContext);
  const identityQueries=identityHints.slice(1,5).flatMap(hint=>[
    hint,
    context.researchTopicHint?`${hint} ${cleanText(context.researchTopicHint)}`:'',
  ]);
  const baseQueries=unique([topicTitle,...identityQueries,...(Array.isArray(plan.queries)?plan.queries:[])]).slice(0,6);
  const baseProfileQueries=unique([`${topicTitle} 기본정보`,`${topicTitle} 공식`,...identityHints.slice(1,4).map(hint=>`${hint} 기본정보`),...(Array.isArray(plan.profileQueries)?plan.profileQueries:[])]).slice(0,4);
  plan={...plan,queries:baseQueries,profileQueries:baseProfileQueries,researchAttempt,identityHintCount:identityHints.length};
  if(researchAttempt>1){
    const expanded=[
      `${topicTitle} 최신`,`${topicTitle} 공식`,`${topicTitle} 사건`,`${topicTitle} 일정`,
      ...identityHints.flatMap(hint=>[`${hint} 최신`,`${hint} 공식`]),
      ...(Array.isArray(plan.queries)?plan.queries:[]),topicTitle,
    ];
    const profileExpanded=[`${topicTitle} 기본정보`,`${topicTitle} 프로필`,`${topicTitle} 공식`,...identityHints.map(hint=>`${hint} 기본정보`),...(Array.isArray(plan.profileQueries)?plan.profileQueries:[])];
    plan={...plan,queries:unique(expanded).slice(0,8),profileQueries:unique(profileExpanded).slice(0,6),researchAttempt,expandedResearch:true};
  }
  const diagnostics={planner:plan.planner,topicType:plan.topicType,researchAttempt,expandedResearch:researchAttempt>1,errors:[]};
  const newsPromise=plan.collectNews!==false
    ? fetchNewsForKeyword(plan.queries?.[0]||topicTitle,independentContext).catch(error=>{diagnostics.errors.push(`news:${error?.message||'failed'}`);return {items:[],evidenceSources:[],relatedNews:[],relatedContent:[],discoveryCount:0,rejectionStats:{source_fetch_failed:1},maxAgeHours:NEWS_MAX_AGE_HOURS};})
    : Promise.resolve({items:[],evidenceSources:[],relatedNews:[],relatedContent:[],discoveryCount:0,maxAgeHours:NEWS_MAX_AGE_HOURS});
  const officialPromise=fetchOfficialWebEvidence(plan,topicTitle).catch(error=>{diagnostics.errors.push(`official:${error?.message||'failed'}`);return [];});
  const structuredPromise=fetchWeatherStructuredEvidence(plan,topicTitle).catch(error=>{diagnostics.errors.push(`structured:${error?.message||'failed'}`);return [];});
  const videoPromise=plan.collectVideos!==false
    ? fetchYoutubeVideosFull(plan.queries?.[0]||topicTitle).catch(error=>{diagnostics.errors.push(`video:${error?.message||'failed'}`);return [];})
    : Promise.resolve([]);
  const webLinksPromise=Promise.all((plan.queries||[topicTitle]).slice(0,2).map(query=>fetchNaverWebDocuments(query,8))).then(rows=>rows.flat()).catch(()=>[]);
  const profileLinksPromise=Promise.all((plan.profileQueries||[`${topicTitle} 기본정보`]).slice(0,2).map(query=>fetchNaverWebDocuments(query,8))).then(rows=>rows.flat()).catch(()=>[]);
  const onlineReactionPromise=fetchNaverOnlineReactionInputs(plan.queries?.[0]||topicTitle,20).catch(error=>{diagnostics.errors.push(`online_reaction:${error?.message||'failed'}`);return [];});
  const [newsBundle,officialEvidence,structuredEvidence,videos,webLinks,profileLinks,dedicatedOnlineInputs]=await Promise.all([newsPromise,officialPromise,structuredPromise,videoPromise,webLinksPromise,profileLinksPromise,onlineReactionPromise]);
  const {online:webOnlineInputs,factual:factualWebLinks}=splitOnlineReactionInputs(webLinks);
  const onlineInputs=[...dedicatedOnlineInputs,...webOnlineInputs];
  const relatedWeb=factualWebLinks.filter(item=>!['official','authorized','trusted_news'].includes(classifySource(item.link,'naver_web').sourceType)).map(item=>({...item,type:'reference'})).slice(0,6);
  const bundle=mergeResearchBundle({topicTitle,plan,newsBundle,officialEvidence,structuredEvidence,relatedContent:relatedWeb,relatedVideos:videos,diagnostics});
  const profileEvidence=buildProfileEvidence(profileLinks,topicTitle);
  bundle.profileEvidence=profileEvidence;
  bundle.factLedger=attachProfileFacts(bundle.factLedger,profileEvidence,topicTitle);
  bundle.promptText=buildStructuredFactPrompt(bundle.factLedger);
  bundle.onlineReactionRanking=buildOnlineReactionRankingSignal(onlineInputs);
  bundle.onlineReactionSummary=buildOnlineReactionSummary(onlineInputs);
  bundle.onlineReactionPromptText=buildOnlineReactionPromptInput(onlineInputs);
  bundle.onlineReactionInput=onlineReactionInputPolicy();
  bundle.researchCompleteness=researchCompleteness(bundle);
  bundle.researchIsolation={keywordOnly:true,topDiscoveryContextUsed:false,onlineSeparated:true,windowHours:36,researchAttempt,expandedResearch:researchAttempt>1};
  bundle.cutoffAt=bundle.cutoffAt||new Date(Date.now()-NEWS_MAX_AGE_MS).toISOString();
  bundle.maxAgeHours=NEWS_MAX_AGE_HOURS;
  await setExternalCache('topic_research',cacheKey,bundle,300);
  return bundle;
}

export async function fetchGoogleNews(keyword) {
  try {
    const encoded = encodeURIComponent(`${keyword} when:2d`);
    const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`);
    return (feed.items || []).filter(item => isRecentNewsDate(item.pubDate || item.isoDate)).map(item => {
      const publishedAt = new Date(item.pubDate || item.isoDate).toISOString();
      const sourceNode = item.sourceNode || item.source || {};
      const sourceUrl = typeof sourceNode === 'object' ? (sourceNode.url || sourceNode.$?.url || '') : '';
      const sourceName = typeof sourceNode === 'object' ? (sourceNode._ || sourceNode.name || item.creator) : (sourceNode || item.creator);
      const googleLink = canonicalizeUrl(item.link || '');
      const decodedLink = decodeLegacyGoogleNewsUrl(googleLink);
      return {
        title: stripHtml(item.title), link: decodedLink || googleLink,
        fallbackLinks: [decodedLink, googleLink].filter(Boolean),
        publisherUrl: canonicalizeUrl(sourceUrl || ''),
        source: stripHtml(sourceName) || sourceFromUrl(decodedLink || sourceUrl || googleLink, 'Google 뉴스'),
        publishedAt, date: formatKoreanDateTime(publishedAt), provider: 'google_news',
        description: stripHtml(item.description || item.contentSnippet || ''), discoveryOnly: true, contentUsable: false,
      };
    }).sort((a,b)=>parsePublishedAt(b.publishedAt)-parsePublishedAt(a.publishedAt));
  } catch { return []; }
}


function decodeLegacyGoogleNewsUrl(value = '') {
  try {
    const url = new URL(value);
    if (url.hostname !== 'news.google.com') return '';
    const match = url.pathname.match(/\/(?:rss\/)?articles\/([^/?]+)/i);
    if (!match?.[1]) return '';
    const token = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = token + '='.repeat((4 - token.length % 4) % 4);
    const buffer = Buffer.from(padded, 'base64');
    let start = 0;
    if (buffer.length > 4 && buffer[0] === 0x08 && buffer[1] === 0x13 && buffer[2] === 0x22) {
      start = 3;
      let length = 0, shift = 0, byte = 0;
      do {
        byte = buffer[start++];
        length |= (byte & 0x7f) << shift;
        shift += 7;
      } while ((byte & 0x80) && start < buffer.length && shift < 28);
      const candidate = buffer.subarray(start, Math.min(buffer.length, start + length)).toString('utf8').trim();
      if (/^https?:\/\//i.test(candidate) && !/news\.google\.com/i.test(candidate)) return canonicalizeUrl(candidate);
    }
    const decoded = buffer.toString('utf8');
    const found = decoded.match(/https?:\/\/[^\s\u0000-\u001f"'<>]+/i)?.[0] || '';
    return found && !/news\.google\.com/i.test(found) ? canonicalizeUrl(found) : '';
  } catch { return ''; }
}

function uniqueSourceUrls(item = {}) {
  const values = [
    item.link, item.originallink, item.originalLink, item.naverLink,
    ...(Array.isArray(item.fallbackLinks) ? item.fallbackLinks : []),
  ];
  const result = [];
  for (const raw of values) {
    const value = canonicalizeUrl(raw || '');
    if (!/^https?:\/\//i.test(value)) continue;
    const decoded = decodeLegacyGoogleNewsUrl(value);
    for (const candidate of [decoded, value]) {
      if (candidate && !result.includes(candidate)) result.push(candidate);
    }
  }
  return result.slice(0, 3);
}

async function mapWithConcurrency(items = [], limit = 4, mapper) {
  const rows = Array.isArray(items) ? items : [];
  const output = new Array(rows.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= rows.length) break;
      output[index] = await mapper(rows[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), rows.length || 1) }, worker));
  return output;
}

function extractKnownArticleContainer(html = '') {
  const source = String(html || '');
  const patterns = [
    /<(?:article|div|section)[^>]+(?:id|class)=["'][^"']*(?:dic_area|newsct_article|articleBodyContents|article[_-]?body|article-view-content|article_content|news_body|view_content|article-body)[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|div|section)>/gi,
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
  ];
  const parts = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const text = cleanText(String(match[1] || '').replace(/<br\s*\/?\s*>/gi, '. '));
      if (text.length >= 60 && !/무단전재|재배포|저작권|쿠키|로그인|회원가입/.test(text)) parts.push(text);
      if (parts.join(' ').length >= 3200) break;
    }
    if (parts.join(' ').length >= 3200) break;
  }
  return [...new Set(parts)].join(' ').slice(0, 3200);
}

function extractMetaValue(html = '', keys = []) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
    ];
    for (const pattern of patterns) { const match = html.match(pattern); if (match?.[1]) return stripHtml(match[1]); }
  }
  return '';
}

function extractStructuredArticle(html='') {
  const result={};
  const scripts=[...String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const visit=value=>{
    if(!value)return;
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(typeof value!=='object')return;
    const type=Array.isArray(value['@type'])?value['@type'].join(' '):String(value['@type']||'');
    if(/Article|NewsArticle|Report|BlogPosting/i.test(type)||value.articleBody){
      result.title=result.title||cleanText(value.headline||value.name||'');
      result.description=result.description||cleanText(value.articleBody||value.description||'');
      result.publishedAt=result.publishedAt||value.datePublished||'';
      result.modifiedAt=result.modifiedAt||value.dateModified||'';
      const imageValue=Array.isArray(value.image)?value.image[0]:value.image;
      const imageUrl=typeof imageValue==='string'?imageValue:(imageValue?.url||imageValue?.contentUrl||'');
      result.imageUrl=result.imageUrl||canonicalizeUrl(imageUrl||'');
    }
    if(value['@graph'])visit(value['@graph']);
  };
  for(const script of scripts.slice(0,20)){
    try{visit(JSON.parse(script[1].replace(/&quot;/g,'"').trim()));}catch{}
    if(result.description?.length>500)break;
  }
  return result;
}

function extractArticleParagraphs(html='') {
  const known = extractKnownArticleContainer(html);
  if (known.length >= 120) return known;
  const cleaned=String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi,' ');
  const paragraphs=[...cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match=>cleanText(String(match[1]||'').replace(/<br\s*\/?\s*>/gi,'. ')))
    .filter(text=>text.length>=30&&text.length<=900)
    .filter(text=>!/무단전재|재배포|저작권|쿠키|로그인|회원가입|개인정보처리방침|기사제보/.test(text));
  const unique=[];
  for(const text of paragraphs){if(unique.some(row=>row===text))continue;unique.push(text);if(unique.join(' ').length>=3200)break;}
  return unique.join(' ').slice(0,3200);
}

function sourceFailureType(error, response=null){
  if(error?.name==='AbortError')return 'timeout';
  if(response){
    if(response.status===403)return 'http_403';
    if(response.status===404)return 'http_404';
    if(response.status===429)return 'http_429';
    if(response.status>=500)return 'http_5xx';
    if(response.status>=400)return `http_${response.status}`;
  }
  const message=String(error?.message||'').toLowerCase();
  if(message.includes('certificate')||message.includes('tls'))return 'tls_failed';
  if(message.includes('dns')||message.includes('enotfound'))return 'dns_failed';
  if(message.includes('redirect'))return 'redirect_loop';
  return 'connection_failed';
}

async function domainCircuitOpen(domain){
  if(!domain)return false;
  const health=await getExternalCache('source_health_v2',domain);
  return Boolean(health?.blockedUntil&&Number(health.blockedUntil)>Date.now());
}

async function recordSourceHealth(domain,{ok=false,failureType='',status=0}={}){
  if(!domain)return;
  const current=await getExternalCache('source_health_v2',domain)||{};
  if(ok){await setExternalCache('source_health_v2',domain,{failures:0,lastSuccessAt:Date.now(),blockedUntil:0},7200);return;}
  const failures=Number(current.failures||0)+1;
  const permanent=['http_403','http_404','unsupported_content_type','robots_or_policy_blocked','javascript_render_required'].includes(failureType);
  const blockedUntil=failures>=5?Date.now()+(permanent?2*60*60*1000:30*60*1000):Number(current.blockedUntil||0);
  await setExternalCache('source_health_v2',domain,{failures,lastFailureAt:Date.now(),failureType,status,blockedUntil},7200);
}

async function fetchVerifiedSourceMetadata(item) {
  const startedAt = Date.now();
  const normalized = normalizeSourceItem(item);
  const providerName = String(normalized.provider || '').toLowerCase();
  const discoveryProvider = ['naver','google_news','google'].includes(providerName) || /news\.google\./i.test(normalized.link || '');
  const candidates = uniqueSourceUrls(normalized);
  if (!candidates.length) {
    return { ...normalized, rejectionReason: 'missing_source_url', fetchDiagnostic:{failureType:'missing_source_url',durationMs:Date.now()-startedAt,retryable:false} };
  }

  const timeoutMs = Math.max(5000, Math.min(20000, Number(process.env.SOURCE_FETCH_TIMEOUT_MS || 12000)));
  const diagnostics = [];
  let lastFailure = 'connection_failed', lastStatus = 0, lastUrl = candidates[0];

  for (const candidateUrl of candidates) {
    const initialDirectClassification = classifySource(candidateUrl, 'direct');
    if (!initialDirectClassification.bodyFetchAllowed && !discoveryProvider) {
      diagnostics.push({url:candidateUrl,failureType:'source_policy_blocked_before_fetch',retryable:false});
      lastFailure = 'source_policy_blocked_before_fetch';
      continue;
    }
    const initialDomain = sourceFromUrl(candidateUrl,'');
    if (await domainCircuitOpen(initialDomain)) {
      diagnostics.push({url:candidateUrl,domain:initialDomain,failureType:'circuit_open',retryable:true});
      lastFailure = 'circuit_open';
      continue;
    }

    for (let attempt=1; attempt<=2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(candidateUrl, {
          redirect: 'follow', signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; STELLATEBot/8.0.48; +https://stellate.co.kr)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5',
          },
        });
        lastStatus = response.status; lastUrl = response.url || candidateUrl;
        if (!response.ok) {
          lastFailure = sourceFailureType(null,response);
          diagnostics.push({url:candidateUrl,finalUrl:lastUrl,failureType:lastFailure,httpStatus:response.status,retryable:response.status===429||response.status>=500,attempt});
          const retryable=response.status===429||response.status>=500;
          if(retryable&&attempt<2){await new Promise(resolve=>setTimeout(resolve,700*attempt));continue;}
          await recordSourceHealth(initialDomain,{failureType:lastFailure,status:response.status});
          break;
        }
        const contentType=String(response.headers.get('content-type')||'').toLowerCase();
        if(contentType&&!/text\/html|application\/xhtml\+xml|application\/xml/.test(contentType)){
          lastFailure='unsupported_content_type';
          diagnostics.push({url:candidateUrl,finalUrl:lastUrl,failureType:lastFailure,httpStatus:response.status,contentType,retryable:false,attempt});
          await recordSourceHealth(initialDomain,{failureType:lastFailure,status:response.status});
          break;
        }
        let finalUrl = canonicalizeUrl(response.url || candidateUrl);
        if (sourceFromUrl(finalUrl,'') === 'news.google.com' || sourceFromUrl(finalUrl,'').endsWith('.news.google.com')) {
          const decoded = decodeLegacyGoogleNewsUrl(finalUrl);
          lastFailure = decoded ? 'google_news_redirect_decode_deferred' : 'google_news_redirect_not_resolved';
          diagnostics.push({url:candidateUrl,finalUrl,failureType:lastFailure,httpStatus:response.status,retryable:false,attempt});
          break;
        }
        const finalDomain = sourceFromUrl(finalUrl,'');
        const finalClassification = classifySource(finalUrl, 'direct');
        if (!finalClassification.bodyFetchAllowed) {
          lastFailure='final_domain_not_allowed';
          diagnostics.push({url:candidateUrl,finalUrl,domain:finalDomain,failureType:lastFailure,httpStatus:response.status,retryable:false,attempt});
          break;
        }
        const html = (await response.text()).slice(0, 1000000);
        const structured=extractStructuredArticle(html);
        const title = structured.title || extractMetaValue(html, ['og:title','twitter:title']) || stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1] || normalized.title);
        const metaDescription = extractMetaValue(html, ['og:description','description','twitter:description']);
        const pageImage=canonicalizeUrl(structured.imageUrl||extractMetaValue(html,['og:image','twitter:image','twitter:image:src'])||'');
        const paragraphs=extractArticleParagraphs(html);
        const description = structured.description || paragraphs || metaDescription;
        if(cleanText(description).length<60){
          const jsShell=/<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(html)&&/<script/i.test(html);
          lastFailure=jsShell?'javascript_render_required':'empty_article_body';
          diagnostics.push({url:candidateUrl,finalUrl,domain:finalDomain,failureType:lastFailure,httpStatus:response.status,contentType,retryable:false,attempt,extractedLength:cleanText(description).length});
          await recordSourceHealth(finalDomain,{failureType:lastFailure,status:response.status});
          break;
        }
        const publishedAt = structured.publishedAt || extractMetaValue(html, ['article:published_time','datePublished']) || normalized.publishedAt;
        const modifiedAt = structured.modifiedAt || extractMetaValue(html, ['article:modified_time','dateModified']);
        await recordSourceHealth(finalDomain,{ok:true,status:response.status});
        return normalizeSourceItem({
          ...normalized, title: title || normalized.title, description, link: finalUrl,
          imageUrl:/^https?:\/\//i.test(pageImage)?pageImage:(normalized.imageUrl||normalized.thumbnail||null),
          source: normalized.source || sourceFromUrl(finalUrl), publishedAt, modifiedAt,
          provider: 'direct', discoveryOnly: false, evidenceUsable: true, contentUsable: true, bodyFetchAllowed:true, textReuseAllowed:false,
          sourceType: finalClassification.sourceType, rightsBasis: finalClassification.rightsBasis,
          fetchDiagnostic:{failureType:null,httpStatus:response.status,contentType,durationMs:Date.now()-startedAt,retryable:false,attempts:attempt,domain:finalDomain,finalUrl,attemptedUrls:diagnostics},
        });
      } catch(error) {
        lastFailure=sourceFailureType(error,null);
        const retryable=['timeout','connection_failed','dns_failed','tls_failed'].includes(lastFailure);
        diagnostics.push({url:candidateUrl,finalUrl:lastUrl,failureType:lastFailure,httpStatus:lastStatus,retryable,attempt,error:String(error?.message||'').slice(0,160)});
        if(retryable&&attempt<2){await new Promise(resolve=>setTimeout(resolve,700*attempt));continue;}
        await recordSourceHealth(initialDomain,{failureType:lastFailure,status:lastStatus});
        break;
      } finally { clearTimeout(timer); }
    }
  }
  return { ...normalized, rejectionReason:lastFailure, finalUrl:lastUrl, fetchDiagnostic:{failureType:lastFailure,httpStatus:lastStatus,durationMs:Date.now()-startedAt,retryable:['timeout','connection_failed','dns_failed','tls_failed','http_429','http_5xx'].includes(lastFailure),attemptedUrls:diagnostics} };
}

async function fetchLatestNewsItems(keyword, limit = 8, extraEvidence = []) {
  const [naverItems, googleItems] = await Promise.all([fetchNaverNews(keyword), fetchGoogleNews(keyword)]);
  const discoveryItems = mergeLatestNews(naverItems, googleItems).slice(0, 20);

  // v7.6: 뉴스는 연관 링크로 분리합니다. 본문 생성 근거로 읽는 대상은
  // 공식·사용허용 도메인과 관리자가 명시한 근거 자료뿐입니다.
  const configuredEvidence = (Array.isArray(extraEvidence) ? extraEvidence : []).map(item => ({
    ...item, provider:item.provider || 'configured_evidence', discoveryOnly:false,
  }));
  const officialCandidates = discoveryItems.filter(item => isSourceRelevantToTopic(item,keyword)).filter(item => {
    const classification = classifySource(item.link || item.originalLink || '', 'direct');
    return classification.bodyFetchAllowed && ['official','authorized','trusted_news'].includes(classification.sourceType);
  });
  const structuredEvidence=configuredEvidence.map(normalizeSourceItem).filter(item=>['official','authorized','trusted_news'].includes(item.sourceType)&&(item.evidenceUsable??item.contentUsable)&&cleanText(item.description||item.summary||'').length>=30);
  // 신뢰 도메인의 뉴스 검색 메타데이터는 제목·요약·발행시각을 교차 확인하는 근거로 사용할 수 있습니다.
  // 원문 페이지 직접 조회가 봇 차단으로 실패해도 전체 후보가 근거 0건으로 사라지지 않게 합니다.
  const metadataEvidence=discoveryItems.map(item=>{
    const link=canonicalizeUrl(item.link||item.originalLink||'');
    const classificationUrl=canonicalizeUrl(item.publisherUrl||item.originalLink||link||'');
    const classification=classifySource(classificationUrl,'direct');
    const description=cleanText(item.description||item.summary||item.snippet||'');
    const combined=cleanText(`${item.title||''} ${description}`);
    if(!link||combined.length<24||!isSourceRelevantToTopic(item,keyword))return null;
    const sourceType=['official','authorized','trusted_news','independent'].includes(classification.sourceType)
      ? classification.sourceType
      : 'independent';
    return normalizeSourceItem({
      ...item,link,description,sourceType,
      rightsBasis:sourceType==='official'?'official_search_metadata':sourceType==='trusted_news'?'trusted_news_search_metadata':'news_search_metadata_fact_verification',
      discoveryOnly:false,discoveryUsable:true,evidenceUsable:true,contentUsable:true,bodyFetchAllowed:false,textReuseAllowed:false,
      provider:`${item.provider||'news'}_metadata`,
    });
  }).filter(Boolean);
  const evidenceSeen=new Set(structuredEvidence.map(item=>canonicalizeUrl(item.link||item.url||item.canonicalUrl||'')).filter(Boolean));
  const evidenceCandidates=[...configuredEvidence,...officialCandidates].filter(item=>{const url=canonicalizeUrl(item.link||item.url||item.canonicalUrl||'');if(!url||evidenceSeen.has(url))return false;evidenceSeen.add(url);return true;}).slice(0,12);
  const concurrency = Math.max(1, Math.min(6, Number(process.env.SOURCE_FETCH_CONCURRENCY || 4)));
  const enriched = await mapWithConcurrency(evidenceCandidates, concurrency, fetchVerifiedSourceMetadata);
  const usableItems = [
    ...structuredEvidence,
    ...enriched.filter(item => (item.evidenceUsable ?? item.contentUsable) && ['official','authorized','trusted_news'].includes(item.sourceType) && (item.description || item.title)),
    ...metadataEvidence,
  ].filter((item,index,rows)=>rows.findIndex(row=>(row.canonicalUrl||row.link)===(item.canonicalUrl||item.link))===index).slice(0, limit);
  const rejectionStats = enriched.reduce((acc, item) => {
    if (item?.evidenceUsable ?? item?.contentUsable) return acc;
    const reason = item?.rejectionReason || 'not_usable';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});
  const rejectionSamples = enriched.filter(item=>!(item?.evidenceUsable ?? item?.contentUsable)).slice(0,8).map(item=>({
    source:item?.source||'', url:item?.link||'', reason:item?.rejectionReason||'not_usable', diagnostic:item?.fetchDiagnostic||null,
  }));
  return { items: usableItems, discoveryItems, rejectionStats, rejectionSamples };
}

export async function fetchNewsForKeyword(keyword, context = {}) {
  const cacheKey=String(keyword||'').toLowerCase().replace(/\s+/g,' ').trim();
  const cacheVersion='v829';
  const cached=await getExternalCache('content_sources',`${cacheVersion}:${cacheKey}`);
  if(cached?.relatedNews || cached?.items)return cached;
  const extraEvidence = context.evidenceSources || context.officialSources || context.referenceSources || [];
  const { items, discoveryItems, rejectionStats, rejectionSamples } = await fetchLatestNewsItems(keyword, 8, extraEvidence);
  const topic = context.displayTitle || context.topTitle || keyword;
  const factLedger = buildFactLedger(items,{topicTitle:topic});
  const relatedNews = buildRelatedNews(discoveryItems, topic);
  const relatedContent = buildRelatedContent(context.relatedLinks || context.relatedContent || [], topic);
  // 외부 원문 문장을 프롬프트에 전달하지 않고, 주체·행동·날짜·수치·근거 ID만 구조화합니다.
  const promptText = buildStructuredFactPrompt(factLedger);
  const bundle={
    items, evidenceSources:items, relatedNews, relatedContent, discoveryCount: discoveryItems.length, rejectionStats, rejectionSamples,
    sourcePolicy:'independent_content', factLedger,
    promptText,
    newestAt: items[0]?.publishedAt || relatedNews[0]?.publishedAt || null,
    cutoffAt: new Date(Date.now() - NEWS_MAX_AGE_MS).toISOString(), maxAgeHours: NEWS_MAX_AGE_HOURS,
  };
  await setExternalCache('content_sources',`${cacheVersion}:${cacheKey}`,bundle,300);
  return bundle;
}

export async function fetchNewsDetails(keyword) {
  return (await fetchLatestNewsItems(keyword, 3)).items;
}

// ─── Unsplash 사전 이미지 풀: 콘텐츠 생성 완료 후 풀 내부 선택 ─────────────
const UNSPLASH_UTM = 'utm_source=stellate&utm_medium=referral';
const IMAGE_SELECTOR_VERSION = 'v7-curated-pool-500';

function withUnsplashUtm(url) {
  if (!url) return null;
  return `${url}${url.includes('?') ? '&' : '?'}${UNSPLASH_UTM}`;
}

function normalizeImageMeta(value, extras = {}) {
  if (!value) return null;
  const rawImageUrl = typeof value === 'string'
    ? value
    : (value.imageUrl || value.url || value.urls?.regular || value.thumbUrl || value.urls?.small || null);
  if (!isUnsplashImageUrl(rawImageUrl)) return null;
  if (typeof value !== 'string' && value.source && String(value.source).toLowerCase() !== 'unsplash') return null;
  if (typeof value === 'string') {
    return {
      id: value,
      source: 'unsplash', imageUrl: value, thumbUrl: value,
      photographerName: '', photographerProfileUrl: null, unsplashPhotoUrl: null, downloadLocation: null,
      query: extras.query || null, imageConfidence: Number(extras.imageConfidence || 0), imageReason: extras.imageReason || null,
      altDescription: '', tags: [], selectorVersion: IMAGE_SELECTOR_VERSION,
      thumbnailImageId:null,thumbnailCategory:null,thumbnailPoolCategory:null,thumbnailMood:null,
      thumbnailSelectedAt:null,thumbnailSelectionType:null,poolVersion:null,
    };
  }
  const imageUrl = rawImageUrl;
  return {
    id: value.id || imageUrl,
    source: 'unsplash', imageUrl, thumbUrl: isUnsplashImageUrl(value.thumbUrl || value.urls?.small || '') ? (value.thumbUrl || value.urls?.small) : imageUrl,
    photographerName: value.photographerName || value.user?.name || '',
    photographerProfileUrl: value.photographerProfileUrl || withUnsplashUtm(value.user?.links?.html) || null,
    unsplashPhotoUrl: value.unsplashPhotoUrl || value.sourceUrl || withUnsplashUtm(value.links?.html) || null,
    downloadLocation: value.downloadLocation || value.links?.download_location || null,
    query: extras.query || value.query || null,
    imageConfidence: Number(extras.imageConfidence ?? value.imageConfidence ?? 0),
    imageReason: extras.imageReason || value.imageReason || null,
    altDescription: value.altDescription || value.alt_description || '',
    tags: Array.isArray(value.tags) ? value.tags.map(tag => tag?.title || tag?.name || tag).filter(Boolean).slice(0, 12) : [],
    selectorVersion: value.selectorVersion || IMAGE_SELECTOR_VERSION,
    thumbnailImageId:value.thumbnailImageId||null,
    thumbnailCategory:value.thumbnailCategory||null,
    thumbnailPoolCategory:value.thumbnailPoolCategory||null,
    thumbnailMood:value.thumbnailMood||null,
    thumbnailSelectedAt:value.thumbnailSelectedAt||null,
    thumbnailSelectionType:value.thumbnailSelectionType||null,
    poolVersion:value.poolVersion||null,
    preserved:value.preserved===true,
  };
}

function applyUnsplashImagePolicy(content = {}, preferredImageMeta = null) {
  const safeMeta = normalizeImageMeta(preferredImageMeta) || normalizeImageMeta(content.imageMeta) || normalizeImageMeta(content.image) || normalizeImageMeta(content.thumbnail);
  return {
    ...content,
    image: safeMeta?.imageUrl || null,
    thumbnail: safeMeta?.thumbUrl || safeMeta?.imageUrl || null,
    imageMeta: safeMeta,
    imageSource: safeMeta ? 'unsplash' : null,
    thumbnailSource: safeMeta ? 'Unsplash' : null,
    thumbnailImageId:safeMeta?.thumbnailImageId||null,
    thumbnailCategory:safeMeta?.thumbnailCategory||null,
    thumbnailMood:safeMeta?.thumbnailMood||null,
    thumbnailSelectedAt:safeMeta?.thumbnailSelectedAt||null,
    thumbnailSelectionType:safeMeta?.thumbnailSelectionType||null,
  };
}

export async function fetchUnsplashImage(category = 'general', seed = '') {
  return selectCuratedThumbnailForContent({category,slug:String(seed||''),topKeyword:String(seed||''),topTitle:String(seed||'')},null);
}

// 콘텐츠별 실시간 검색을 하지 않고 Redis의 사전 풀 안에서만 선택합니다.
async function resolveCoverImage(keyword, summary, categoryKey, apiKey, providedVisualQuery = '', existingImageMeta = null, contentContext = {}) {
  const existing=normalizeImageMeta(existingImageMeta);
  return selectCuratedThumbnailForContent({
    ...contentContext,
    category:CATEGORIES[categoryKey]?categoryKey:'general',
    topKeyword:contentContext.topKeyword||keyword||'',
    topTitle:contentContext.topTitle||keyword||'',
    card:{...(contentContext.card||{}),summary:contentContext.card?.summary||summary||''},
  },existing);
}

// TOP 후보 수집 단계에서는 이미지를 검색하거나 순위 계산에 사용하지 않습니다.
// 기존 사건에 고정된 풀/수동 이미지만 보존하고 신규 이미지는 콘텐츠 생성 완료 뒤 배정합니다.
async function attachUnsplashImages(trends) {
  const list = Array.isArray(trends) ? trends : [];
  return list.map(item => {
    const cachedMeta=normalizeImageMeta(item.imageMeta)||normalizeImageMeta(item.thumbnail);
    const fixedMeta=cachedMeta||null;
    return {...item,thumbnail:fixedMeta?.thumbUrl||fixedMeta?.imageUrl||null,thumbnailSource:fixedMeta?'Unsplash':null,imageMeta:fixedMeta,imageQuery:null,imageConfidence:Number(fixedMeta?.imageConfidence||0)};
  });
}

// ─── 유튜브 영상 (공식·신뢰 채널의 직접 관련 영상만) ──────────────
function youtubeWords(value=''){
  return cleanText(value).toLowerCase().replace(/[^0-9a-z가-힣\s]/g,' ').split(/\s+/)
    .filter(token=>token.length>1)
    .filter(token=>!['관련','공식','최신','영상','뉴스','이슈'].includes(token));
}

function youtubeChannelTrust(channel='',keyword=''){
  const value=cleanText(channel).toLowerCase();
  const compact=value.replace(/[^0-9a-z가-힣]/g,'');
  const topic=cleanText(keyword).toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
  const trusted=/(^|\s)(kbs|mbc|sbs|jtbc|ytn|연합뉴스|뉴스1|채널a|tv조선|mbn|ebs|공식|official|news|뉴스)(\s|$)/i.test(value)
    ||/(방송|신문|일보|미디어|엔터테인먼트|entertainment|스포츠|sports)/i.test(value);
  return trusted||(topic.length>=2&&compact.includes(topic));
}

function youtubeRelevance(item={},keyword=''){
  const title=cleanText(item?.snippet?.title||item.title||'').toLowerCase();
  const channel=cleanText(item?.snippet?.channelTitle||item.channel||'');
  const topic=cleanText(keyword).toLowerCase();
  const compactTopic=topic.replace(/[^0-9a-z가-힣]/g,'');
  const compactTitle=title.replace(/[^0-9a-z가-힣]/g,'');
  const words=youtubeWords(keyword);
  const matched=words.filter(word=>title.includes(word)).length;
  const exact=compactTopic.length>=2&&compactTitle.includes(compactTopic);
  const allWords=words.length>0&&matched===words.length;
  const channelTrusted=youtubeChannelTrust(channel,keyword);
  let score=(exact?50:0)+(allWords?20:0)+(channelTrusted?25:0);
  if(/공식|official|전체영상|다시보기|뉴스|브리핑|기자회견|쇼케이스|발표/.test(title))score+=8;
  const published=new Date(item?.snippet?.publishedAt||item.publishedAt||0).getTime();
  const ageHours=published?(Date.now()-published)/(60*60*1000):9999;
  if(ageHours<=36)score+=12;else if(ageHours<=24*7)score+=7;else if(ageHours<=24*30)score+=3;
  return {score,channelTrusted,directlyRelevant:exact||allWords};
}

export async function fetchYoutubeVideosFull(keyword) {
  try {
    const API_KEY = process.env.YOUTUBE_API_KEY;
    if(!API_KEY||!keyword)return [];
    const cacheKey=`v829:${String(keyword).toLowerCase().replace(/\s+/g,' ').trim()}`;
    const cached=await getExternalCache('youtube',cacheKey);
    if(Array.isArray(cached))return cached;
    const publishedAfter=new Date(Date.now()-30*24*60*60*1000).toISOString();
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&maxResults=10&regionCode=KR&relevanceLanguage=ko&order=relevance&publishedAfter=${encodeURIComponent(publishedAfter)}&safeSearch=strict&key=${API_KEY}`,
      { signal: externalSignal(9000) }
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const searchItems=Array.isArray(searchData.items)?searchData.items:[];
    const videoIds = searchItems.map(i => typeof i?.id === 'string' ? i.id : i?.id?.videoId).filter(Boolean).join(',');
    if (!videoIds) return [];
    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${API_KEY}`,
      { signal: externalSignal(9000) }
    );
    if (!statsRes.ok) return [];
    const statsData = await statsRes.json();
    const videos=(Array.isArray(statsData.items) ? statsData.items : [])
      .filter(item => item?.id && item?.snippet?.title)
      .map(item => {
        const relevance=youtubeRelevance(item,keyword);
        return {
          id:item.id,title:item.snippet.title,channel:item.snippet.channelTitle||'',
          thumbnail:item.snippet.thumbnails?.medium?.url||item.snippet.thumbnails?.high?.url||item.snippet.thumbnails?.default?.url||null,
          viewCount:parseInt(item.statistics?.viewCount||0),publishedAt:item.snippet.publishedAt||null,
          url:`https://www.youtube.com/watch?v=${item.id}`,
          channelTrusted:relevance.channelTrusted,relevanceScore:relevance.score,directlyRelevant:relevance.directlyRelevant,
        };
      })
      .filter(item=>item.directlyRelevant&&item.channelTrusted&&item.relevanceScore>=65)
      .sort((a,b)=>b.relevanceScore-a.relevanceScore||b.viewCount-a.viewCount)
      .slice(0,5);
    await setExternalCache('youtube',cacheKey,videos,1800);
    return videos;
  } catch { return []; }
}

// ─── 유튜브 영상 (상세페이지용 최대 2개) ──────────────────────
export async function fetchYoutubeVideos(keyword) {
  const videos=await fetchYoutubeVideosFull(keyword);
  return videos.slice(0,2).map(item=>({...item,url:item.url||`https://www.youtube.com/watch?v=${item.id}`}));
}

export function toSlug(title) {
  return title.replace(/[^\w\sㄱ-힣]/g, '').trim().replace(/\s+/g, '-');
}

export function normalizeInstagramCards(keyword, card, sourceItems, rawCards, contentContext = {}) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const validTypes = new Set(['cover','issue','feed_section','online_trend','insight','summary','detail','impact','source']);
  const normalized = (Array.isArray(rawCards) ? rawCards : [])
    .map((item,index)=>({
      page:index+1,type:validTypes.has(item?.type)?item.type:(index===0?'cover':'detail'),
      headline:clean(item?.headline).slice(0,56),body:clean(item?.body).slice(0,180),
      claimIds:Array.isArray(item?.claimIds)?item.claimIds:[],
    }))
    .filter(item=>item.headline&&item.body)
    .slice(0,5);
  return ensurePromoCard(normalized,{...contentContext,card,sourceItems,keyword,displayTitle:contentContext.displayTitle||keyword});
}

// ─── 콘텐츠 품질 검증 ────────────────────────────────
const LOW_VALUE_PATTERNS = [
  '최근 화제가 되고 있습니다', '관심이 집중되고 있습니다', '귀추가 주목됩니다',
  '지켜볼 필요가 있습니다', '다양한 반응이 이어지고 있습니다', '관련 보도가 이어지고 있습니다',
  '자세한 내용은 확인이 필요합니다', '핵심 내용을 살펴보겠습니다', '이슈가 되고 있습니다'
];

function normalizeForSimilarity(value = '') {
  return stripHtml(value).toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
}

function sentenceList(value = '') {
  return String(value).split(/(?<=[.!?다요])\s+|\n+/).map(v => v.trim()).filter(v => v.length >= 12);
}

function sourceCopyRisk(blog = '', sourceItems = []) {
  const body = normalizeForSimilarity(blog);
  if (!body) return 0;
  let risk = 0;
  for (const item of sourceItems || []) {
    for (const text of [item?.title, item?.description, item?.snippet, item?.content]) {
      const normalized = normalizeForSimilarity(text || '');
      if (normalized.length < 20) continue;
      const sample = normalized.slice(0, Math.min(70, normalized.length));
      if (sample.length >= 25 && body.includes(sample)) risk += 1;
    }
  }
  return risk;
}

export function assessContentQuality(content) {
  const blog=String(content?.blog||'').trim();
  const card=content?.card||{};
  const qa=Array.isArray(content?.qa)?content.qa:[];
  const fullTier=(content?.contentTier||'full')==='full';
  const grade=String(content?.contentGrade||'B').toUpperCase();
  const sourceItems=Array.isArray(content?.sourceItems)?content.sourceItems:[];
  const length=blog.length;
  const headings=(blog.match(/^##\s+.+$/gm)||[]).length;
  const sentences=sentenceList(blog);
  const uniqueSentences=new Set(sentences.map(v=>normalizeForSimilarity(v))).size;
  const duplicateRatio=sentences.length?1-(uniqueSentences/sentences.length):1;
  const genericCount=LOW_VALUE_PATTERNS.filter(v=>collectOutputForValidation(content).includes(v)).length;
  const copyRisk=sourceCopyRisk(collectOutputForValidation(content),sourceItems);
  const instagram=validateInstagramCards(content.instagramCards||[],content);
  const reasons=[];
  let score=100;
  const gradeRange=contentLengthRange(grade);
  const minimumLength=FEED_DETAIL_MIN_CHARS;
  if(length<minimumLength){score-=35;reasons.push(`피드 상세 본문 최소 ${minimumLength.toLocaleString()}자 미만`);}
  else if(length<FEED_DETAIL_RECOMMENDED_MIN_CHARS&&Array.isArray(content?.factLedger?.facts)&&content.factLedger.facts.length>=5){score-=4;reasons.push(`확인 사실이 충분한데 권장 분량 ${FEED_DETAIL_TARGET_CHARS.toLocaleString()}자 내외보다 짧음`);}
  else if(length>FEED_DETAIL_RECOMMENDED_MAX_CHARS){reasons.push('권장 분량보다 길지만 사실 반복이 없으면 허용');}
  const minimumHeadings=grade==='D'?3:grade==='C'?2:3;
  if(headings<minimumHeadings){score-=15;reasons.push(`소제목 ${minimumHeadings}개 미만`);}
  if(headings>5){score-=5;reasons.push('소제목이 지나치게 많음');}
  const minimumSentences=grade==='A'?10:grade==='B'?6:grade==='C'?3:2;
  if(sentences.length<minimumSentences){score-=12;reasons.push('등급별 정보 문장 수 부족');}
  if(duplicateRatio>0.18){score-=20;reasons.push('본문 중복 문장 비율 높음');}
  if(genericCount>0){score-=Math.min(20,genericCount*7);reasons.push('상투적·빈 문장 포함');}
  if(copyRisk>0){score-=Math.min(35,copyRisk*15);reasons.push('원문 복사 위험');}
  if(!card?.summary||cleanText(card.summary).length<30){score-=10;reasons.push('요약 정보 부족');}
  if(!Array.isArray(card?.points)||card.points.length<3){score-=10;reasons.push('핵심 포인트 부족');}
  const pointSet=new Set((card.points||[]).map(v=>normalizeForSimilarity(v)));
  if(pointSet.size<(card.points||[]).length){score-=8;reasons.push('핵심 포인트 중복');}
  if(fullTier&&grade==='A'&&qa.length<2){score-=8;reasons.push('A등급 Q&A 부족');}
  if(grade!=='D'&&sourceItems.filter(x=>x?.contentUsable!==false).length<1){score-=25;reasons.push('사용 가능한 출처 없음');}
  if(fullTier&&grade==='A'&&!instagram.passed){score-=Math.min(20,instagram.reasons.length*6);reasons.push(...instagram.reasons);}
  const feedTitle=cleanText(content.feedTitle||card.feedTitle||'');
  const detailTitle=cleanText(content.detailTitle||card.detailTitle||'');
  const titleTokens=headlineTokens(`${feedTitle} ${detailTitle}`);
  const bodyTokens=new Set(headlineTokens(`${card.summary||''} ${blog.slice(0,500)}`));
  if(titleTokens.length&&!titleTokens.some(token=>bodyTokens.has(token))){score-=10;reasons.push('제목과 본문 핵심 불일치');}
  if(/화제|최신\s*(소식|뉴스)|알아보|총정리|충격|결국|왜\s*이럴까|무슨\s*일/.test(`${feedTitle} ${detailTitle}`)){score-=15;reasons.push('낚시형·상투형 제목 표현');}
  const canonicalEditorialTitle=/^.{2,30} · .{4,18}$/.test(feedTitle)&&feedTitle===detailTitle;
  if(feedTitle&&detailTitle&&headlineSimilarity(feedTitle,detailTitle)>0.9&&!canonicalEditorialTitle){score-=8;reasons.push('피드 제목과 상세 제목이 사실상 동일');}
  if(headlineTokens(feedTitle).length<2||headlineTokens(detailTitle).length<2){score-=8;reasons.push('제목의 주체·행동 정보 부족');}
  const sourceTitleRisk=sourceItems.some(item=>headlineSimilarity(feedTitle,item?.title||'')>=0.78||headlineSimilarity(detailTitle,item?.title||'')>=0.74);
  if(sourceTitleRisk){score-=18;reasons.push('기사 제목과 유사한 제목 구조');}
  return {score:Math.max(0,Math.min(100,Math.round(score))),reasons:[...new Set(reasons)],length,copyRisk,duplicateRatio:Number(duplicateRatio.toFixed(3)),instagram};
}

export function validateContent(content) {
  const { card } = content || {};
  const grade=String(content?.contentGrade||'B').toUpperCase();
  if (!contentIsReady(content) || content.status !== CONTENT_STATUS.PUBLISHED) return false;
  if (!card?.summary || cleanText(card.summary).length < 20) return false;
  if (!Array.isArray(card?.points) || card.points.length < 3) return false;
  if (grade==='D'||content.contentMode === 'trend_brief' || content.contentType === 'brief') {
    return validateTrendBriefContent(content);
  }
  if(!validateDetailedTierShape(content))return false;
  if (!content.publicationDecision?.publishable && content.top30CompletionPolicy!=='fixed_selected_top30_v1') return false;
  const qualityFloor=grade==='A'?72:grade==='B'?60:45;
  const groundingFloor=grade==='A'?70:grade==='B'?50:20;
  if (Number(content.qualityScore || 0) < qualityFloor) return false;
  if (Number(content.groundingScore || 0) < groundingFloor) return false;
  if (Number(content.copyrightScore || 0) < 60 || (content.copyrightRisk?.passed === false&&Number(content.copyrightRisk?.maxSimilarity||0)>=0.85)) return false;
  const errorPatterns = ['죄송', '생성할 수 없', '오류가 발생', 'error', 'undefined', 'null'];
  const combined = collectOutputForValidation(content).toLowerCase();
  if (errorPatterns.some(p => combined.includes(p))) return false;
  return true;
}

function collectOutputForValidation(content = {}) {
  return [content.blog, content.feedTitle, content.detailTitle, content.card?.summary, content.card?.why,
    ...(content.card?.points || []), ...(content.qa || []).flatMap(x => [x?.q,x?.a]),
    ...(content.instagramCards || []).flatMap(x => [x?.headline,x?.body])].filter(Boolean).join(' ');
}

// ─── 검증형 콘텐츠 패키지 생성 ───────────────────────
function normalizedEditorialSection(section={}, heading='') {
  const paragraphs=(Array.isArray(section?.paragraphs)?section.paragraphs:[]).map(paragraph=>({
    text:sanitizePublicText(cleanText(typeof paragraph==='string'?paragraph:paragraph?.text)),
    claimIds:Array.isArray(paragraph?.claimIds)?paragraph.claimIds:[],
    sourceRole:paragraph?.sourceRole||'fact',
  })).filter(paragraph=>paragraph.text);
  return {heading,paragraphs};
}

function renderBlogPackage(pkg = {}, onlineTrend = null, context={}) {
  // 온라인 반응은 내부 참고 데이터로 유지하되 피드 본문과 인사이트의 사실 근거에는 넣지 않습니다.
  const rawSections=(Array.isArray(pkg.sections)?pkg.sections:[]).slice(0,5);
  const seenParagraphs=new Set();
  const sections=[];
  for(let index=0;index<rawSections.length;index++){
    const raw=rawSections[index]||{};
    const supplied=cleanText(raw?.heading||'');
    const paragraphRows=Array.isArray(raw?.paragraphs)?raw.paragraphs:[];
    const profileText=paragraphRows.map(row=>typeof row==='string'?row:row?.text||'').join(' ');
    let kind='context';
    if(index===0||/기본|배경|알아보기|무엇|어떤/i.test(supplied))kind='basic';
    else if(index===1||/이슈|변화|달라|핵심|현재|지금|발표|공개|확정|일정/i.test(supplied))kind='issues';
    else if(/STELLATE\s*인사이트|종합\s*(?:정리|해석)|핵심\s*해석/i.test(supplied))kind='insight';
    else if(/영향|이용자|소비자|시청자|투자자|일정|수치|비교/i.test(supplied))kind='impact';
    const fallback=index===2?'핵심 맥락과 확인 포인트':index===3?'이용자가 알아둘 점':'STELLATE 인사이트';
    const heading=kind==='basic'
      ? naturalFeedHeading('basic',supplied,{keyword:context.keyword||'',eventTitle:context.eventTitle||pkg.shortTitle||'',profileText})
      : kind==='issues'
        ? naturalFeedHeading('issues',supplied,{keyword:context.keyword||'',eventTitle:context.eventTitle||pkg.shortTitle||''})
        : kind==='insight'
          ? naturalFeedHeading('insight',supplied,{keyword:context.keyword||'',eventTitle:context.eventTitle||pkg.shortTitle||''})
          : kind==='impact'
            ? naturalFeedHeading('impact',supplied,{keyword:context.keyword||'',eventTitle:context.eventTitle||pkg.shortTitle||''})
            : naturalFeedHeading('context',supplied||fallback,{keyword:context.keyword||'',eventTitle:context.eventTitle||pkg.shortTitle||''});
    const normalized=normalizedEditorialSection(raw,heading);
    const paragraphs=[];
    for(const paragraph of normalized.paragraphs){
      const key=cleanText(paragraph.text).toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
      if(!key||seenParagraphs.has(key))continue;
      seenParagraphs.add(key);paragraphs.push(paragraph);
    }
    if(paragraphs.length)sections.push({...normalized,paragraphs});
  }
  const chunks=[];const factualChunks=[];const claimMap=[];
  for(const section of sections){
    chunks.push(`## ${section.heading}`);factualChunks.push(`## ${section.heading}`);
    for(const paragraph of section.paragraphs){
      chunks.push(paragraph.text);factualChunks.push(paragraph.text);
      claimMap.push({text:paragraph.text,claimIds:paragraph.claimIds});
    }
  }
  return {blog:chunks.join('\n\n').trim(),factualBlog:factualChunks.join('\n\n').trim(),claimMap,sections,onlineTrend};
}

function sourceQualityFromLedger(ledger = {}) {
  const sources = Array.isArray(ledger.sources) ? ledger.sources : [];
  const official = sources.filter(x => x.sourceType === 'official').length;
  const authorized = sources.filter(x => x.sourceType === 'authorized').length;
  const trustedNews = sources.filter(x => x.sourceType === 'trusted_news').length;
  const independent = sources.filter(x => x.sourceType === 'independent').length;
  return Math.max(0, Math.min(100, Math.round(official * 35 + authorized * 30 + trustedNews * 22 + independent * 18 + Math.min(20, sources.length * 5))));
}

const CONTENT_OUTPUT_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    visualQuery:{type:'string'},shortTitle:{type:'string'},summary:{type:'string'},why:{type:'string'},
    points:{type:'array',items:{type:'string'},minItems:3,maxItems:5},
    intro:{type:'object',additionalProperties:false,properties:{text:{type:'string'},claimIds:{type:'array',items:{type:'string'}}},required:['text','claimIds']},
    sections:{type:'array',minItems:3,maxItems:5,items:{type:'object',additionalProperties:false,properties:{heading:{type:'string'},paragraphs:{type:'array',items:{type:'object',additionalProperties:false,properties:{text:{type:'string'},claimIds:{type:'array',items:{type:'string'}}},required:['text','claimIds']}}},required:['heading','paragraphs']}},
    qa:{type:'array',items:{type:'object',additionalProperties:false,properties:{q:{type:'string'},a:{type:'string'},claimIds:{type:'array',items:{type:'string'}}},required:['q','a','claimIds']}},
    instagramCards:{type:'array',items:{type:'object',additionalProperties:false,properties:{type:{type:'string',enum:['cover','issue','feed_section','online_trend','insight','summary','detail','impact','source']},headline:{type:'string'},body:{type:'string'},claimIds:{type:'array',items:{type:'string'}}},required:['type','headline','body','claimIds']}},
    uncertainties:{type:'array',items:{type:'string'}},
  },
  required:['visualQuery','shortTitle','summary','why','points','intro','sections','qa','instagramCards','uncertainties'],
};

function normalizeTopParts(baseKeyword='',baseTopic='',pkg={},feedTitle='',sourceTitles=[]){
  const contexts=[...(Array.isArray(sourceTitles)?sourceTitles:[]),feedTitle].filter(Boolean);
  return buildNeutralTopTitleParts(
    baseKeyword,
    contexts,
    pkg.topKeyword||baseKeyword,
    pkg.topTopic||baseTopic,
  );
}

export async function generateContent(keyword, newsBundle, existingContent = null, preferredImage = null, trendMeta = {}) {
  const preferredImageMeta = normalizeImageMeta(preferredImage);
  const CLAUDE_KEY = String(process.env.ANTHROPIC_API_KEY || '').trim();
  const usableClaudeKey = CLAUDE_KEY && !claudeAuthUnavailable ? CLAUDE_KEY : null;
  const sourceKeyword = String(trendMeta.keyword || keyword || '').trim();
  const requestedTopKeyword = String(sourceKeyword || keyword || '').trim();
  const requestedTopTopic = '';
  const requestedTopTitle = requestedTopKeyword;
  let topicTitle = requestedTopKeyword;
  let searchQuery = requestedTopKeyword;
  const contentTier=String(trendMeta.contentTier||'full');
  const baseRankingScore=Number(trendMeta.rankingScore||trendMeta.qualityScore||0);
  const onlineReactionScore=Math.max(0,Math.min(10,Number(newsBundle?.onlineReactionRanking?.score||0)));
  const rankingScore=Math.max(0,Math.min(100,Math.round(baseRankingScore+onlineReactionScore)));
  // v7.6.3: grade 누락 시 score로 역산해 수동/재생성 경로에서 무음 강등 방지
  const rankingGrade=String(rankingScore>=85?'A':rankingScore>=75?'B':rankingScore>=65?'C':'D');
  const trendRank=Number(trendMeta.rank||99);
  const topEligible=isTopBriefEligible({...trendMeta,rank:trendRank,contentTier});

  const newsItems = Array.isArray(newsBundle?.items) ? newsBundle.items.map(normalizeSourceItem).filter(item => (item.evidenceUsable ?? item.contentUsable) && ['official','authorized','trusted_news','independent'].includes(item.sourceType)) : [];
  const profileItems = Array.isArray(newsBundle?.profileEvidence) ? newsBundle.profileEvidence.map(normalizeSourceItem).filter(item => (item.evidenceUsable ?? item.contentUsable) && ['official','authorized','trusted_news','independent'].includes(item.sourceType)) : [];
  const evidenceItems=[];
  const evidenceKeys=new Set();
  for(const item of [...newsItems,...profileItems]){
    const key=String(item?.canonicalUrl||item?.link||item?.domain||item?.source||'').trim();
    if(!key||evidenceKeys.has(key))continue;
    evidenceKeys.add(key);evidenceItems.push(item);
  }
  const rawRelatedNews=Array.isArray(newsBundle?.relatedNews)?newsBundle.relatedNews:[];
  const rawRelatedContent=Array.isArray(newsBundle?.relatedContent)?newsBundle.relatedContent:[];
  const evidenceContexts=[
    ...newsItems.map(item=>`${item.title||''} ${item.description||''}`),
    ...rawRelatedNews.map(item=>item.transientOriginalTitle||item.title||item.label||''),
  ].filter(Boolean);
  const categoryResult = detectCategoryDetailed(`${sourceKeyword} ${topicTitle}`, evidenceContexts.join(' '));
  const configuredCategory = trendMeta.category && CATEGORIES[trendMeta.category] ? trendMeta.category : '';
  const categoryKey = trendMeta.manualApproved===true&&configuredCategory
    ? configuredCategory
    : (categoryResult.category!=='general'&&Number(categoryResult.confidence||0)>=0.4
      ? categoryResult.category
      : (configuredCategory||categoryResult.category||'general'));
  const categoryConfidence = Number(categoryResult.confidence || trendMeta.categoryConfidence || 0);
  const categoryReason = categoryResult.reason || trendMeta.categoryReason || '';
  const factLedger = newsBundle?.factLedger || buildFactLedger(newsItems,{topicTitle});
  const researchSourceTitles=[
    ...evidenceItems.map(item=>item?.title||''),
    ...rawRelatedNews.map(item=>item?.transientOriginalTitle||item?.title||item?.label||''),
    ...(Array.isArray(trendMeta.sourceTitleHints)?trendMeta.sourceTitleHints:[]),
  ].map(cleanText).filter(Boolean).slice(0,16);
  const candidateTerms=[
    ...(Array.isArray(trendMeta.candidateTerms)?trendMeta.candidateTerms:[]),
    ...(Array.isArray(trendMeta.identityHints)?trendMeta.identityHints:[]),
    ...(Array.isArray(trendMeta.keywordCandidates)?trendMeta.keywordCandidates.map(row=>typeof row==='string'?row:row?.keyword||''):[]),
  ].map(cleanText).filter(Boolean);
  // 순위는 원래 후보의 selectionRank를 유지하되, 공개 키워드는 독립 조사에서 반복 확인된 대표 엔티티로 정규화합니다.
  // 기사 제목 전체를 그대로 쓰지 않고 Fact/출처 제목에서 지지되는 짧은 주체만 선택합니다.
  const keywordResolution=resolveTop30Keyword({
    topKeyword:requestedTopKeyword,
    keyword:sourceKeyword,
    rawKeyword:trendMeta.originalRankedKeyword||trendMeta.rawKeyword||sourceKeyword,
    candidateTerms,
    sourceTitles:researchSourceTitles,
    contexts:(Array.isArray(factLedger?.facts)?factLedger.facts:[]).map(fact=>fact?.subject||fact?.text||'').filter(Boolean),
  });
  const resolvedTopKeyword=String(keywordResolution?.ok&&keywordResolution.keyword?keywordResolution.keyword:requestedTopKeyword||sourceKeyword).trim();
  const fixedTop={topKeyword:resolvedTopKeyword,topTopic:'',topTitle:'',displayTitle:resolvedTopKeyword};
  let contentGradeInfo=deriveContentGrade({factLedger,evidenceSources:evidenceItems});
  let contentGrade=contentGradeInfo.grade;
  topicTitle=resolvedTopKeyword;
  searchQuery=topicTitle;
  const relatedNews = sanitizeExternalLinksForStorage(rawRelatedNews).slice(0,3);
  const relatedContent = sanitizeExternalLinksForStorage(rawRelatedContent.length?rawRelatedContent:buildRelatedContent(trendMeta.relatedLinks || trendMeta.relatedContent || [], topicTitle)).slice(0,3);
  const relatedVideos = normalizeRelatedVideos(newsBundle?.relatedVideos || newsBundle?.videos || [], topicTitle);
  const onlineTrend = newsBundle?.onlineReactionSummary || {summary:'의미 있게 취합할 수 있는 온라인 반응이 충분하지 않습니다.',notice:'온라인 반응은 공개된 일부 게시물을 취합한 참고 정보이며, 전체 이용자 또는 전체 여론을 의미하지 않습니다.'};
  const discoverySignals = buildDiscoverySignals(trendMeta, newsBundle || {});
  const copyrightSources = [...evidenceItems, ...rawRelatedNews.map(item=>({title:item.transientOriginalTitle||item.title||item.label||'',description:'',link:item.link,source:item.source})), ...rawRelatedContent.map(item=>({title:item.transientOriginalTitle||item.title||item.label||'',description:'',link:item.link,source:item.source}))];
  const category = CATEGORIES[categoryKey] || CATEGORIES.general;
  const accuracyReport=ledgerAccuracyReport(factLedger);
  const publishableFacts=accurateFacts(factLedger,{scope:'all',limit:20,allowSingleTrusted:true});
  const generationLedger={...factLedger,facts:publishableFacts,confirmedFacts:publishableFacts.filter(fact=>fact.status==='confirmed'||['official','authorized'].includes(String(fact.sourceType||''))).map(fact=>fact.id)};
  const newsText = typeof newsBundle === 'string'
    ? newsBundle
    : buildStructuredFactPrompt(generationLedger);
  // 출처 문장 사용 허가와 상세 생성 가능 여부를 분리합니다.
  // 상세형은 구조화된 사실 근거가 있으면 가능하며, 원문 표현 재사용 허가는 요구하지 않습니다.
  const hasEvidence = hasDetailedEvidence({ evidenceSources:evidenceItems, factLedger:generationLedger })&&accuracyReport.passed;
  const sourceNewestAt = newsBundle?.newestAt || newsItems[0]?.publishedAt || profileItems[0]?.publishedAt || relatedNews[0]?.publishedAt || null;
  const sourceCutoffAt = newsBundle?.cutoffAt || new Date(Date.now() - NEWS_MAX_AGE_MS).toISOString();
  const sourceWindowHours = newsBundle?.maxAgeHours || NEWS_MAX_AGE_HOURS;
  const sourceSignature = makeContentSignalSignature({ evidenceSources:evidenceItems, relatedNews, relatedContent, relatedVideos, signals:discoverySignals });

  // v7.7.3: 현재 공개 TOP의 기본 피드는 출처·등급 필드와 무관하게 보장합니다.
  // full만 상세형 생성을 시도하고, brief는 외부 원문을 생성 재료로 사용하지 않는
  // 안전한 관심도 브리핑으로 즉시 전환합니다.
  if (contentTier === 'brief') {
    const briefImageMeta=await resolveCoverImage(topicTitle,'관련 관심 흐름',categoryKey,null,'',preferredImageMeta||existingContent?.imageMeta,{slug:existingContent?.slug||trendMeta.slug||trendMeta.candidateId||sourceKeyword,stableEventId:existingContent?.stableEventId||trendMeta.eventKey||null,topKeyword:requestedTopKeyword,topTitle:requestedTopKeyword,card:{summary:'관련 관심 흐름'}});
    const brief = buildTrendBrief({ topicTitle, fixedTop, category, trendMeta:{...trendMeta,keyword:sourceKeyword,rankingGrade,rankingScore,rank:trendRank,contentTier,topEligible:true,category:categoryKey}, newsBundle:{...newsBundle,relatedNews,relatedContent}, imageMeta:briefImageMeta });
    return {
      ...brief, searchQuery, rawKeyword:trendMeta.rawKeyword||sourceKeyword, eventKey:trendMeta.eventKey||null,
      category:categoryKey,categoryConfidence,categoryReason,contentTier:'brief',rankingGrade,rankingScore,rank:trendRank,topEligible:true,
      freshnessStatus:'trend-signal',discoveryCount:Number(newsBundle?.discoveryCount||relatedNews.length),sourceNewestAt,sourceCutoffAt,sourceWindowHours,sourceSignature,
      contentVersion:CONTENT_VERSION,fingerprint:`top-brief-${sourceSignature.slice(0,24)}`,factLedger:{version:3,sources:[],facts:[],confirmedFacts:[],uncertainties:[],conflicts:[]},videos:relatedVideos,relatedVideos,researchPlan:newsBundle?.researchPlan||null,researchDiagnostics:newsBundle?.researchDiagnostics||null,
      evidenceSources:[],sourceItems:[],generatedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString(),
    };
  }

  const issueFacts=accurateFacts(factLedger,{scope:'issue',limit:12,allowSingleTrusted:true});
  const profileFacts=accurateFacts(factLedger,{scope:'profile',limit:8,allowSingleTrusted:true});
  const fixedKeywordFlow=trendMeta.fixedTop20Flow===true||trendMeta.fixedTop30Flow===true;
  const identityMode=fixedKeywordFlow&&issueFacts.length<1&&profileFacts.length>=1&&evidenceItems.length>=1;
  if (!hasEvidence || (!identityMode && issueFacts.length < 1)) {
    const error=new Error(`키워드의 정체 또는 현재 이슈를 설명할 확인 자료를 확보하지 못했습니다: ${topicTitle}`);
    error.code='INSUFFICIENT_KEYWORD_EVIDENCE';
    error.details={
      keyword:topicTitle,
      originalRankedKeyword:trendMeta.originalRankedKeyword||trendMeta.rawKeyword||requestedTopKeyword,
      keywordResolution,
      evidenceCount:evidenceItems.length,
      issueFactCount:issueFacts.length,
      profileFactCount:profileFacts.length,
      relatedNewsCount:relatedNews.length,
      researchDiagnostics:newsBundle?.researchDiagnostics||null,
    };
    // stageOnly 호출자는 이 체크포인트를 저장해 다음 시도에서 동일 후보의 조사 결과를 이어받습니다.
    error.researchCheckpoint={
      keyword:topicTitle,topKeyword:topicTitle,displayTitle:topicTitle,searchQuery,
      rawKeyword:trendMeta.rawKeyword||requestedTopKeyword,
      originalRankedKeyword:trendMeta.originalRankedKeyword||requestedTopKeyword,
      keywordResolution,category:categoryKey,categoryConfidence,categoryReason,
      factLedger:generationLedger,evidenceSources:evidenceItems,sourceItems:evidenceItems,
      relatedNews,relatedContent,relatedVideos,sourceSignature,sourceNewestAt,sourceCutoffAt,sourceWindowHours,
      contentGrade,contentGradeInfo,contentVersion:CONTENT_VERSION,
      status:'research_incomplete',visibility:'private',hasContent:false,hasNews:relatedNews.length>0,
      card:{summary:'',why:'',points:[]},blog:'',qa:[],instagramCards:[],
      generatedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString(),
    };
    throw error;
  }
  if(identityMode){
    contentGrade='C';
    contentGradeInfo={grade:'C',contentScore:Math.max(35,profileFacts.length*12+evidenceItems.length*9),factCount:profileFacts.length,sourceCount:evidenceItems.length,officialCount:evidenceItems.filter(item=>item.sourceType==='official').length,independentSourceCount:new Set(evidenceItems.map(item=>item.domain).filter(Boolean)).size,materialFactCount:0,identityMode:true};
  }

  const youtubeVideosPromise = relatedVideos.length ? Promise.resolve(relatedVideos) : fetchYoutubeVideos(searchQuery);
  let tokenUsage = { input: 0, output: 0 };
  async function requestClaude(prompt,maxTokens,schema=null){
    const body={model:'claude-sonnet-4-6',max_tokens:maxTokens,messages:[{role:'user',content:prompt}]};
    if(schema&&!claudeStructuredUnsupported)body.output_config={format:{type:'json_schema',schema}};
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':usableClaudeKey,'anthropic-version':'2023-06-01'},signal:externalSignal(Math.max(30000,Math.min(120000,Number(process.env.ANTHROPIC_TIMEOUT_MS||90000)))),body:JSON.stringify(body)});
    if(!res.ok){
      let detail='';try{detail=(await res.text()).slice(0,500);}catch{}
      if((res.status===400||res.status===422)&&schema&&!claudeStructuredUnsupported&&/output_config|json_schema|structured/i.test(detail)){
        claudeStructuredUnsupported=true;
        return requestClaude(prompt,maxTokens,null);
      }
      if(res.status===401||res.status===403)claudeAuthUnavailable=true;
      const error=new Error(`Claude API 오류: ${res.status}${detail?` - ${detail}`:''}`);error.code=(res.status===401||res.status===403)?'CLAUDE_AUTH_ERROR':'CLAUDE_API_ERROR';throw error;
    }
    const data=await res.json();tokenUsage.input+=data.usage?.input_tokens||0;tokenUsage.output+=data.usage?.output_tokens||0;
    return data.content?.[0]?.text||'';
  }
  function parseGeneratedJson(raw=''){
    const source=String(raw||'').replace(/```json|```/gi,'').trim();
    try{return JSON.parse(source);}catch{}
    const first=source.indexOf('{'),last=source.lastIndexOf('}');
    if(first>=0&&last>first){
      const candidate=source.slice(first,last+1).replace(/,\s*([}\]])/g,'$1');
      try{return JSON.parse(candidate);}catch{}
    }
    return null;
  }
  async function callClaudeJSON(prompt,maxTokens,fallback){
    if(!usableClaudeKey||claudeAuthUnavailable){const error=new Error('Claude API를 사용할 수 없습니다.');error.code='CLAUDE_UNAVAILABLE';throw error;}
    const raw=await requestClaude(prompt,maxTokens,CONTENT_OUTPUT_SCHEMA);
    return parseGeneratedJson(raw)||fallback;
  }

  const validFactIds = publishableFacts.map(f => f.id).join(', ');
  const isFullTier=contentTier==='full';
  const lengthRange=contentLengthRange(contentGrade);
  const tierRules=contentGrade==='A'&&isFullTier
    ? '- Q&A 2~3개와 인스타 정보 카드 3~5장을 생성하세요.'
    : contentGrade==='B'&&isFullTier
      ? '- Q&A는 최대 2개, 인스타 카드 원문은 핵심 사실 위주로 생성하세요.'
      : '- Q&A와 instagramCards는 빈 배열로 두고 확인된 사실과 미확인 내용을 짧게 구분하세요.';
  const prompt = `당신은 STELLATE의 팩트 검증형 에디터입니다.
현재 시각(한국): ${new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}
주제: ${topicTitle}
콘텐츠 근거 등급: ${contentGrade}

[구조화된 사실 근거 — 외부 원문 표현 사용 금지]
${newsText}

[엄격한 규칙]
- 반드시 Fact ID(${validFactIds})로 확인되는 사실만 사용하세요. PF로 시작하는 기본정보 Fact는 첫 번째 섹션에만 사용하세요. F로 시작하는 현재 이슈 Fact는 사건·맥락·수치·일정·이용자 확인사항 구역에 배치할 수 있지만, 동일 Fact를 본문 여러 구역에서 반복하지 마세요. 기억, 일반 상식, 추측, 전망을 추가하지 마세요.
- 글을 쓰기 전에 Fact를 ‘주체·행동·대상·시점·수치·조건’으로 분해해 서로 모순되지 않는지 확인하세요. 첫 문장에는 주체와 가장 중요한 행동을 명시하고, ‘이번’, ‘해당’, ‘관련’ 같은 지시어로 시작하지 마세요.
- 사건의 시간 순서를 바꾸지 마세요. 발표 시점, 시행·출시·경기·공연 시점, 이용자가 행동해야 하는 시점을 구분해 작성하세요. 날짜가 없으면 임의로 최근·오늘·곧이라고 표현하지 마세요.
- 같은 이름을 가진 인물·기업·작품이 있을 수 있으므로 Fact의 직함·소속·제품명·작품명을 확인해 다른 대상을 섞지 마세요. 확인되지 않은 직함이나 소속은 붙이지 마세요.
- 각 본문 문단과 생성하는 Q&A·인스타 카드에는 근거 claimIds를 넣으세요.
- 외부 자료의 제목·본문·목차·비유·해석·문장 구조를 복사하거나 조사만 바꾸지 마세요. 뉴스·블로그·카페·SNS·뉴스레터·유튜브 대본·리뷰를 요약·변형하는 방식도 금지합니다.
- 직접 인용은 사용하지 마세요. 외부 자료는 사실 확인용이며, STELLATE 고유 구성으로 처음부터 작성하세요.
- 확인되지 않은 원인·영향·평가를 만들지 마세요. 정보가 부족하면 uncertainties에 명시하세요.
- 피드 상세 본문은 공백 포함 최소 ${lengthRange.min.toLocaleString()}자 이상 작성하세요. 확인된 Fact와 출처가 충분하면 ${lengthRange.target.toLocaleString()}자 내외를 권장하며, 대체로 ${lengthRange.recommendedMin.toLocaleString()}~${lengthRange.recommendedMax.toLocaleString()}자 범위에서 사건·배경·수치·일정·독자 확인사항을 충분히 설명하세요. 다만 자료가 적은데 권장 분량을 맞추기 위해 같은 사실을 반복하거나 일반론·추측·전망을 추가하면 안 됩니다. 근거가 제한적이면 최소 ${lengthRange.min.toLocaleString()}자 이상에서 확인된 내용만 자연스럽게 마무리하고 uncertainties에 부족 사유를 남기세요. 섹션은 3~5개로 작성합니다. 기본정보 → 지금 주목받는 이유 → 핵심 맥락·수치·일정 → 이용자가 알아둘 점 → STELLATE 인사이트 순서에서 근거가 있는 구역만 선택하세요.
- 소제목은 내용을 읽고 자연스럽고 구체적으로 직접 만드세요. 첫 번째는 ‘박서진은 어떤 가수인가’, ‘갤럭시 Z 폴드는 어떤 제품인가’처럼 키워드와 실제 대상 유형이 드러나야 합니다. 두 번째는 ‘전국투어 공연 예매 일정 공개’처럼 현재 단일 사건이 드러나야 합니다. 이후 구역은 ‘핵심 맥락과 확인 포인트’, ‘이용자가 알아둘 점’처럼 독자가 얻는 정보가 분명해야 합니다. ‘키워드 기본정보’, ‘이슈사항’, ‘주요 동향’ 같은 고정·포괄 제목은 쓰지 마세요.
- 첫 번째 섹션은 공식·신뢰 출처에서 확인한 주체·제품·작품·장소의 기본정보만 설명하세요. 기본정보용 공식 페이지는 게시일이 오래됐더라도 현재 유효한 설명이면 사용할 수 있지만, 분량 채우기용 연혁과 과거 사건은 넣지 마세요.
- 두 번째 섹션은 발행 시각이 내부 수집 기준에 포함되는 현재 이슈 Fact만 정리하고, 기본정보 출처에 있는 오래된 사건은 섞지 마세요. 같은 Fact를 문장만 바꿔 여러 섹션에서 반복하지 마세요.
- 각 문단은 단일 사실을 나열하는 대신 서로 직접 연결되는 Fact 1~3개를 묶어 2~4문장으로 작성하세요. 문단의 claimIds에는 사용한 모든 Fact ID를 넣으세요.
- 문단은 ‘확인된 변화 → 구체적인 근거 → 독자가 확인할 사항’ 순서로 구성하세요. 단, 세 요소의 Fact가 모두 있을 때만 사용하고, 없는 요소를 일반론으로 채우지 마세요.
- ‘관심이 커지고 있습니다’, ‘귀추가 주목됩니다’, ‘의미가 있습니다’, ‘중요한 변화입니다’, ‘향후 지켜봐야 합니다’처럼 사실을 추가하지 않는 마무리 문장은 금지합니다.
- 숫자·일정·비교·실질적 영향이 Fact에 있으면 별도 문단으로 설명하세요. 근거에 없으면 해당 구역을 만들지 마세요.
- STELLATE 인사이트는 예측이나 평가가 아니라, 앞에서 확인한 사실이 독자에게 무엇을 의미하는지와 다음에 확인할 공식 일정·발표를 근거 범위 안에서 정리하세요.
- 조사 범위는 내부 기준일 뿐입니다. 상세 본문, 요약, 포인트, 제목, 피드 문안, 인스타 카드에는 ‘최근 36시간’, ‘36시간 내’, ‘36시간 이내’ 같은 조사 범위 표현을 절대 쓰지 마세요.
- 카페·블로그·SNS 자료는 이 프롬프트에 제공되지 않으며 기본정보·현재 이슈·요약·포인트·인사이트·제목에 절대 반영하지 마세요.
- 먼저 전체 상세 내용을 작성한 뒤, 그 내용에서 가장 핵심적인 단일 사건을 shortTitle로 압축하세요. shortTitle은 키워드를 제외한 4~18자의 구체적 사건명이어야 합니다. 예: ‘셋째 임신 발표’, ‘신작 출연 확정’, ‘서비스 장애 복구’. ‘수치 변화’, ‘상태 변화’, ‘최근 이슈’, ‘공식 발표’ 같은 포괄 표현은 금지합니다.
- shortTitle은 가장 우선순위가 높은 현재 이슈 Fact와 직접 일치해야 합니다. ‘입장 발표’, ‘활동 정보’, ‘주요 내용’처럼 대상이나 행동이 모호한 제목은 금지하고, 가능하면 정책명·작품명·제품명·경기 결과·일정 대상 중 하나를 포함하세요.
- 최종 TOP 제목은 시스템이 상세 콘텐츠와 Fact Ledger를 다시 검증해 생성합니다. feedTitle과 detailTitle은 만들지 마세요.
- summary·why·points는 JSON 형식 유지를 위한 초안입니다. 실제 요약정보 카드는 전체 피드 작성 후 시스템이 피드 내용만 다시 요약합니다. summary는 가장 중요한 사실 1~2개를 2~3문장으로, why는 배경·일정·독자에게 필요한 맥락을 1~2문장으로 작성하세요. points는 서로 다른 사실 3~5개로 구성하고 피드에 없는 일반 문구를 추가하지 마세요.
${tierRules}
- 인스타 카드 원문은 작성한 피드에서만 파생합니다. 표지 다음에 피드 섹션을 내용량에 맞게 2~4장으로 나누고 같은 사실을 반복하지 마세요. 홍보 카드는 출력하지 마세요.
- visualQuery는 특정 인물·상표를 제외한 Unsplash 검색용 영어 일반명사 2~4개로 작성하세요.
- 모든 출력은 존댓말로 작성하세요.`;

  const todayUsage=(await getTokenUsage(1))?.[0]||{};
  const guard=evaluateCostGuard({usage:todayUsage,rank:trendRank,grade:rankingGrade,contentTier,prompt,requestedOutput:isFullTier?6200:4200});
  const costGuardBlocked=!guard.allowed;

  let pkg; let aiStatus='claude'; let aiError=null;
  if(identityMode){
    pkg=buildVerifiedFallback(topicTitle,factLedger,sourceWindowHours,contentTier);
    aiStatus='verified_identity_fallback';
    aiError=null;
  }
  if(!pkg&&costGuardBlocked){
    pkg=buildVerifiedFallback(topicTitle,factLedger,sourceWindowHours,contentTier);
    aiStatus='verified_fallback';
    aiError='AI_COST_GUARD';
  }

  if(!pkg){
    try { pkg=await callClaudeJSON(prompt,guard.maxOutput,null); if(!pkg)throw new Error('콘텐츠 JSON 생성 실패'); }
    catch(error){ console.warn(`[verified content fallback] ${keyword}:`,error?.message||error); pkg=buildVerifiedFallback(topicTitle,factLedger,sourceWindowHours,contentTier); aiStatus='verified_fallback'; aiError=error?.code||'claude-unavailable'; }
  }
  if(aiStatus==='claude'){
    const strictAccuracy=validateGeneratedPackageAccuracy(pkg,factLedger);
    if(!strictAccuracy.passed){
      console.warn(`[accuracy fallback] ${keyword}: ${strictAccuracy.problems.join(' / ')}`);
      pkg=buildVerifiedFallback(topicTitle,factLedger,sourceWindowHours,contentTier);
      aiStatus='verified_fallback';
      aiError=`STRICT_ACCURACY_GATE:${strictAccuracy.problems.join('|').slice(0,240)}`;
    }
  }
  if(!Array.isArray(pkg?.sections)||pkg.sections.length<1){
    const error=new Error(`확인 사실 기반 콘텐츠를 구성하지 못했습니다: ${topicTitle}`);
    error.code='NO_ACCURATE_CONTENT';
    throw error;
  }

  let rendered=renderBlogPackage(pkg,onlineTrend,{keyword:topicTitle,eventTitle:pkg.shortTitle||''});
  // v8.0.48: TOP 단건 생성은 fastRefresh라 일반 품질 수정 단계를 건너뛰므로,
  // 1,000자 미만 결과가 그대로 stage 검증에서 탈락할 수 있었습니다.
  // 확인된 Fact Ledger만 사용한 결정론적 문안이 더 충실하면 같은 시도 안에서 교체합니다.
  if(rendered.blog.length<FEED_DETAIL_MIN_CHARS){
    const supportedPkg=buildVerifiedFallback(topicTitle,factLedger,sourceWindowHours,contentTier);
    const supportedAccuracy=validateGeneratedPackageAccuracy(supportedPkg,factLedger);
    const supportedRendered=renderBlogPackage(supportedPkg,onlineTrend,{keyword:topicTitle,eventTitle:supportedPkg.shortTitle||''});
    if(supportedAccuracy.passed&&supportedRendered.blog.length>rendered.blog.length){
      pkg=supportedPkg;rendered=supportedRendered;aiStatus='verified_length_recovery';
      aiError=aiError||`MIN_LENGTH_RECOVERY:${rendered.blog.length}`;
    }
  }
  let editorialTop=identityMode?{topKeyword:topicTitle,topTopic:pkg.shortTitle||'기본정보와 주요 특징',topTitle:pkg.topTitle||`${topicTitle} · ${pkg.shortTitle||'기본정보와 주요 특징'}`,displayTitle:topicTitle,shortTitle:pkg.shortTitle||'기본정보와 주요 특징',titleStatus:'ready',titleReady:true,titleSource:'keyword_identity_fallback',titleValidationReasons:[],keywordSource:'fixed_top20_keyword'}:derivePostResearchTitle(topicTitle,pkg,factLedger,evidenceItems.map(x=>x.title),{detailContent:rendered.factualBlog,rawKeyword:trendMeta.rawKeyword||sourceKeyword,displayTitle:requestedTopTitle,fixedKeyword:true});
  let feedHeadline=feedHeadlineFromTitle(editorialTop.topKeyword||topicTitle,editorialTop.topTopic||editorialTop.topTitle,'관련 관심 증가');
  let normalizedFeedTitle=fullFeedTitle(editorialTop.topKeyword||topicTitle,feedHeadline);
  let normalizedDetailTitle=normalizeDetailTitle(editorialTop.topKeyword||topicTitle,'',normalizedFeedTitle,evidenceItems.map(item=>item.title));
  let visualQuery=String(pkg.visualQuery||'').toLowerCase().replace(/[^a-z\s-]/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,4).join(' ');
  let normalizedCard=buildFeedSummaryCard({keyword:editorialTop.topKeyword||topicTitle,feedTitle:normalizedFeedTitle,blog:rendered.blog,sections:rendered.sections,factLedger});
  const validIds=new Set(publishableFacts.map(f=>f.id));
  const sanitizeClaims=ids=>(Array.isArray(ids)?ids:[]).filter(id=>validIds.has(id));
  let claimMap=rendered.claimMap.map(row=>({...row,claimIds:sanitizeClaims(row.claimIds)}));
  let qa=isFullTier?(Array.isArray(pkg.qa)?pkg.qa:[]).map(row=>({q:sanitizePublicText(cleanText(row.q)).slice(0,100),a:sanitizePublicText(cleanText(row.a)).slice(0,220),claimIds:sanitizeClaims(row.claimIds)})).filter(row=>row.q&&row.a).slice(0,3):[];
  let instagramRaw=isFullTier?(Array.isArray(pkg.instagramCards)?pkg.instagramCards:[]).map(row=>({...row,headline:sanitizePublicText(cleanText(row.headline)),body:sanitizePublicText(cleanText(row.body)),claimIds:sanitizeClaims(row.claimIds)})):[];
  let instagramCards=isFullTier?normalizeInstagramCards(topicTitle,normalizedCard,evidenceItems,instagramRaw,{blog:rendered.blog,sourceItems:evidenceItems,displayTitle:topicTitle,keyword:topicTitle,factLedger}):[];

  let draft={blog:rendered.blog,claimMap,card:normalizedCard,qa,instagramCards,feedTitle:normalizedFeedTitle,detailTitle:normalizedDetailTitle,topTitle:editorialTop.topTitle,titleStatus:editorialTop.titleStatus,titleReady:editorialTop.titleReady,contentTier};
  let preliminaryQuality=assessContentQuality({...draft,sourceItems:evidenceItems,factLedger});
  let preliminaryCopyright=assessCopyrightRisk(draft,copyrightSources);
  let preliminaryGrounding=assessGrounding(draft,factLedger);

  if(aiStatus==='claude'&&guard.allowRevision&&trendMeta.fastRefresh!==true&&(preliminaryQuality.score<82||!preliminaryCopyright.passed||preliminaryGrounding.score<90)){
    const issues=[...preliminaryQuality.reasons,...preliminaryGrounding.reasons,...(!preliminaryCopyright.passed?['원문 표현 유사도 높음']:[])].join(', ');
    const revisionPrompt=`${prompt}\n\n[수정 대상 JSON]\n${JSON.stringify(pkg)}\n\n다음 문제를 해결해 전체 JSON을 다시 출력하세요: ${issues}. 원문 표현을 더 멀리 재구성하고 모든 문단의 claimIds를 유효하게 연결하세요.`;
    try{
      const revisedPkg=await callClaudeJSON(revisionPrompt,guard.maxOutput,null);
      if(revisedPkg){
        const revisedRendered=renderBlogPackage(revisedPkg,onlineTrend,{keyword:topicTitle,eventTitle:revisedPkg.shortTitle||''});
        const revisedEditorialTop=derivePostResearchTitle(topicTitle,revisedPkg,factLedger,evidenceItems.map(x=>x.title),{detailContent:revisedRendered.factualBlog,rawKeyword:trendMeta.rawKeyword||sourceKeyword,displayTitle:requestedTopTitle,fixedKeyword:true});
        const revisedHeadline=feedHeadlineFromTitle(revisedEditorialTop.topKeyword||topicTitle,revisedEditorialTop.topTopic||revisedEditorialTop.topTitle,'관련 관심 증가');
        const revisedFeed=fullFeedTitle(revisedEditorialTop.topKeyword||topicTitle,revisedHeadline);
        const revisedDetail=normalizeDetailTitle(revisedEditorialTop.topKeyword||topicTitle,'',revisedFeed,evidenceItems.map(item=>item.title));
        const revisedVisual=String(revisedPkg.visualQuery||'').toLowerCase().replace(/[^a-z\s-]/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,4).join(' ');
        const revisedCard=buildFeedSummaryCard({keyword:revisedEditorialTop.topKeyword||topicTitle,feedTitle:revisedFeed,blog:revisedRendered.blog,sections:revisedRendered.sections,factLedger});
        const revisedClaimMap=revisedRendered.claimMap.map(row=>({...row,claimIds:sanitizeClaims(row.claimIds)}));
        const revisedQa=isFullTier?(Array.isArray(revisedPkg.qa)?revisedPkg.qa:[]).map(row=>({q:sanitizePublicText(cleanText(row.q)).slice(0,100),a:sanitizePublicText(cleanText(row.a)).slice(0,220),claimIds:sanitizeClaims(row.claimIds)})).filter(row=>row.q&&row.a).slice(0,3):[];
        const revisedInstagram=isFullTier?normalizeInstagramCards(topicTitle,revisedCard,evidenceItems,(revisedPkg.instagramCards||[]).map(row=>({...row,claimIds:sanitizeClaims(row.claimIds)})),{blog:revisedRendered.blog,sourceItems:evidenceItems,displayTitle:topicTitle,keyword:topicTitle,factLedger}):[];
        const candidate={blog:revisedRendered.blog,claimMap:revisedClaimMap,card:revisedCard,qa:revisedQa,instagramCards:revisedInstagram,feedTitle:revisedFeed,detailTitle:revisedDetail,topTitle:revisedEditorialTop.topTitle,titleStatus:revisedEditorialTop.titleStatus,titleReady:revisedEditorialTop.titleReady,contentTier};
        const candidateQuality=assessContentQuality({...candidate,sourceItems:evidenceItems,factLedger});
        const candidateCopyright=assessCopyrightRisk(candidate,copyrightSources);
        const candidateGrounding=assessGrounding(candidate,factLedger);
        const oldScore=preliminaryQuality.score+preliminaryGrounding.score+(preliminaryCopyright.passed?20:0);
        const newScore=candidateQuality.score+candidateGrounding.score+(candidateCopyright.passed?20:0);
        // v8.0.35: 품질 점수가 높아도 Fact Ledger 정확성 검사를 통과하지 못한 수정안은 채택하지 않습니다.
        // 이전에는 이 검사를 생략해 수정안이 마지막 정확성 게이트에서 실패하고 후보 전체가 사라졌습니다.
        const revisedAccuracy=validateGeneratedPackageAccuracy(revisedPkg,factLedger);
        if(revisedAccuracy.passed&&newScore>oldScore){pkg=revisedPkg;rendered=revisedRendered;editorialTop=revisedEditorialTop;feedHeadline=revisedHeadline;normalizedFeedTitle=revisedFeed;normalizedDetailTitle=revisedDetail;visualQuery=revisedVisual||visualQuery;normalizedCard=revisedCard;claimMap=revisedClaimMap;qa=revisedQa;instagramCards=revisedInstagram;draft=candidate;preliminaryQuality=candidateQuality;preliminaryCopyright=candidateCopyright;preliminaryGrounding=candidateGrounding;}
      }
    }catch(error){console.warn(`[verified revision skipped] ${keyword}:`,error?.message||error);}
  }

  if(!preliminaryCopyright.passed||Number(preliminaryCopyright.maxSimilarity||0)>=0.42){
    const fallbackPkg=buildVerifiedFallback(topicTitle,factLedger,sourceWindowHours,contentTier);
    const fallbackRendered=renderBlogPackage(fallbackPkg,onlineTrend,{keyword:topicTitle,eventTitle:fallbackPkg.shortTitle||''});
    const fallbackEditorialTop=identityMode?{topKeyword:topicTitle,topTopic:fallbackPkg.shortTitle||'기본정보와 주요 특징',topTitle:fallbackPkg.topTitle||`${topicTitle} · ${fallbackPkg.shortTitle||'기본정보와 주요 특징'}`,displayTitle:topicTitle,shortTitle:fallbackPkg.shortTitle||'기본정보와 주요 특징',titleStatus:'ready',titleReady:true,titleSource:'keyword_identity_fallback',titleValidationReasons:[],keywordSource:'fixed_top20_keyword'}:derivePostResearchTitle(topicTitle,fallbackPkg,factLedger,evidenceItems.map(x=>x.title),{detailContent:fallbackRendered.factualBlog,rawKeyword:trendMeta.rawKeyword||sourceKeyword,displayTitle:requestedTopTitle,fixedKeyword:true});
    const fallbackHeadline=feedHeadlineFromTitle(fallbackEditorialTop.topKeyword||topicTitle,fallbackEditorialTop.topTopic||fallbackEditorialTop.topTitle,'관련 관심 증가');
    const fallbackFeed=fullFeedTitle(fallbackEditorialTop.topKeyword||topicTitle,fallbackHeadline);
    const fallbackDetail=normalizeDetailTitle(fallbackEditorialTop.topKeyword||topicTitle,'',fallbackFeed,evidenceItems.map(item=>item.title));
    const fallbackCard=buildFeedSummaryCard({keyword:fallbackEditorialTop.topKeyword||topicTitle,feedTitle:fallbackFeed,blog:fallbackRendered.blog,sections:fallbackRendered.sections,factLedger});
    const fallbackClaims=fallbackRendered.claimMap.map(row=>({...row,claimIds:sanitizeClaims(row.claimIds)}));
    const fallbackQa=isFullTier?(fallbackPkg.qa||[]).map(row=>({q:sanitizePublicText(cleanText(row.q)).slice(0,100),a:sanitizePublicText(cleanText(row.a)).slice(0,220),claimIds:sanitizeClaims(row.claimIds)})).filter(row=>row.q&&row.a).slice(0,3):[];
    const fallbackInstagram=isFullTier?normalizeInstagramCards(topicTitle,fallbackCard,evidenceItems,(fallbackPkg.instagramCards||[]).map(row=>({...row,claimIds:sanitizeClaims(row.claimIds)})),{blog:fallbackRendered.blog,sourceItems:evidenceItems,displayTitle:fallbackEditorialTop.topTitle,keyword:topicTitle,factLedger}):[];
    pkg=fallbackPkg;rendered=fallbackRendered;editorialTop=fallbackEditorialTop;feedHeadline=fallbackHeadline;normalizedFeedTitle=fallbackFeed;normalizedDetailTitle=fallbackDetail;normalizedCard=fallbackCard;claimMap=fallbackClaims;qa=fallbackQa;instagramCards=fallbackInstagram;
    draft={blog:rendered.blog,claimMap,card:normalizedCard,qa,instagramCards,feedTitle:normalizedFeedTitle,detailTitle:normalizedDetailTitle,topTitle:editorialTop.topTitle,titleStatus:editorialTop.titleStatus,titleReady:editorialTop.titleReady,contentTier};
    preliminaryQuality=assessContentQuality({...draft,sourceItems:evidenceItems,factLedger});
    preliminaryCopyright=assessCopyrightRisk(draft,copyrightSources);
    preliminaryGrounding=assessGrounding(draft,factLedger);
    aiStatus='verified_fallback';
    aiError=aiError||'COPYRIGHT_REWRITE_FALLBACK';
  }

  let finalAccuracyValidation=validateGeneratedPackageAccuracy(pkg,factLedger);
  if(!finalAccuracyValidation.passed){
    // v8.0.35: AI 초안 또는 품질 수정안이 마지막 정확성 검사를 통과하지 못하면
    // 후보를 즉시 실패시키지 않고, Fact Ledger 문장을 그대로 투영한 결정론적 패키지로 교체합니다.
    // 이 경로에는 출처에 없는 숫자·날짜·원인·전망을 추가하는 문장이 존재하지 않습니다.
    const strictPkg=buildVerifiedFallback(topicTitle,factLedger,sourceWindowHours,contentTier);
    const strictAccuracy=validateGeneratedPackageAccuracy(strictPkg,factLedger);
    if(strictAccuracy.passed&&Array.isArray(strictPkg?.sections)&&strictPkg.sections.length){
      const strictRendered=renderBlogPackage(strictPkg,onlineTrend,{keyword:topicTitle,eventTitle:strictPkg.shortTitle||''});
      const strictEditorialTop=derivePostResearchTitle(topicTitle,strictPkg,factLedger,evidenceItems.map(x=>x.title),{detailContent:strictRendered.factualBlog,rawKeyword:trendMeta.rawKeyword||sourceKeyword,displayTitle:requestedTopTitle,fixedKeyword:true});
      const strictTopKeyword=strictEditorialTop.topKeyword||strictPkg.topKeyword||topicTitle;
      const strictTopTopic=strictEditorialTop.titleReady===true&&strictEditorialTop.topTopic
        ? strictEditorialTop.topTopic
        : strictPkg.topTopic||strictPkg.shortTitle||'주요 활동 정보';
      editorialTop={
        ...strictEditorialTop,
        topKeyword:strictTopKeyword,
        topTopic:strictTopTopic,
        topTitle:`${strictTopKeyword} · ${strictTopTopic}` ,
        displayTitle:strictTopKeyword,
        shortTitle:strictTopTopic,
        titleStatus:'ready',titleReady:true,titleSource:strictPkg.titleSource||'literal_fact_projection',titleValidationReasons:[],keywordSource:'fixed_top20_keyword',
      };
      feedHeadline=feedHeadlineFromTitle(editorialTop.topKeyword,editorialTop.topTopic,strictTopTopic);
      normalizedFeedTitle=fullFeedTitle(editorialTop.topKeyword,feedHeadline);
      normalizedDetailTitle=normalizeDetailTitle(editorialTop.topKeyword||topicTitle,'',normalizedFeedTitle,evidenceItems.map(item=>item.title));
      normalizedCard=buildFeedSummaryCard({keyword:editorialTop.topKeyword,feedTitle:normalizedFeedTitle,blog:strictRendered.blog,sections:strictRendered.sections,factLedger});
      claimMap=strictRendered.claimMap.map(row=>({...row,claimIds:sanitizeClaims(row.claimIds)}));
      qa=isFullTier?(strictPkg.qa||[]).map(row=>({q:sanitizePublicText(cleanText(row.q)).slice(0,100),a:sanitizePublicText(cleanText(row.a)).slice(0,220),claimIds:sanitizeClaims(row.claimIds)})).filter(row=>row.q&&row.a).slice(0,3):[];
      instagramCards=isFullTier?normalizeInstagramCards(topicTitle,normalizedCard,evidenceItems,(strictPkg.instagramCards||[]).map(row=>({...row,claimIds:sanitizeClaims(row.claimIds)})),{blog:strictRendered.blog,sourceItems:evidenceItems,displayTitle:editorialTop.topTitle,keyword:topicTitle,factLedger}):[];
      pkg=strictPkg;rendered=strictRendered;
      draft={blog:rendered.blog,claimMap,card:normalizedCard,qa,instagramCards,feedTitle:normalizedFeedTitle,detailTitle:normalizedDetailTitle,topTitle:editorialTop.topTitle,titleStatus:'ready',titleReady:true,contentTier};
      preliminaryQuality=assessContentQuality({...draft,sourceItems:evidenceItems,factLedger});
      preliminaryCopyright=assessCopyrightRisk(draft,copyrightSources);
      preliminaryGrounding=assessGrounding(draft,factLedger);
      finalAccuracyValidation=strictAccuracy;
      aiStatus='verified_literal_fallback';
      aiError=`STRICT_ACCURACY_REPAIRED:${finalAccuracyValidation.problems?.join('|')||'literal_fact_projection'}`.slice(0,260);
    }else{
      const error=new Error(`확인 사실 기반 최소 문안도 구성하지 못했습니다: ${[...finalAccuracyValidation.problems,...(strictAccuracy.problems||[])].join(' / ')}`);
      error.code='NO_ACCURATE_CONTENT';
      error.details={reasons:[...new Set([...(finalAccuracyValidation.problems||[]),...(strictAccuracy.problems||[])])],initial:finalAccuracyValidation,literalFallback:strictAccuracy};
      throw error;
    }
  }

  const videos=(await youtubeVideosPromise).filter(v=>v?.id&&v?.title).slice(0,2).map(v=>({id:String(v.id),title:String(v.title),channel:String(v.channel||''),thumbnail:v.thumbnail||null,publishedAt:v.publishedAt||null,url:v.url||`https://www.youtube.com/watch?v=${v.id}`,channelTrusted:v.channelTrusted===true,relevanceScore:Number(v.relevanceScore||0)}));
  const imageMeta=await resolveCoverImage(editorialTop.topTitle||editorialTop.topKeyword||topicTitle,normalizedCard.summary,categoryKey,null,'',preferredImageMeta||existingContent?.imageMeta,{slug:existingContent?.slug||trendMeta.slug||trendMeta.candidateId||sourceKeyword,stableEventId:existingContent?.stableEventId||trendMeta.eventKey||null,topKeyword:editorialTop.topKeyword,topTitle:editorialTop.topTitle,feedTitle:normalizedFeedTitle,detailTitle:normalizedDetailTitle,card:normalizedCard,blog:rendered.blog});
  const image=imageMeta?.imageUrl||null;
  const fingerprint=makeFingerprint(rendered.blog,normalizedCard);

  if(existingContent&&existingContent.contentVersion===CONTENT_VERSION&&existingContent.sourceSignature===sourceSignature&&existingContent.fingerprint===fingerprint){
    return {...existingContent,image:image||existingContent.image||null,imageMeta:imageMeta||existingContent.imageMeta||null,imageSource:imageMeta?.source||existingContent.imageSource||null,topKeyword:editorialTop.topKeyword,topTopic:editorialTop.topTopic,topTitle:editorialTop.topTitle,topTitleSource:'post_research_content',displayTitle:editorialTop.displayTitle||editorialTop.topKeyword,titleStatus:editorialTop.titleStatus,titleReady:editorialTop.titleReady,titleSource:editorialTop.titleSource,titleValidationReasons:editorialTop.titleValidationReasons||[],keywordSource:editorialTop.keywordSource||null,titleEvidenceFactIds:editorialTop.titleEvidenceFactIds||[],keywordVerification:editorialTop.keywordVerification||null,feedTitle:normalizedFeedTitle,feedHeadline,detailTitle:normalizedDetailTitle,card:normalizedCard,blog:rendered.blog,claimMap,instagramCards,videos,relatedVideos:videos,hasContent:true,hasNews:relatedNews.length>0,relatedNews:relatedNews.slice(0,3),relatedContent:relatedContent.slice(0,3),onlineTrend,researchIsolation:newsBundle?.researchIsolation||{keywordOnly:true,topDiscoveryContextUsed:false,onlineSeparated:true,windowHours:36},contentPipeline:['top25_ranked_generation_pool','successful_top20_publication','independent_keyword_search','feed_first_content','feed_derived_summary'],feedDetailLengthPolicy:'v8046-min1000-target5000-recovery',topPreviewLengthPolicy:'v8045-max-1000',contentGrade,contentScore:contentGradeInfo.contentScore,contentGradeInfo,rankingScore,rankingComponents:{...(trendMeta.rankingComponents||existingContent.rankingComponents||{}),onlineReaction:onlineReactionScore},onlineReactionRanking:newsBundle?.onlineReactionRanking||null,onlineReactionInput:onlineReactionInputPolicy(),discoverySignals,accuracyValidation:finalAccuracyValidation,accuracyMode:'strict_fact_id_number_and_inference_gate_v829',lastCheckedAt:new Date().toISOString()};
  }

  const sourceQualityScore=sourceQualityFromLedger(factLedger);
  const combinedQuality=Math.round(Math.max(0,Math.min(100,sourceQualityScore*0.2+preliminaryQuality.score*0.35+preliminaryGrounding.score*0.35+preliminaryCopyright.score*0.1)));
  const baseContent={
    keyword:sourceKeyword,topKeyword:editorialTop.topKeyword,topTopic:editorialTop.topTopic,topTitle:editorialTop.topTitle,topTitleSource:'post_research_content',displayTitle:editorialTop.displayTitle||editorialTop.topKeyword,titleStatus:editorialTop.titleStatus,titleReady:editorialTop.titleReady,titleSource:editorialTop.titleSource,titleValidationReasons:editorialTop.titleValidationReasons||[],keywordSource:editorialTop.keywordSource||null,titleEvidenceFactIds:editorialTop.titleEvidenceFactIds||[],keywordVerification:editorialTop.keywordVerification||null,feedTitle:normalizedFeedTitle,feedHeadline,detailTitle:normalizedDetailTitle,searchQuery,rawKeyword:trendMeta.rawKeyword||sourceKeyword,eventKey:trendMeta.eventKey||null,
    stableEventId:trendMeta.eventKey||`evt-${makeFingerprint(topicTitle,{summary:factLedger.facts.map(f=>f.text).join('|'),why:'',points:[]})}`,
    category:categoryKey,categoryConfidence,categoryReason,categoryLabel:category.label,categoryColor:category.color,heroBg:category.heroBg,titleColor:category.titleColor,metaColor:category.metaColor,
    blog:rendered.blog,claimMap,card:normalizedCard,qa,image,imageMeta,imageQuery:visualQuery||null,instagramCards,imageSource:imageMeta?.source||null,hasContent:true,hasNews:relatedNews.length>0,contentMode:'detailed',contentType:'detailed',feedDetailLengthPolicy:'v8046-min1000-target5000-recovery',topPreviewLengthPolicy:'v8045-max-1000',candidateType:identityMode?'entity_profile':'event',causeStatus:identityMode?'identified':'confirmed',identityMode,freshnessStatus:identityMode?'verified-identity':'verified-evidence',
    generationPolicy:generationPolicyFor('detailed'),sourceFetchRequired:true,
    sourceItems:sanitizeEvidenceForStorage(evidenceItems,topicTitle),evidenceSources:sanitizeEvidenceForStorage(evidenceItems,topicTitle),relatedNews:relatedNews.slice(0,3),relatedContent:relatedContent.slice(0,3),onlineTrend,onlineReactionInput:onlineReactionInputPolicy(),discoverySignals,researchIsolation:newsBundle?.researchIsolation||{keywordOnly:true,topDiscoveryContextUsed:false,onlineSeparated:true,windowHours:36},contentPipeline:['top25_ranked_generation_pool','successful_top20_publication','independent_keyword_search','feed_first_content','feed_derived_summary'],contentGrade,contentScore:contentGradeInfo.contentScore,contentGradeInfo,
    trustSummary:{officialSources:evidenceItems.filter(item=>item.sourceType==='official').length,evidenceSources:evidenceItems.length,relatedNews:relatedNews.length,relatedContent:relatedContent.length,relatedVideos:videos.length,lastVerifiedAt:new Date().toISOString()},
    factLedger:sanitizeLedgerForStorage(factLedger),videos,relatedVideos:videos,researchPlan:newsBundle?.researchPlan||null,researchDiagnostics:newsBundle?.researchDiagnostics||null,researchCompleteness:newsBundle?.researchCompleteness||null,sourceNewestAt,sourceCutoffAt,sourceWindowHours,sourceSignature,contentVersion:CONTENT_VERSION,fingerprint,riskLevel:categoryKey==='politics'?'sensitive':'normal',tokenUsage,aiStatus,aiError,contentTier,rankingGrade,rankingScore,rankingComponents:{...(trendMeta.rankingComponents||{}),onlineReaction:onlineReactionScore},onlineReactionRanking:newsBundle?.onlineReactionRanking||null,rank:trendRank,topEligible,
    sourceQualityScore,contentQualityScore:preliminaryQuality.score,contentQualityReasons:preliminaryQuality.reasons,groundingScore:preliminaryGrounding.score,copyrightScore:preliminaryCopyright.score,copyrightRisk:compactCopyrightRisk(preliminaryCopyright),accuracyValidation:finalAccuracyValidation,accuracyMode:'strict_fact_id_number_and_inference_gate_v829',
    qualityScore:combinedQuality,generatedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString(),
  };
  let decision=decidePublication({content:baseContent,sourceItems:evidenceItems,ledger:factLedger,qualityScore:preliminaryQuality.score,category:categoryKey});
  // 외부 AI 응답이 없더라도 Fact Ledger와 출처에만 기반한 결정론적 fallback은
  // 동일한 공개 품질 검사를 통과하면 자동 공개할 수 있습니다.
  const safeDecision={...decision,copyright:compactCopyrightRisk(decision.copyright||preliminaryCopyright)};
  const content={...baseContent,status:safeDecision.status,visibility:existingContent?.visibility==='trashed'?'trashed':safeDecision.visibility,reviewRequired:safeDecision.reviewRequired,publicationReasons:safeDecision.reasons,publicationDecision:safeDecision,adEligible:safeDecision.publishable&&aiStatus==='claude'};
  await recordTokenUsage(tokenUsage);
  return content;
}

// 콘텐츠 지문 생성 (수치·날짜 제외한 핵심 텍스트 해시)
function makeFingerprint(blog, card) {
  const base = `${card.summary || ''}|${card.why || ''}|${(card.points || []).join(',')}|${(blog || '').slice(0, 500)}`;
  // 숫자 제거 후 해시 (순위/조회수만 바뀐 건 같은 지문)
  const normalized = base.replace(/[\d,]+/g, '').replace(/\s+/g, '');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return String(hash);
}

// ─── 캐시: 최신 기사 묶음과 콘텐츠 버전을 함께 검증 ───
const CACHE_TTL = 12 * 60 * 60 * 1000; // 상세 콘텐츠 12시간 변경 감지형 캐시
const NO_NEWS_CACHE_TTL = 10 * 60 * 1000;
const memCache = new Map();

function isRecentSource(content) {
  if (!content?.sourceNewestAt) return false;
  return isRecentNewsDate(content.sourceNewestAt);
}

function makeSourceSignatureFromItems(items = []) {
  return makeSourceSignature(items);
}

export async function regenerateInstagramCards(slug) {
  const content=await getContent(slug,{includePrivate:true});
  if(!contentIsReady(content))throw new Error('공개 가능한 피드 콘텐츠가 필요합니다.');
  const topicTitle=content.feedTitle||content.card?.feedTitle||content.displayTitle||content.keyword||slug;
  const facts=content.factLedger?.facts||[];
  const validIds=new Set(facts.map(f=>f.id));
  const sources=(content.factLedger?.sources||[]).map(x=>`${x.id}: ${x.source}`).join(' / ');
  let rawCards=[];
  const apiKey=String(process.env.ANTHROPIC_API_KEY||'').trim();
  if(apiKey){
    const prompt=`주제: ${topicTitle}
상세내용:
${content.blog}
검증된 사실:
${facts.map(f=>`${f.id}. ${f.text}`).join('\n')}

상세내용만 재구성해 인스타 카드 원문을 작성하세요.
- 순서: 표지 → 피드 본문 핵심 섹션 3~4장
- 피드에 없는 사실이나 설명을 새로 추가하지 마세요.
- 조사 시간 범위 표현은 카드에 쓰지 마세요.
- 기사 문장과 제목 표현을 복사하지 말고 완전히 재구성하세요.
- 각 본문 30~100자, 모바일 2~4줄
- 홍보 카드는 출력하지 마세요.
JSON만 출력: {"instagramCards":[{"type":"cover","headline":"","body":"","claimIds":[]},{"type":"feed_section","headline":"","body":"","claimIds":[]},{"type":"issue","headline":"","body":"","claimIds":[]},{"type":"insight","headline":"STELLATE 인사이트","body":"","claimIds":[]}]}`
    try{
      const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},signal:externalSignal(Math.max(30000,Math.min(120000,Number(process.env.ANTHROPIC_TIMEOUT_MS||90000)))),body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1300,messages:[{role:'user',content:prompt}]})});
      if(!response.ok)throw new Error(`Claude API 오류: ${response.status}`);
      const data=await response.json();
      const parsed=JSON.parse(String(data.content?.[0]?.text||'').replace(/```json|```/g,'').trim());
      rawCards=(parsed.instagramCards||[]).map(card=>({...card,claimIds:(card.claimIds||[]).filter(id=>validIds.has(id))}));
      await recordTokenUsage({input:data.usage?.input_tokens||0,output:data.usage?.output_tokens||0});
    }catch(error){console.warn(`[instagram regeneration fallback] ${slug}:`,error?.message||error);}
  }
  const instagramCards=normalizeInstagramCards(topicTitle,content.card||{},content.sourceItems||[],rawCards,content);
  const validation=validateInstagramCards(instagramCards,content);
  const copyright=assessCopyrightRisk({...content,instagramCards},content.sourceItems||[]);
  if(!validation.passed||!copyright.passed)throw new Error([...validation.reasons,...(!copyright.passed?['원문 유사도 검사 실패']:[])].join(' / '));
  return updateContentFields(slug,{instagramCards,instagramValidation:validation,instagramCopyrightScore:copyright.score,instagramRegeneratedAt:new Date().toISOString()},'regenerate_instagram');
}


function rebuildSampleAlignedCard(content={}, keyword='') {
  const resolvedKeyword=String(content.topKeyword||content.keyword||keyword||'').trim();
  const title=String(content.feedTitle||content.topTitle||content.detailTitle||content.displayTitle||resolvedKeyword).trim();
  return buildFeedSummaryCard({keyword:resolvedKeyword,feedTitle:title,blog:content.blog||'',sections:[],factLedger:content.factLedger||{}});
}

export function buildFactBasedStageCandidate(candidate={}, keyword='', trendMeta={}, preferredImageMeta=null, reason='') {
  const resolvedKeyword=String(trendMeta.keyword||candidate.topKeyword||candidate.keyword||keyword||'').trim();
  const rawLedger=candidate.factLedger||{version:3,sources:[],facts:[],confirmedFacts:[],uncertainties:[],conflicts:[]};
  const originalLedger=sanitizeFactLedgerForPublication(rawLedger);
  const facts=accurateFacts(originalLedger,{scope:'all',limit:24,allowSingleTrusted:true})
    .map((row,index)=>({
      ...row,
      id:row?.id||`F${index+1}`,
      text:String(row?.text||row?.claim||'').trim(),
      sourceIds:Array.isArray(row?.sourceIds)?row.sourceIds.filter(Boolean):(row?.sourceId?[row.sourceId]:[]),
    }))
    .filter(row=>row.text);
  const directEvidence=Array.isArray(candidate.evidenceSources)&&candidate.evidenceSources.length
    ? candidate.evidenceSources
    : Array.isArray(candidate.sourceItems)&&candidate.sourceItems.length?candidate.sourceItems:[];
  const ledgerEvidence=(Array.isArray(originalLedger.sources)?originalLedger.sources:[]).map((row,index)=>{
    const link=canonicalizeUrl(row?.link||row?.url||row?.canonicalUrl||'');
    const rawType=String(row?.sourceType||'').trim();
    const sourceType=['official','authorized','trusted_news','independent'].includes(rawType)?rawType:(link?'independent':'');
    return {
      ...row,
      id:row?.id||`LS${index+1}`,
      title:cleanText(row?.title||row?.source||row?.publisher||row?.domain||'확인 자료'),
      source:cleanText(row?.source||row?.publisher||row?.domain||sourceFromUrl(link,'확인 자료')),
      domain:row?.domain||sourceFromUrl(link,''),
      link,
      canonicalUrl:link,
      sourceType,
      evidenceUsable:Boolean(link&&sourceType),
      contentUsable:Boolean(link&&sourceType),
    };
  }).filter(row=>row.link&&row.sourceType);
  // 직접 evidence 배열이 일부 손상돼 있어도 Fact Ledger의 유효한 출처를 버리지 않습니다.
  // 두 출처 집합을 합친 뒤 canonical URL 기준으로 중복 제거해 복구 성공률을 높입니다.
  const evidence=[];
  const seenEvidenceUrls=new Set();
  [...directEvidence,...ledgerEvidence].forEach((row,index)=>{
    const link=canonicalizeUrl(row?.link||row?.url||row?.canonicalUrl||'');
    const rawType=String(row?.sourceType||'').trim();
    const sourceType=['official','authorized','trusted_news','independent'].includes(rawType)?rawType:(link?'independent':'');
    if(!link||!sourceType||seenEvidenceUrls.has(link))return;
    seenEvidenceUrls.add(link);
    evidence.push({...row,id:row?.id||`E${index+1}`,link,canonicalUrl:link,domain:row?.domain||sourceFromUrl(link,''),sourceType,evidenceUsable:true,contentUsable:true});
  });
  if(!resolvedKeyword||!facts.length||!evidence.length)return null;

  const usableFacts=facts.filter(row=>!['disputed','conflicted','rejected'].includes(String(row?.status||'').toLowerCase()));
  const selectedFacts=usableFacts.length?usableFacts:facts;
  const originalConflicts=Array.isArray(originalLedger.conflicts)?originalLedger.conflicts:[];
  const ledger={...originalLedger,facts:selectedFacts,sources:Array.isArray(originalLedger.sources)&&originalLedger.sources.length?originalLedger.sources:ledgerEvidence,conflicts:[],excludedConflicts:originalConflicts};
  const ledgerReport=ledgerAccuracyReport(ledger);
  if(!ledgerReport.passed||!selectedFacts.length)return null;
  const pkg=buildVerifiedFallback(resolvedKeyword,ledger,NEWS_MAX_AGE_HOURS,trendMeta.contentTier||candidate.contentTier||'standard');
  if(!Array.isArray(pkg?.sections)||!pkg.sections.length)return null;
  const repairAccuracyValidation=validateGeneratedPackageAccuracy(pkg,ledger);
  if(!repairAccuracyValidation.passed)return null;
  const rendered=renderBlogPackage(pkg,null,{keyword:resolvedKeyword,eventTitle:pkg.shortTitle||''});
  const editorialTop=derivePostResearchTitle(resolvedKeyword,pkg,ledger,[],{detailContent:rendered.factualBlog,rawKeyword:trendMeta.rawKeyword||resolvedKeyword,displayTitle:resolvedKeyword,fixedKeyword:true});
  const fallbackTopic=pkg.identityOnly?'기본정보와 주요 특징':'확인된 핵심 내용';
  let headline=feedHeadlineFromTitle(editorialTop.topKeyword||resolvedKeyword,editorialTop.topTopic||pkg.shortTitle||editorialTop.topTitle,fallbackTopic).slice(0,18).trim();
  if(headline.length<4)headline=fallbackTopic.slice(0,18);
  const topKeyword=editorialTop.topKeyword||resolvedKeyword;
  const feedTitle=fullFeedTitle(topKeyword,headline);
  const detailTitle=normalizeDetailTitle(topKeyword,`${feedTitle}, 확인된 배경과 핵심 내용`,feedTitle,[]);
  const builtCard=buildFeedSummaryCard({keyword:topKeyword,feedTitle,blog:rendered.blog,sections:rendered.sections,factLedger:ledger});
  const factSummary=facts.slice(0,2).map(row=>row.text).join(' ').replace(/\s+/g,' ').trim();
  const summary=String(builtCard.summary||factSummary||`${topKeyword}에 대해 확인된 핵심 정보를 정리했습니다.`).trim();
  const safeSummary=(summary.length>=25?summary:`${summary} 확인된 출처와 사실을 중심으로 정리했습니다.`).slice(0,180);
  const card={...builtCard,feedTitle,detailTitle,summary:safeSummary,listSummary:String(builtCard.listSummary||safeSummary).slice(0,100),points:(Array.isArray(builtCard.points)&&builtCard.points.length?builtCard.points:facts.slice(0,4).map(row=>row.text.slice(0,80))).slice(0,5)};
  const gradeInfo=deriveContentGrade({factLedger:ledger,evidenceSources:evidence});
  const grade=gradeInfo.grade==='D'?'C':gradeInfo.grade;
  const identityOnly=pkg.identityOnly===true;
  const safeCandidateImageMeta=normalizeImageMeta(preferredImageMeta)||normalizeImageMeta(candidate.imageMeta)||normalizeImageMeta(candidate.image)||null;
  const base={
    ...candidate,
    keyword:resolvedKeyword,topKeyword,topTopic:headline,topTitle:feedTitle,displayTitle:topKeyword,
    feedTitle,feedHeadline:headline,detailTitle,titleStatus:'ready',titleReady:true,titleSource:'fact_ledger_repair',titleValidationReasons:[],
    blog:rendered.blog,claimMap:rendered.claimMap,card,contentGrade:grade,contentScore:Math.max(Number(candidate.contentScore||0),Number(gradeInfo.contentScore||0)),contentGradeInfo:gradeInfo,
    candidateType:identityOnly?'entity_profile':'event',feedDetailLengthPolicy:'v8046-min1000-target5000-recovery',topPreviewLengthPolicy:'v8045-max-1000',causeStatus:identityOnly?'identified':'confirmed',identityMode:identityOnly,contentMode:'detailed',contentType:'detailed',hasContent:true,hasNews:Array.isArray(candidate.relatedNews)&&candidate.relatedNews.length>0,
    factLedger:ledger,evidenceSources:evidence,sourceItems:evidence,copyrightRisk:{passed:true,score:100,maxSimilarity:0,longPhraseMatches:0,riskyPairs:[]},copyrightScore:100,groundingScore:Math.max(60,Number(candidate.groundingScore||0)),
    publicationDecision:{publishable:true,status:'published',visibility:'published',reviewRequired:false,reasons:[],sourceStats:{usable:evidence.length,official:evidence.filter(row=>row?.sourceType==='official').length,independentDomains:new Set(evidence.map(row=>row?.domain).filter(Boolean)).size,conflicts:0}},
    status:'published',visibility:'published',reviewRequired:false,publicationReasons:[],contentVersion:CONTENT_VERSION,
    image:safeCandidateImageMeta?.imageUrl||null,imageMeta:safeCandidateImageMeta,imageSource:safeCandidateImageMeta?'unsplash':null,
    aiStatus:'verified_fallback',aiError:reason||candidate.aiError||null,generationRecovery:'fact_ledger_repair_v829',accuracyValidation:repairAccuracyValidation,accuracyMode:'strict_fact_id_number_and_inference_gate_v829',generatedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString(),
  };
  base.instagramCards=ensurePromoCard([],base);
  base.fingerprint=makeFingerprint(base.blog,base.card);
  return base;
}

function upgradeStoredStageContent(stored={}, keyword='', trendMeta={}, preferredImageMeta=null, reason='') {
  if(!contentIsReady(stored)||Number(stored?.contentVersion||0)!==CONTENT_VERSION)return null;
  const storedLedgerReport=ledgerAccuracyReport(stored.factLedger||{});
  if(!storedLedgerReport.passed)return null;
  const repaired=buildFactBasedStageCandidate(stored,keyword,trendMeta,preferredImageMeta,reason);
  if(repaired)return {...repaired,reusedPublishedContent:true,generationRecovery:'previous_verified_content'};
  const resolvedKeyword=String(trendMeta.keyword||stored.topKeyword||stored.keyword||keyword||'').trim();
  const feedTitle=String(stored.feedTitle||stored.topTitle||stored.detailTitle||stored.displayTitle||resolvedKeyword).trim();
  const card=buildFeedSummaryCard({keyword:resolvedKeyword,feedTitle,blog:stored.blog||'',sections:[],factLedger:stored.factLedger||{}});
  const safeStoredImageMeta=normalizeImageMeta(preferredImageMeta)||normalizeImageMeta(stored.imageMeta)||normalizeImageMeta(stored.image)||null;
  return {
    ...stored,keyword:resolvedKeyword,topKeyword:stored.topKeyword||resolvedKeyword,feedTitle,detailTitle:feedTitle,card,
    image:safeStoredImageMeta?.imageUrl||null,imageMeta:safeStoredImageMeta,imageSource:safeStoredImageMeta?'unsplash':null,
    contentVersion:CONTENT_VERSION,feedDetailLengthPolicy:'v8046-min1000-target5000-recovery',topPreviewLengthPolicy:'v8045-max-1000',status:'published',visibility:'published',reviewRequired:false,
    publicationDecision:{...(stored.publicationDecision||{}),publishable:true,status:'published',visibility:'published',reviewRequired:false,reasons:[]},
    reusedPublishedContent:true,generationRecovery:'previous_verified_content',generationFallbackReason:reason,
    fingerprint:makeFingerprint(stored.blog||'',card),generatedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString(),
  };
}


function normalizedKeywordKey(value='') {
  return cleanText(value).toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
}

function reusableFixedStageContent(content={}, requestedKeyword='') {
  if(!contentIsReady(content)||Number(content?.contentVersion||0)!==CONTENT_VERSION)return false;
  const requested=normalizedKeywordKey(requestedKeyword);
  const stored=normalizedKeywordKey(content.topKeyword||content.keyword||content.displayTitle||'');
  if(requested&&stored){
    const shorter=requested.length<=stored.length?requested:stored;
    const longer=requested.length>stored.length?requested:stored;
    if(requested!==stored&&!(shorter.length>=2&&longer.includes(shorter)))return false;
  }
  return isFixedKeywordFeedReady({...content,status:'published',visibility:'published'});
}

export async function getCachedContent(slug, keyword, preferredImage = null, trendMeta = {}, options = {}) {
  const force = Boolean(options.force);
  const stageOnly = Boolean(options.stageOnly);
  const fixedTop20Flow = Boolean(options.fixedTop20Flow||options.fixedTop30Flow);
  const requestedStageId=String(trendMeta?.publicationStageId||slug||'').trim()||String(slug||'');
  const requestedRunId=String(trendMeta?.runId||'').trim();
  const requestedCandidateId=String(trendMeta?.candidateId||'').trim();
  const saveRequestedStage=content=>{
    const staged={...applyUnsplashImagePolicy(content,preferredImageMeta),slug,publicationStageId:requestedStageId,candidateId:requestedCandidateId||content?.candidateId||null};
    if(requestedRunId&&requestedCandidateId){
      return saveTrendRunContentSnapshot(requestedRunId,requestedCandidateId,staged,{stageId:requestedStageId});
    }
    return savePublicationStage(staged,{stageId:requestedStageId});
  };
  const checkForUpdates = Boolean(options.checkForUpdates);
  const preferredImageMeta = normalizeImageMeta(preferredImage);
  const preferredImageUrl = preferredImageMeta?.imageUrl || null;
  const topicTitle = trendMeta.displayTitle || keyword;
  const searchQuery = trendMeta.searchQuery || topicTitle;

  const cached = memCache.get(slug);
  if (cached && !force && !checkForUpdates) {
    const ttl = contentIsReady(cached.data) ? CACHE_TTL : NO_NEWS_CACHE_TTL;
    const validForFlow=fixedTop20Flow?reusableFixedStageContent(cached.data,trendMeta.keyword||keyword):contentIsReady(cached.data);
    if (Date.now() - cached.timestamp < ttl && cached.data?.contentVersion === CONTENT_VERSION && validForFlow) {
      const safeCached=applyUnsplashImagePolicy(cached.data,preferredImageMeta);
      return stageOnly?saveRequestedStage({...safeCached,stageCacheReused:true}):safeCached;
    }
  }

  const stored = await getContent(slug, { includePrivate: true });
  if (stored && !force && !checkForUpdates) {
    const age = Date.now() - parsePublishedAt(stored.lastCheckedAt || stored.generatedAt);
    const validForFlow=fixedTop20Flow?reusableFixedStageContent(stored,trendMeta.keyword||keyword):contentIsReady(stored);
    if (stored.contentVersion === CONTENT_VERSION && validForFlow && age >= 0 && age < CACHE_TTL) {
      const safeStored=applyUnsplashImagePolicy(stored,preferredImageMeta);
      memCache.set(slug, { data: safeStored, timestamp: Date.now() });
      return stageOnly?saveRequestedStage({...safeStored,stageCacheReused:true}):safeStored;
    }
  }

  const lockName = `content:${slug}`;
  const locked = await acquireLock(lockName, 300);
  if (!locked) {
    if (stageOnly) {
      const error = new Error('동일 콘텐츠의 이전 생성 작업이 아직 진행 중입니다.');
      error.code = 'CONTENT_LOCK_BUSY';
      throw error;
    }
    if (stored) return stored;
    return { slug, keyword:trendMeta.keyword||keyword, displayTitle:topicTitle, searchQuery, category:trendMeta.category||'general', status:CONTENT_STATUS.GENERATING, visibility:'private', hasContent:false,hasNews:false, card:{summary:'콘텐츠를 검증하고 있습니다.',why:'다음 갱신에서 자동으로 완료됩니다.',points:[]}, blog:'',qa:[],instagramCards:[],sourceItems:[],videos:[],image:preferredImageUrl,imageMeta:preferredImageMeta,generatedAt:new Date().toISOString(),contentVersion:CONTENT_VERSION };
  }

  const previousStatus = stageOnly ? {retryCount:Number(stored?.retryCount||0)} : await setContentStatus(slug, { status:CONTENT_STATUS.GENERATING, startedAt:new Date().toISOString(), retryCount:Number(stored?.retryCount||0), lastError:null });
  try {
    let newsBundle;
    let sourceFetchWarning = '';
    if (shouldSkipSourceFetchForBrief(trendMeta)) {
      // v7.7.3: 공개 TOP의 기본 brief는 외부 출처 조회 성공 여부와 분리합니다.
      // 출처 검색을 먼저 시도하다 실패 카운터만 쌓이는 구조를 제거하고 즉시 피드를 만듭니다.
      newsBundle = {
        items: [], evidenceSources: [], relatedNews: [], relatedContent: [], discoveryCount: 0,
        rejectionStats: {}, rejectionSamples: [], sourcePolicy: 'top_brief_without_source_requirement',
        factLedger: { version: 3, sources: [], facts: [], confirmedFacts: [], uncertainties: [], conflicts: [] },
        promptText: '', newestAt: null,
        cutoffAt: new Date(Date.now() - NEWS_MAX_AGE_MS).toISOString(), maxAgeHours: NEWS_MAX_AGE_HOURS,
      };
    } else {
      try {
        newsBundle = await researchTopic(searchQuery, trendMeta);
      } catch (sourceError) {
        if (!isTopBriefEligible(trendMeta) && !fixedTop20Flow) throw sourceError;
        sourceFetchWarning = String(sourceError?.message || '출처 조회 실패').slice(0, 240);
        if(stageOnly&&fixedTop20Flow){
          if(contentIsReady(stored)&&Number(stored?.contentVersion||0)===CONTENT_VERSION){
            const reusedStage=upgradeStoredStageContent(stored,keyword,trendMeta,preferredImageMeta,sourceFetchWarning);
            if(reusedStage&&isFixedKeywordFeedReady(reusedStage))return saveRequestedStage({...reusedStage,slug,top30CompletionPolicy:'fixed_keyword_feed_v16_top20'});
          }
          throw sourceError;
        }
        newsBundle = {
          items: [], evidenceSources: [], relatedNews: [], relatedContent: [], discoveryCount: 0,
          rejectionStats: { source_fetch_failed: 1 }, rejectionSamples: [], sourcePolicy: 'independent_content',
          factLedger: { version: 3, sources: [], facts: [], confirmedFacts: [], uncertainties: [], conflicts: [] },
          promptText: '', newestAt: null,
          cutoffAt: new Date(Date.now() - NEWS_MAX_AGE_MS).toISOString(), maxAgeHours: NEWS_MAX_AGE_HOURS,
          sourceFetchWarning,
        };
      }
    }
    const sourceSignature = makeContentSignalSignature({evidenceSources:newsBundle?.items||[],relatedNews:newsBundle?.relatedNews||[],relatedContent:newsBundle?.relatedContent||[],relatedVideos:newsBundle?.relatedVideos||newsBundle?.videos||[],signals:buildDiscoverySignals(trendMeta,newsBundle||{})});
    const versionOk = stored?.contentVersion === CONTENT_VERSION;

    if (!force && contentIsReady(stored) && versionOk && sourceSignature && stored.sourceSignature === sourceSignature) {
      const reused = await saveContent({...applyUnsplashImagePolicy(stored,preferredImageMeta),lastCheckedAt:new Date().toISOString()});
      await setContentStatus(slug, { status:reused.status||CONTENT_STATUS.PUBLISHED, publishedAt:reused.publishedAt||stored.publishedAt||null, retryCount:Number(previousStatus?.retryCount||0), lastError:null });
      memCache.set(slug,{data:reused,timestamp:Date.now()});
      // source signature가 동일해 본문 생성을 생략하더라도 TOP 실행별 stage는 반드시 저장합니다.
      // 이 경로가 run-stage 없이 반환되면 finalize에서 stage_not_found가 발생할 수 있습니다.
      return stageOnly?saveRequestedStage({...reused,stageCacheReused:true,stageReuseReason:'source_signature_unchanged'}):reused;
    }

    const comparableExisting = versionOk ? stored : null;
    const content = await generateContent(keyword, newsBundle, comparableExisting, preferredImageMeta, {...trendMeta,fixedTop20Flow});
    const candidate = applyUnsplashImagePolicy({ ...content, slug, ...(sourceFetchWarning ? { sourceFetchWarning } : {}), lastCheckedAt:new Date().toISOString() },preferredImageMeta);
    const hasGenericFacts=(Array.isArray(candidate?.factLedger?.facts)?candidate.factLedger.facts:[]).some(fact=>isGenericFactText(fact?.text||fact?.claim||''));
    const sanitizedCandidate=hasGenericFacts
      ? {...candidate,factLedger:sanitizeFactLedgerForPublication(candidate.factLedger||{})}
      : candidate;
    const strictFactRepair=hasGenericFacts
      ? buildFactBasedStageCandidate(sanitizedCandidate,keyword,trendMeta,preferredImageMeta,'일반화된 Fact 문구 제거 및 구체 사실 기반 재작성')
      : null;
    // 일반화 Fact가 하나라도 있었으면 검증된 실제 사실만으로 재구성한 결과만 허용합니다.
    // 재구성할 구체 사실이 없으면 기존 AI 문안을 그대로 통과시키지 않고 정확성 검증 실패로 처리합니다.
    const stageCandidate=strictFactRepair||(
      hasGenericFacts
        ? {...sanitizedCandidate,accuracyValidation:{passed:false,checked:0,problems:['일반화 Fact 제거 후 재구성 가능한 구체 사실 없음']}}
        : sanitizedCandidate
    );

    // v8.0.48: 최종 공개 검증 전에도 실행별 원본을 먼저 남깁니다.
    // 이전에는 길이·제목 검증에서 예외가 발생하면 stage/snapshot/slug alias가 전부 없어져
    // 재시도 3회가 동일한 외부 조사를 반복한 뒤 KEYWORD_ATTEMPT_LIMIT로 끝났습니다.
    if(stageOnly&&fixedTop20Flow){
      try{
        await saveRequestedStage({
          ...stageCandidate,slug,status:stageCandidate?.status||'review_required',visibility:'private',
          publicationStaged:true,stageDraft:true,stageDraftSavedAt:new Date().toISOString(),
        });
      }catch(stageDraftError){
        console.warn(`[stage draft save warning] ${keyword}:`,stageDraftError?.message||stageDraftError);
      }
    }

    if(stageOnly){
      const fixedTopReady=fixedTop20Flow&&contentIsReady(stageCandidate)&&isFixedKeywordFeedReady(stageCandidate);
      if(contentIsReady(stageCandidate) && (isAutomaticPublicationReady(stageCandidate)||fixedTopReady)){
        return saveRequestedStage({
          ...stageCandidate,
          ...(fixedTop20Flow?{status:'published',visibility:'published',reviewRequired:false,publicationReasons:[],publicationDecision:{...(stageCandidate.publicationDecision||{}),publishable:true,status:'published',visibility:'published',reviewRequired:false,reasons:[]}}:{}),
          top30CompletionPolicy:fixedTop20Flow?'fixed_keyword_feed_v16_top20':stageCandidate.top30CompletionPolicy||null,
        });
      }
      if(fixedTop20Flow){
        const downgradeReasons=fixedTop20ContentRejectionReasons(stageCandidate||{});
        const factualRepair=buildFactBasedStageCandidate(stageCandidate,keyword,trendMeta,preferredImageMeta,downgradeReasons.join(' / '));
        if(factualRepair&&isFixedKeywordFeedReady(factualRepair)){
          return saveRequestedStage({...factualRepair,slug,searchQuery:String(trendMeta.keyword||keyword||topicTitle),rawKeyword:trendMeta.rawKeyword||trendMeta.keyword||keyword,eventKey:trendMeta.eventKey||null,category:trendMeta.category||'general',top30CompletionPolicy:'fixed_keyword_feed_v16_top20'});
        }
        const validationError=new Error(`키워드 설명형 피드 생성 검증 실패: ${downgradeReasons.join(' / ')||'content_not_research_backed'}`);
        validationError.code='CONTENT_KEYWORD_NOT_READY';
        validationError.details={keyword:String(trendMeta.keyword||keyword||topicTitle),reasons:downgradeReasons};
        throw validationError;
      }
      if(contentIsReady(candidate)){
        const draft=await saveReviewDraft({
          ...candidate,status:CONTENT_STATUS.REVIEW_REQUIRED,visibility:'private',
          manualCandidateApproval:trendMeta.manualApproved===true,
          manualApprovalKey:trendMeta.manualApprovalKey||null,
        });
        return {...draft,reviewDraftSaved:true};
      }
      return candidate;
    }

    if (contentIsReady(candidate) && isAutomaticPublicationReady(candidate)) {
      const saved = await saveContent(candidate);
      await setContentStatus(slug, { status:CONTENT_STATUS.PUBLISHED, publishedAt:saved?.publishedAt||new Date().toISOString(), retryCount:Number(previousStatus?.retryCount||0), lastError:null });
      memCache.set(slug,{data:saved,timestamp:Date.now()});
      return saved;
    }

    if (contentIsReady(candidate)) {
      const draft = await saveReviewDraft({ ...candidate, status:CONTENT_STATUS.REVIEW_REQUIRED, visibility:'private' });
      // 기존 공개 콘텐츠는 유지하고, 신규 초안만 검토 대기로 분리합니다.
      if (contentIsReady(stored) && stored.status === CONTENT_STATUS.PUBLISHED) {
        const reused = await saveContent({ ...stored, lastCheckedAt:new Date().toISOString(), reviewDraftAvailable:true });
        await setContentStatus(slug, { status:CONTENT_STATUS.REVIEW_REQUIRED, publishedAt:stored.publishedAt||null, retryCount:Number(previousStatus?.retryCount||0), lastError:(candidate.publicationReasons||[]).join(' / ')||'자동 검증 미통과' });
        memCache.set(slug,{data:reused,timestamp:Date.now()});
        return { ...draft, previousPublishedContent:true };
      }
      const savedDraft = await saveContent(draft);
      memCache.set(slug,{data:savedDraft,timestamp:Date.now()});
      return savedDraft;
    }

    const noSourceReason = (candidate.publicationReasons || []).join(' / ') || '검증 가능한 최신 출처 없음';
    if (contentIsReady(stored) && stored.status === CONTENT_STATUS.PUBLISHED) {
      const reused = await saveContent({ ...stored, lastCheckedAt:new Date().toISOString() });
      await setContentStatus(slug,{status:CONTENT_STATUS.PUBLISHED,publishedAt:stored.publishedAt||null,retryCount:Number(previousStatus?.retryCount||0),lastError:noSourceReason});
      memCache.set(slug,{data:reused,timestamp:Date.now()});
      return reused;
    }

    const pending={...candidate,displayTitle:topicTitle,searchQuery,status:CONTENT_STATUS.PENDING,visibility:'private'};
    await saveContent(pending);
    await setContentStatus(slug,{status:CONTENT_STATUS.PENDING,retryCount:Number(previousStatus?.retryCount||0),lastError:noSourceReason});
    memCache.set(slug,{data:pending,timestamp:Date.now()});
    return pending;
  } catch(error) {
    if(stageOnly&&fixedTop20Flow){
      const technicalReason=String(error?.message||'개별 상세 조사 실패').slice(0,240);
      if(error?.researchCheckpoint){
        try{
          await saveRequestedStage({
            ...error.researchCheckpoint,slug,
            candidateId:requestedCandidateId||error.researchCheckpoint.candidateId||null,
            publicationStageId:requestedStageId,
            researchCheckpoint:true,researchCheckpointCode:String(error?.code||'CONTENT_KEYWORD_NOT_READY'),
            researchCheckpointReason:technicalReason,
            stageDraft:true,stageDraftSavedAt:new Date().toISOString(),
          });
        }catch(checkpointError){
          console.warn(`[research checkpoint save warning] ${keyword}:`,checkpointError?.message||checkpointError);
        }
      }
      if(contentIsReady(stored)){
        const reusedStage=upgradeStoredStageContent(stored,keyword,trendMeta,preferredImageMeta,technicalReason);
        if(reusedStage&&isFixedKeywordFeedReady(reusedStage)){
          return saveRequestedStage({...reusedStage,slug,top30CompletionPolicy:'fixed_keyword_feed_v16_top20'});
        }
      }
      error.code=error.code||'CONTENT_KEYWORD_NOT_READY';
      throw error;
    }
    if(stageOnly){
      return {slug,keyword:trendMeta.keyword||keyword,displayTitle:topicTitle,searchQuery,category:trendMeta.category||'general',status:CONTENT_STATUS.FAILED,visibility:'private',hasContent:false,hasNews:false,card:{summary:'',why:'',points:[]},blog:'',qa:[],instagramCards:[],sourceItems:[],videos:[],image:preferredImageUrl,imageMeta:preferredImageMeta,generatedAt:new Date().toISOString(),lastError:error?.message||'',contentVersion:CONTENT_VERSION};
    }
    if(contentIsReady(stored)&&stored.status===CONTENT_STATUS.PUBLISHED){
      await setContentStatus(slug,{status:CONTENT_STATUS.PUBLISHED,retryCount:Number(previousStatus?.retryCount||0)+1,lastError:error?.message||'최신 자료 확인 실패'});
      return stored;
    }

    // v7.6.2: 뉴스·공식자료 조회 오류가 A/B등급 TOP의 기본 피드 생성을 막지 않게 합니다.
    // 확인되지 않은 사건 사실은 작성하지 않고 Ranking Engine의 관심도 신호만으로
    // 안전한 짧은 브리핑을 생성합니다.
    const emergencyGrade=String(trendMeta.rankingGrade||'').toUpperCase();
    const emergencyScore=Number(trendMeta.rankingScore||trendMeta.qualityScore||0);
    const emergencyTopEligible=isTopBriefEligible(trendMeta);
    if(false && ((['A','B'].includes(emergencyGrade)&&emergencyScore>=75)||emergencyTopEligible)){
      const categoryKey=trendMeta.category&&CATEGORIES[trendMeta.category]?trendMeta.category:'general';
      const fixedTop=buildNeutralTopTitleParts(String(trendMeta.keyword||keyword||''),[],String(trendMeta.topKeyword||trendMeta.keyword||keyword||''),String(trendMeta.topTopic||''));
      const brief=buildTrendBrief({
        topicTitle, fixedTop, category:CATEGORIES[categoryKey]||CATEGORIES.general,
        trendMeta:{...trendMeta,keyword:trendMeta.keyword||keyword,rankingGrade:emergencyGrade,rankingScore:emergencyScore,topEligible:emergencyTopEligible,category:categoryKey},
        newsBundle:{relatedNews:[],relatedContent:[],discoveryCount:0,maxAgeHours:NEWS_MAX_AGE_HOURS},
        imageMeta:preferredImageMeta,
      });
      const fallback={...brief,slug,searchQuery,rawKeyword:trendMeta.rawKeyword||trendMeta.keyword||keyword,eventKey:trendMeta.eventKey||null,category:categoryKey,contentVersion:CONTENT_VERSION,fingerprint:`source-independent-${Date.now()}`,sourceFetchWarning:String(error?.message||'출처 조회 실패').slice(0,240),generatedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString()};
      if(fallback.status===CONTENT_STATUS.PUBLISHED&&validateContent(fallback)){
        const saved=await saveContent(fallback);
        await setContentStatus(slug,{status:CONTENT_STATUS.PUBLISHED,publishedAt:saved?.publishedAt||new Date().toISOString(),retryCount:Number(previousStatus?.retryCount||0),lastError:null});
        memCache.set(slug,{data:saved,timestamp:Date.now()});
        return saved;
      }
    }

    await setContentStatus(slug,{status:CONTENT_STATUS.FAILED,retryCount:Number(previousStatus?.retryCount||0)+1,lastError:error?.message||'콘텐츠 생성 실패'});
    return {slug,keyword:trendMeta.keyword||keyword,displayTitle:topicTitle,searchQuery,category:trendMeta.category||'general',categoryLabel:CATEGORIES[trendMeta.category]?.label||CATEGORIES.general.label,status:CONTENT_STATUS.FAILED,visibility:'private',hasContent:false,hasNews:false,card:{summary:'콘텐츠 생성 중 문제가 발생했습니다.',why:'관리자에서 다시 생성을 시도할 수 있습니다.',points:[]},blog:'',qa:[],instagramCards:[],sourceItems:[],videos:[],image:preferredImageUrl,imageMeta:preferredImageMeta,generatedAt:new Date().toISOString(),lastError:error?.message||'',contentVersion:CONTENT_VERSION};
  } finally { await releaseLock(lockName); }
}

// ─── TOP 20 트렌드 수집 ──────────────────────────────
async function buildTrendSnapshot({ force=false, dryRun=false, persist=false, onStage=null }={}) {
  if (persist && !dryRun && !force && localTrendsCache && Date.now() - localTrendsCache.savedAt < LOCAL_TRENDS_TTL) {
    return { trends:localTrendsCache.data, report:null, persistence:null };
  }
  const cachedValue=await getCachedTrends({includeHidden:true});
  const cachedList=Array.isArray(cachedValue)?cachedValue:[];
  const updatedAt=await getTrendsUpdatedAt();
  const cacheAge=updatedAt?Date.now()-new Date(updatedAt).getTime():Infinity;
  const isCurrentCache=cachedList.length>0&&cachedList.every(item=>item?.cacheVersion===TREND_CACHE_VERSION);
  if(persist&&!dryRun&&!force&&isCurrentCache&&cacheAge>=0&&cacheAge<LOCAL_TRENDS_TTL){
    const normalized=cachedList.filter(item=>item.visibility!=='private'&&item.visibility!=='trashed').map((item,index)=>({...item,rank:index+1}));
    localTrendsCache={data:normalized,savedAt:Date.now()};
    return{trends:normalized,report:null,persistence:null};
  }

  const storedPreviousRanks=await getPreviousRanks();
  const normalizeRankKey=value=>String(value||'').toLowerCase().replace(/[^0-9a-zㄱ-힣]/g,'');
  const previousRanks={...storedPreviousRanks};const previousSlugs={};
  cachedList.forEach((item,index)=>{const rank=Number(item?.rank||index+1);[item?.trendKey,item?.rawKeyword,item?.eventKey,item?.keyword,item?.displayTitle,item?.searchQuery,item?.slug].filter(Boolean).forEach(key=>{previousRanks[key]=rank;previousRanks[normalizeRankKey(key)]=rank;if(item?.slug){previousSlugs[key]=item.slug;previousSlugs[normalizeRankKey(key)]=item.slug;}});});

  const rules=await getTrendRules();
  const generated=await generateTop30(fetchNaverTrendSignal,fetchYoutubeVideosFull,previousRanks,{
    fetchSearchTrendScores:fetchNaverSearchTrendScores,onStage,
    manualApprovals:Array.isArray(rules?.manualApprovals)?rules.manualApprovals:[],
    previousCandidates:cachedList,
  });
  const excluded=new Set((rules?.excludedKeywords||[]).map(value=>normalizeRankKey(value)));
  const normalizeCandidateRows=(rows=[])=>(Array.isArray(rows)?rows:[])
    .filter(item=>!excluded.has(normalizeRankKey(item.keyword))&&!excluded.has(normalizeRankKey(item.displayTitle)))
    .map((item,index)=>{
      const displayTitle=item.topTitle||item.displayTitle||item.keyword;
      const slug=item.slug
        ||previousSlugs[item.eventKey]||previousSlugs[normalizeRankKey(item.eventKey)]
        ||previousSlugs[item.trendKey]||previousSlugs[normalizeRankKey(item.trendKey)]
        ||previousSlugs[item.rawKeyword]||previousSlugs[normalizeRankKey(item.rawKeyword)]
        ||previousSlugs[item.keyword]||previousSlugs[normalizeRankKey(item.keyword)]
        ||toSlug(item.rawKeyword||item.keyword||displayTitle);
      const previousRank=previousRanks[item.eventKey]??previousRanks[normalizeRankKey(item.eventKey)]??previousRanks[item.trendKey]??previousRanks[normalizeRankKey(item.trendKey)]??previousRanks[item.keyword]??previousRanks[normalizeRankKey(item.keyword)]??previousRanks[slug]??null;
      const rank=index+1;
      const contentTier=rank<=10?'full':'standard';
      return {...item,contentTier,topEligible:true,rank,cacheVersion:TREND_CACHE_VERSION,slug,displayTitle,previousRank,rankChange:previousRank==null?null:Number(previousRank)-rank,badge:previousRank==null?'NEW':index<3?'HOT':Number(previousRank)-rank>=5?'UP':'',visibility:'private',thumbnail:item.thumbnail||null,thumbnailSource:item.thumbnailSource||null,imageMeta:item.imageMeta||null};
    });
  let trends=normalizeCandidateRows(generated?.trends||[]).slice(0,TOP_GENERATION_POOL_COUNT);
  const researchPool=normalizeCandidateRows(generated?.researchPool||generated?.trends||[]);
  const comparison=compareTrendSets(cachedList,trends);
  const refreshSummary=summarizeTrendRefresh(cachedList,trends);
  const allCandidates=generated?.candidates||[];
  const categoryCounts=trends.reduce((acc,item)=>{acc[item.category]=(acc[item.category]||0)+1;return acc;},{});
  const maxCategory=Math.max(0,...Object.values(categoryCounts));
  const warnings=[];
  if(trends.length<TOP_GENERATION_POOL_COUNT)warnings.push(`TOP20 공개를 위한 25개 생성 후보 풀이 부족합니다. 현재 ${trends.length}개입니다.`);
  if(allCandidates.length&&allCandidates.filter(item=>!item.mainVisible).length/allCandidates.length>=0.7)warnings.push('전체 후보의 70% 이상이 검증 기준에서 탈락했습니다.');
  if(trends.length&&maxCategory/trends.length>=0.6)warnings.push('하나의 카테고리가 TOP의 60% 이상을 차지합니다.');
  if(cachedList.length&&comparison.entered.length/Math.max(1,trends.length)>=0.8)warnings.push('직전 갱신 대비 TOP 구성이 80% 이상 변경됐습니다.');
  if(trends.filter(item=>Number(item.youtubeSupport||0)>0).length>=5)warnings.push('YouTube 보조 신호가 상위 후보 5개 이상에 포함됐습니다.');
  const report={createdAt:new Date().toISOString(),dryRun,refreshSummary,diagnostics:{...(generated?.diagnostics||{}),warnings,categoryCounts},comparison,candidates:allCandidates.map(row=>({...row,excludedByAdmin:excluded.has(normalizeRankKey(row.keyword)),manualApproved:row.manualApproved===true})),selected:trends.map(item=>({rank:item.rank,slug:item.slug,title:item.displayTitle,score:item.rankingScore,grade:item.rankingGrade,contentTier:item.contentTier}))};

  if(dryRun){
    await saveTrendCandidateReport(report,'preview');
    return{trends,researchPool,report,persistence:null};
  }

  // 실패한 새로고침에서 이전 TOP을 성공 결과처럼 반환하지 않습니다.
  // 기존 TOP은 서비스 가용성을 위해 Redis에 남겨 두지만, 갱신 작업은 명확히 실패 처리됩니다.
  try {
    assertFreshTrendSet(trends,generated?.diagnostics||{},cachedList);
  } catch (error) {
    await saveTrendCandidateReport({...report,refreshFailed:true,errorCode:error.code||'trend_refresh_failed',errorMessage:error.message},'latest');
    throw error;
  }

  if(!persist){
    return {trends,researchPool,report:{...report,refreshFailed:false,prepared:true},persistence:null};
  }
  trends=await attachUnsplashImages(trends.slice(0,TOP_GENERATION_POOL_COUNT));
  const persistence=await saveTrends(trends);
  if(!persistence?.verified)throw new Error('TOP Redis 저장 검증 결과가 없습니다.');

  const publicTrends=trends.filter(item=>item.visibility!=='private'&&item.visibility!=='trashed').map((item,index)=>({...item,rank:index+1}));
  const successReport={...report,refreshFailed:false,persistence,refreshSummary:summarizeTrendRefresh(cachedList,publicTrends)};
  await saveTrendCandidateReport(successReport,'latest');
  localTrendsCache={data:publicTrends,savedAt:Date.now()};
  return{trends:publicTrends,researchPool:publicTrends,report:successReport,persistence};
}

export async function getTrends({force=false,onStage=null}={}){
  return (await buildTrendSnapshot({force,dryRun:false,persist:false,onStage})).trends;
}

export async function prepareTrendRefresh({onStage=null}={}){
  return buildTrendSnapshot({force:true,dryRun:false,persist:false,onStage});
}

export async function commitTrendRefresh(){
  const error=new Error('v8에서는 TOP·피드·상세를 분리 저장할 수 없습니다. executeTrendRefreshRun의 원자적 공개 경로를 사용하세요.');
  error.code='DIRECT_TREND_COMMIT_DISABLED';
  throw error;
}

export async function refreshTrends(){
  const error=new Error('v8 직접 TOP 갱신은 비활성화됐습니다. QStash 원자적 갱신 작업을 사용하세요.');
  error.code='DIRECT_TREND_REFRESH_DISABLED';
  throw error;
}

export async function previewTrends(){
  return buildTrendSnapshot({force:true,dryRun:true,persist:false});
}

