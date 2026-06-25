import crypto from 'crypto';
import { cleanText, canonicalizeUrl, domainFromUrl } from './contentPolicy.js';
import { isTopBriefEligible } from './topContentPolicy.js';
import { sanitizePublicText } from './publicCopy.js';
import { contentLengthRange } from './contentGrade.js';
import { FEED_DETAIL_MIN_CHARS, FEED_DETAIL_RECOMMENDED_MAX_CHARS } from './feedLengthPolicy.js';

const RELATED_TYPES = new Set(['news','blog','cafe','social','newsletter','video','review','reference']);

function hash(value='') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function formatDate(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return '';
  return new Date(time).toLocaleDateString('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' });
}

function topicLabel(topicTitle='') {
  return cleanText(topicTitle).replace(/[·|｜].*$/, '').replace(/\s+/g,' ').trim().slice(0,36) || '해당 주제';
}

function relatedTitleTokens(value='') {
  const aliases={새로운:'신작',새:'신작',캐스팅:'출연',합류:'출연',임신소식:'임신',임신사실:'임신',공개:'발표',확정:'확정'};
  return cleanText(value).toLowerCase().replace(/\s+-\s+[^-]{1,40}$/,'').replace(/[^0-9a-zㄱ-힣\s]/g,' ').split(/\s+/)
    .filter(token=>token.length>1)
    .filter(token=>!['속보','단독','종합','영상','포토','뉴스','관련','공식','오늘','기자','직접','깜짝'].includes(token))
    .map(token=>aliases[token]||token);
}

function relatedTitleSimilarity(a='',b='') {
  const left=new Set(relatedTitleTokens(a)),right=new Set(relatedTitleTokens(b));
  if(!left.size||!right.size)return 0;
  const common=[...left].filter(token=>right.has(token)||[...right].some(value=>value.includes(token)||token.includes(value))).length;
  return common/Math.max(1,Math.min(left.size,right.size));
}

function isDuplicateRelated(existing=[],candidate={}) {
  const candidateUrl=canonicalizeUrl(candidate.link||'');
  const candidateTitle=cleanText(candidate.displayTitle||candidate.title||candidate.transientOriginalTitle||'');
  return existing.some(row=>{
    const rowUrl=canonicalizeUrl(row.link||'');
    const rowTitle=cleanText(row.displayTitle||row.title||row.transientOriginalTitle||'');
    if(candidateUrl&&rowUrl&&candidateUrl===rowUrl)return true;
    if(candidateTitle&&rowTitle&&relatedTitleSimilarity(candidateTitle,rowTitle)>=0.68)return true;
    return false;
  });
}

export function neutralRelatedLabel(topicTitle='', type='news') {
  const topic = topicLabel(topicTitle);
  const labels = {
    news: `${topic} 관련 보도`,
    blog: `${topic} 관련 블로그 글`,
    cafe: `${topic} 관련 커뮤니티 글`,
    social: `${topic} 관련 공식·공개 게시물`,
    newsletter: `${topic} 관련 뉴스레터`,
    video: `${topic} 관련 영상`,
    review: `${topic} 관련 사용 후기`,
    reference: `${topic} 관련 참고 자료`,
  };
  return labels[type] || labels.reference;
}

export function normalizeRelatedLink(item={}, topicTitle='', forcedType='') {
  const link = canonicalizeUrl(item.link || item.url || item.canonicalUrl || '');
  if (!/^https?:\/\//i.test(link)) return null;
  const type = RELATED_TYPES.has(forcedType || item.type) ? (forcedType || item.type) : 'reference';
  const source = cleanText(item.source || item.publisher || item.channel || domainFromUrl(link) || '외부 출처').slice(0,80);
  const originalTitle = cleanText(item.originalTitle || item.title || item.headline || '');
  const displayTitle=cleanText(item.displayTitle||originalTitle||item.label||neutralRelatedLabel(topicTitle,type)).slice(0,140);
  return {
    type,
    source,
    link,
    domain: domainFromUrl(link),
    publishedAt: item.publishedAt || item.datePublished || null,
    date: item.date || formatDate(item.publishedAt || item.datePublished),
    title:displayTitle,
    displayTitle,
    label:displayTitle,
    titleHash: originalTitle ? hash(originalTitle).slice(0,24) : null,
    // 생성 직후 유사도 검사에만 사용하며 Redis 저장 전 제거합니다.
    transientOriginalTitle: originalTitle || null,
  };
}

export function buildRelatedNews(discoveryItems=[], topicTitle='') {
  const seen = new Set();
  const result=[];
  for (const item of Array.isArray(discoveryItems) ? discoveryItems : []) {
    const row = normalizeRelatedLink(item, topicTitle, 'news');
    if (!row || seen.has(row.link) || isDuplicateRelated(result,row)) continue;
    seen.add(row.link);
    result.push(row);
    if (result.length >= 3) break;
  }
  return result;
}

export function buildRelatedContent(items=[], topicTitle='') {
  const seen = new Set();
  const result=[];
  for (const item of Array.isArray(items) ? items : []) {
    const row = normalizeRelatedLink(item, topicTitle, item?.type || 'reference');
    if (!row || seen.has(row.link) || isDuplicateRelated(result,row)) continue;
    seen.add(row.link);
    result.push(row);
    if (result.length >= 3) break;
  }
  return result;
}

export const GENERATION_POLICY_VERSION = 2;

export function generationPolicyFor(mode='brief') {
  return {
    version:GENERATION_POLICY_VERSION,
    mode,
    briefRequiresSources:false,
    detailedRequiresStructuredEvidence:true,
    newsRole:'related_link_and_cross_check',
    copyrightGate:'expression_similarity_only',
    externalTextReuseAllowed:false,
    researchPipeline:'ai_planned_multisource',
    relatedMediaRole:'link_only',
  };
}

export function hasDetailedEvidence({ evidenceSources=[], factLedger={} }={}) {
  const usable=(Array.isArray(evidenceSources)?evidenceSources:[])
    .filter(item => item && (item.evidenceUsable ?? item.contentUsable ?? true));
  const facts=Array.isArray(factLedger?.facts)?factLedger.facts:[];
  return usable.length>0 && facts.length>0;
}

export function buildStructuredFactPrompt(ledger={}) {
  const sources=(Array.isArray(ledger.sources)?ledger.sources:[]).map(source =>
    `[${source.id}] ${cleanText(source.source||source.domain||'근거 자료').slice(0,80)} | ${source.publishedAt||''} | ${canonicalizeUrl(source.url||'')}`
  );
  const facts=(Array.isArray(ledger.facts)?ledger.facts:[]).map(fact => {
    const values=(Array.isArray(fact.values)?fact.values:[]).map(value=>cleanText(value.raw||`${value.value||''}${value.unit||''}`)).filter(Boolean).join(', ');
    const parts=[
      `[${fact.id}]`,
      `주체=${cleanText(fact.subject||'해당 주제').slice(0,60)}`,
      `유형=${cleanText(fact.type||'state_change')}`,
      fact.predicate?`행동=${cleanText(fact.predicate).slice(0,40)}`:'',
      fact.eventAt?`사건일=${fact.eventAt}`:'',
      fact.publishedAt?`발행일=${fact.publishedAt}`:'',
      `검증=${cleanText(fact.verificationLevel||fact.status||'single_source')}`,
      values?`수치=${values}`:'',
      `확인내용=${cleanText(fact.text||fact.claim||'').slice(0,220)}`,
      `근거=${(fact.sourceIds||[]).join(',')}`,
    ].filter(Boolean);
    return parts.join(' | ');
  });
  return [...sources, '', '[구조화된 확인 사실]', ...facts].join('\n').trim();
}

export function buildDiscoverySignals(trendMeta={}, newsBundle={}) {
  const rankingScore = Number(trendMeta.rankingScore || trendMeta.qualityScore || 0);
  const rankingGrade = String(trendMeta.rankingGrade || '').toUpperCase();
  const newsCount = Number(newsBundle.discoveryCount || newsBundle.relatedNews?.length || 0);
  const signals = [];
  if (rankingScore > 0) signals.push({ type:'ranking', label:'STELLATE 관심도', value:Math.round(rankingScore) });
  if (rankingGrade) signals.push({ type:'grade', label:'검증 등급', value:rankingGrade });
  if (newsCount > 0) signals.push({ type:'news_mentions', label:'최근 관련 보도', value:newsCount });
  if (Number(trendMeta.searchGrowth || trendMeta.datalabGrowth || 0) !== 0) signals.push({ type:'search_growth', label:'검색 관심 변화', value:Number(trendMeta.searchGrowth || trendMeta.datalabGrowth) });
  return signals;
}

function signalSentence(signals=[], relatedNewsCount=0) {
  const parts=[];
  if (signals.some(row=>row.type==='search_growth')) parts.push('검색 관심 변화가 확인됐습니다');
  if (relatedNewsCount) parts.push(`최근 관련 보도 ${relatedNewsCount}건을 확인했습니다`);
  return parts.length ? parts.join(' · ') : '해당 주제에 대한 최근 관심 흐름이 확인됐습니다';
}

export function buildTrendBrief({ topicTitle='', fixedTop={}, category={}, trendMeta={}, newsBundle={}, imageMeta=null }={}) {
  const relatedNews = Array.isArray(newsBundle.relatedNews) ? newsBundle.relatedNews : [];
  const relatedContent = Array.isArray(newsBundle.relatedContent) ? newsBundle.relatedContent : buildRelatedContent(trendMeta.relatedLinks || trendMeta.relatedContent || [], topicTitle);
  const relatedVideos = Array.isArray(newsBundle.relatedVideos || newsBundle.videos) ? (newsBundle.relatedVideos || newsBundle.videos) : [];
  const signals = buildDiscoverySignals(trendMeta, newsBundle);
  const keyword=topicLabel(topicTitle);
  const topTopic='관련 관심 증가';
  const topTitle=`${keyword} · ${topTopic}`.slice(0,64);
  const signalText = signalSentence(signals, relatedNews.length);
  const summary = `${keyword}와 관련된 검색·콘텐츠 관심이 증가하고 있습니다. 구체적인 상승 배경은 아직 하나의 사건으로 확인되지 않았습니다.`.slice(0,180);
  const why = '공식 발표나 여러 자료에서 공통으로 확인되는 사건이 나타나면 피드 내용을 갱신합니다.';
  const points = [
    signalText,
    '관심 상승의 원인은 아직 하나의 사건으로 확정되지 않았습니다.',
    relatedNews.length ? `연결 가능한 관련 자료 ${relatedNews.length}건이 있습니다.` : '현재 확인 가능한 연결 자료가 제한적입니다.',
  ];
  const blog = [
    `## ${keyword} 알아보기\n${keyword}는 현재 검색과 콘텐츠에서 관심이 늘고 있는 주제입니다. 확인되지 않은 배경이나 사건을 임의로 덧붙이지 않습니다.`,
    `## 지금 확인된 관심 흐름\n${signalText}. 관심이 증가한 구체적인 원인은 아직 하나의 사건으로 확인되지 않았습니다.`,
    `## STELLATE 인사이트\n현재는 관심 증가 자체만 확인된 단계입니다. 새로운 공식 발표나 여러 출처에서 공통 사건이 확인되기 전까지 원인을 단정하지 않는 것이 적절합니다.`,
  ].join('\n\n');
  const sensitive=/사망|사고|수사|혐의|질병|투자|주가|열애|이혼|선거|대통령|국회의원/.test(`${topicTitle} ${topTitle}`) || trendMeta.category==='politics';
  return {
    keyword:trendMeta.keyword||keyword,
    topKeyword:keyword,topTopic,topTitle,topTitleSource:'interest_signal_template',displayTitle:topTitle,
    titleStatus:'ready',titleReady:true,titleSource:'interest_signal_template',titleValidationReasons:[],
    feedTitle:topTitle,feedHeadline:topTopic,detailTitle:topTitle,
    category:trendMeta.category||'general',categoryLabel:category.label||'일반',categoryColor:category.color,heroBg:category.heroBg,titleColor:category.titleColor,metaColor:category.metaColor,
    candidateType:'interest',causeStatus:'unconfirmed',currentStatus:'관심 증가 원인 확인 중',
    contentGrade:'D',contentScore:0,contentMode:'graded_detail',contentType:'detailed',hasContent:true,hasNews:relatedNews.length>0,topEligible:true,
    generationPolicy:generationPolicyFor('brief'),sourceFetchRequired:false,
    blog:sanitizePublicText(blog),claimMap:[],card:{previewLabel:'요약 정보',infoLine:`${sanitizePublicText(keyword)}에 대한 정보`,summaryLabel:'요약 정보',pointsLabel:'주요 내용',ctaLabel:'상세 정보 피드 보기',feedTitle:sanitizePublicText(topTitle),detailTitle:sanitizePublicText(topTitle),summary:sanitizePublicText(summary),why:sanitizePublicText(why),listSummary:sanitizePublicText(summary).slice(0,100),points:points.map(sanitizePublicText),source:'feed_summary_v2'},qa:[],instagramCards:[],
    image:imageMeta?.imageUrl||null,imageMeta,imageSource:imageMeta?.source||null,
    evidenceSources:[],sourceItems:[],relatedNews,relatedContent,relatedVideos,videos:relatedVideos,discoverySignals:signals,
    factLedger:{version:3,sources:[],facts:[],confirmedFacts:[],uncertainties:['관심 증가 원인은 아직 확인되지 않았습니다.'],conflicts:[]},
    trustSummary:{officialSources:0,evidenceSources:0,relatedNews:relatedNews.length,relatedContent:relatedContent.length,relatedVideos:relatedVideos.length,lastVerifiedAt:new Date().toISOString()},
    sourceNewestAt:relatedNews[0]?.publishedAt||null,sourceWindowHours:Number(newsBundle.maxAgeHours||36),
    sourceSignature:makeContentSignalSignature({relatedNews,relatedContent,signals}),
    qualityScore:70,contentQualityScore:70,sourceQualityScore:0,groundingScore:0,copyrightScore:100,copyrightRisk:{passed:true,score:100,maxSimilarity:0,longPhraseMatches:0,riskyPairs:[]},
    publicationDecision:{publishable:true,status:'published',visibility:'published',reviewRequired:false,reasons:[],sensitive,sourceStats:{usable:0,official:0,independentDomains:0,conflicts:0}},
    status:'published',visibility:'published',reviewRequired:false,publicationReasons:[],
    adEligible:false,riskLevel:sensitive?'sensitive':'normal',aiStatus:'not_required',aiError:null,tokenUsage:{input:0,output:0},generatedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString(),
  };
}

export function validateDetailedTierShape(content={}) {
  const fullTier=String(content?.contentTier||'full')==='full';
  const grade=String(content?.contentGrade||'B').toUpperCase();
  const length=String(content?.blog||'').length;
  const range=contentLengthRange(grade);
  // 생성 편차는 허용하되 등급별 최소 정보량과 과도한 장문만 제어합니다.
  const enforceFlexibleFeedLength=Number(content?.contentVersion||0)>=134||['v8044-2000-3000','v8045-min1000-target5000','v8046-min1000-target5000-recovery'].includes(String(content?.feedDetailLengthPolicy||''));
  const legacyMinimum=grade==='A'?820:grade==='B'?520:grade==='C'?240:120;
  const minimumLength=enforceFlexibleFeedLength?FEED_DETAIL_MIN_CHARS:legacyMinimum;
  const maximumLength=grade==='A'?2400:grade==='B'?1400:grade==='C'?900:900;
  if(length<minimumLength||(!enforceFlexibleFeedLength&&length>maximumLength))return false;
  const cards=Array.isArray(content?.instagramCards)?content.instagramCards:[];
  if(grade==='D'||grade==='C')return cards.length===0;
  if(fullTier&&grade==='A')return cards.length>=4&&cards.length<=6&&cards.at(-1)?.type==='promo';
  return cards.length===0||((grade==='B')&&cards.length>=4&&cards.length<=6&&cards.at(-1)?.type==='promo');
}

export function validateTrendBriefContent(content={}) {
  if (!contentIsReady(content)) return false;
  if (String(content.status || '') !== 'published') return false;
  if (String(content.visibility || '') !== 'published') return false;
  if (!content.card?.summary || cleanText(content.card.summary).length < 25) return false;
  if (!Array.isArray(content.card?.points) || content.card.points.length < 3) return false;
  const length=String(content.blog || '').length;
  const enforceFlexibleFeedLength=Number(content?.contentVersion||0)>=134||['v8044-2000-3000','v8045-min1000-target5000','v8046-min1000-target5000-recovery'].includes(String(content?.feedDetailLengthPolicy||''));
  if (enforceFlexibleFeedLength&&length < FEED_DETAIL_MIN_CHARS) return false;
  if (!enforceFlexibleFeedLength&&(length < 160 || length > 1600)) return false;
  if (!content.publicationDecision?.publishable) return false;
  if (content.copyrightRisk?.passed === false) return false;
  return true;
}

export function makeContentSignalSignature({evidenceSources=[],relatedNews=[],relatedContent=[],relatedVideos=[],signals=[]}={}) {
  const videoRows=(Array.isArray(relatedVideos)?relatedVideos:[]).map(item=>({link:item.url||item.link||'',publishedAt:item.publishedAt||'',titleHash:item.id||'',source:item.channel||'YouTube'}));
  const rows=[...evidenceSources,...relatedNews,...relatedContent,...videoRows].map(item=>`${canonicalizeUrl(item.link||item.url||'')}|${item.publishedAt||''}|${item.titleHash||''}|${item.source||''}`).sort();
  rows.push(...signals.map(row=>`${row.type}|${row.value}`).sort());
  return hash(rows.join('||'));
}

export function sanitizeExternalLinksForStorage(items=[]) {
  return (Array.isArray(items)?items:[]).map(({transientOriginalTitle,description,snippet,content,originalTitle,...safe})=>({
    ...safe,
    title:cleanText(safe.title||safe.displayTitle||safe.label||'').slice(0,140),
    displayTitle:cleanText(safe.displayTitle||safe.title||safe.label||'').slice(0,140),
    label:cleanText(safe.displayTitle||safe.title||safe.label||'').slice(0,140),
  }));
}

export function sanitizeEvidenceForStorage(items=[], topicTitle='') {
  const seen=new Set();
  const output=[];
  for(const item of Array.isArray(items)?items:[]){
    const link=canonicalizeUrl(item.canonicalUrl||item.link||item.url||'');
    if(!link||seen.has(link))continue;
    seen.add(link);
    const title=cleanText(item.title||item.displayTitle||item.label||item.displayLabel||neutralRelatedLabel(topicTitle,'reference')).slice(0,140);
    output.push({
      source:cleanText(item.source||item.publisher||item.domain||'확인 자료').slice(0,80),
      title,
      label:title,
      link,
      domain:item.domain||domainFromUrl(link),
      sourceType:item.sourceType||'reference',rightsBasis:item.rightsBasis||null,publishedAt:item.publishedAt||null,modifiedAt:item.modifiedAt||null,date:item.date||formatDate(item.publishedAt),
    });
    if(output.length>=8)break;
  }
  return output;
}

function storageFactText(fact={}) {
  // v8.0.29: 실제 사실문을 일반 문구로 치환하지 않습니다.
  // 이 필드는 재생성·복구의 원본 근거이므로 의미와 수치·날짜를 그대로 보존해야 합니다.
  return cleanText(fact.text||fact.claim||'').slice(0,320);
}

export function sanitizeLedgerForStorage(ledger={}) {
  const rawSources=Array.isArray(ledger.sources)?ledger.sources:[];
  const sourceIdMap=new Map();
  const sourceKeyMap=new Map();
  const sources=[];
  for(const source of rawSources){
    const originalId=String(source?.id||`S${sources.length+1}`);
    const url=canonicalizeUrl(source?.url||source?.link||source?.canonicalUrl||'');
    const key=url||`${cleanText(source?.source||source?.publisher||source?.domain||'')}|${cleanText(source?.title||'')}`.toLowerCase();
    if(!key)continue;
    let targetId=sourceKeyMap.get(key);
    if(!targetId){
      targetId=`S${sources.length+1}`;
      sourceKeyMap.set(key,targetId);
      sources.push({
        id:targetId,
        title:cleanText(source?.title||source?.source||source?.publisher||source?.domain||'확인 자료').slice(0,160),
        source:cleanText(source?.source||source?.publisher||source?.domain||'확인 자료').slice(0,80),
        url,
        domain:source?.domain||domainFromUrl(url),
        sourceType:source?.sourceType||null,
        rightsBasis:source?.rightsBasis||null,
        publishedAt:source?.publishedAt||null,
        modifiedAt:source?.modifiedAt||null,
        scope:source?.scope||'issue',
      });
    }
    sourceIdMap.set(originalId,targetId);
  }
  const facts=(Array.isArray(ledger.facts)?ledger.facts:[]).map(fact=>({
    id:fact.id,type:fact.type,scope:fact.scope||'issue',subject:cleanText(fact.subject||'해당 주제').slice(0,60),predicate:fact.predicate||'',values:fact.values||[],eventAt:fact.eventAt||null,publishedAt:fact.publishedAt||null,modifiedAt:fact.modifiedAt||null,
    sourceIds:[...new Set((Array.isArray(fact.sourceIds)?fact.sourceIds:[]).map(id=>sourceIdMap.get(String(id))).filter(Boolean))],
    sourceType:fact.sourceType||null,status:fact.status,confidence:fact.confidence,verificationLevel:fact.verificationLevel||null,
    text:storageFactText(fact),
  })).filter(fact=>fact.id&&fact.text&&fact.sourceIds.length>0);
  const validFactIds=new Set(facts.map(fact=>fact.id));
  return {
    version:4,
    sources,
    facts,
    confirmedFacts:(ledger.confirmedFacts||[]).filter(id=>validFactIds.has(id)),
    uncertainties:ledger.uncertainties||[],
    conflicts:(ledger.conflicts||[]).map(row=>({...row,factIds:(row.factIds||[]).filter(id=>validFactIds.has(id))})).filter(row=>(row.factIds||[]).length>=2),
  };
}

export function compactCopyrightRisk(risk={}) {
  return {
    score:Number(risk.score ?? 100),maxSimilarity:Number(risk.maxSimilarity || 0),longPhraseMatches:Number(risk.longPhraseMatches || 0),passed:risk.passed !== false,
    riskyPairs:(Array.isArray(risk.riskyPairs)?risk.riskyPairs:[]).map(row=>({similarity:Number(row.similarity||0),longMatch:Boolean(row.longMatch)})).slice(0,10),
  };
}

export function contentIsReady(content={}) {
  return Boolean(content?.hasContent ?? content?.hasNews);
}
