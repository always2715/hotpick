import { cleanText, canonicalizeUrl, domainFromUrl, normalizeSourceItem, buildFactLedger, isSourceRelevantToTopic } from './contentPolicy.js';
import { buildRelatedNews, buildRelatedContent, buildStructuredFactPrompt } from './contentArchitecture.js';
import { splitOnlineReactionInputs, buildOnlineReactionRankingSignal, onlineReactionInputPolicy } from './onlineReactionPipeline.js';

const TOPIC_RULES = [
  { type:'weather', pattern:/날씨|기온|강수|비\b|눈\b|폭염|한파|태풍|미세먼지|기상|호우|폭설/ },
  { type:'sports', pattern:/축구|야구|농구|배구|테니스|골프|경기|선수|감독|리그|월드컵|올림픽|KBO|K리그|EPL|MLB|NBA/ },
  { type:'service_status', pattern:/장애|먹통|접속\s*불가|서비스\s*중단|복구|오류|상태\s*페이지/ },
  { type:'product', pattern:/출시|신제품|업데이트|버전|릴리스|기능\s*추가|사전\s*예약/ },
  { type:'company', pattern:/실적|매출|영업이익|순이익|공시|IR|인수|합병|수주|투자/ },
  { type:'public_policy', pattern:/정책|법안|규제|시행|개정|지원금|정부|기관|공공/ },
  { type:'entertainment', pattern:/영화|드라마|예능|앨범|신곡|컴백|공연|콘서트|방송|넷플릭스|디즈니\+|티빙/ },
  { type:'security', pattern:/해킹|랜섬웨어|취약점|보안|개인정보\s*유출|침해/ },
];

const TYPE_CONFIG = {
  weather:{ officialKinds:['structured_weather','weather_alert'], searchTerms:['예보','특보'], detailedMinFacts:1 },
  sports:{ officialKinds:['official_result','official_schedule'], searchTerms:['공식 결과','공식 일정'], detailedMinFacts:1 },
  service_status:{ officialKinds:['status_page','official_notice'], searchTerms:['상태 페이지','장애 공지'], detailedMinFacts:1 },
  product:{ officialKinds:['official_product','release_notes','newsroom'], searchTerms:['공식 페이지','릴리스 노트'], detailedMinFacts:1 },
  company:{ officialKinds:['disclosure','ir','newsroom'], searchTerms:['공시','IR'], detailedMinFacts:1 },
  public_policy:{ officialKinds:['government_notice','public_data'], searchTerms:['기관 공지','정책 자료'], detailedMinFacts:1 },
  entertainment:{ officialKinds:['agency_notice','broadcaster','ott'], searchTerms:['공식 발표','공식 일정'], detailedMinFacts:1 },
  security:{ officialKinds:['security_advisory','incident_notice'], searchTerms:['보안 권고','공식 공지'], detailedMinFacts:1 },
  general:{ officialKinds:['official_notice','public_data'], searchTerms:['공식 발표','공식 자료'], detailedMinFacts:1 },
};

export function inferResearchTopicType(topic='', trendMeta={}) {
  const text=cleanText(`${topic} ${trendMeta.topTopic||''} ${trendMeta.category||''}`);
  return TOPIC_RULES.find(rule=>rule.pattern.test(text))?.type || 'general';
}

export function buildDeterministicResearchPlan(topic='', trendMeta={}) {
  const topicType=inferResearchTopicType(topic,trendMeta);
  const config=TYPE_CONFIG[topicType]||TYPE_CONFIG.general;
  const entity=cleanText(trendMeta.topKeyword||trendMeta.keyword||topic).slice(0,60);
  return {
    version:1,
    topicType,
    entity,
    eventType:cleanText(trendMeta.eventType||'').slice(0,40),
    queries:[
      cleanText(topic).slice(0,80),
      cleanText(`${entity} 기본정보`).slice(0,80),
      ...config.searchTerms.map(term=>cleanText(`${entity} ${term}`).slice(0,80)),
    ].filter(Boolean).filter((value,index,rows)=>rows.indexOf(value)===index).slice(0,4),
    profileQueries:[cleanText(`${entity} 기본정보`).slice(0,80),cleanText(`${entity} 공식 프로필`).slice(0,80)].filter(Boolean),
    officialKinds:config.officialKinds,
    collectNews:true,
    collectVideos:true,
    detailedMinFacts:config.detailedMinFacts,
    planner:'deterministic',
  };
}

export function normalizeResearchPlan(plan={}, topic='', trendMeta={}) {
  const fallback=buildDeterministicResearchPlan(topic,trendMeta);
  const allowed=new Set(Object.keys(TYPE_CONFIG));
  const topicType=allowed.has(plan.topicType)?plan.topicType:fallback.topicType;
  return {
    ...fallback,
    topicType,
    entity:cleanText(plan.entity||fallback.entity).slice(0,60),
    eventType:cleanText(plan.eventType||fallback.eventType).slice(0,40),
    queries:(Array.isArray(plan.queries)?plan.queries:fallback.queries).map(value=>cleanText(value).slice(0,80)).filter(Boolean).slice(0,4),
    profileQueries:(Array.isArray(plan.profileQueries)?plan.profileQueries:fallback.profileQueries).map(value=>cleanText(value).slice(0,80)).filter(Boolean).slice(0,2),
    officialKinds:Array.isArray(plan.officialKinds)?plan.officialKinds.map(value=>cleanText(value).slice(0,40)).filter(Boolean).slice(0,6):fallback.officialKinds,
    collectNews:plan.collectNews!==false,
    collectVideos:plan.collectVideos!==false,
    detailedMinFacts:Math.max(1,Math.min(6,Number(plan.detailedMinFacts||fallback.detailedMinFacts))),
    planner:plan.planner||fallback.planner,
  };
}

function isWithinResearchWindow(value, hours=36) {
  const time=new Date(value||0).getTime();
  if(!Number.isFinite(time)||time<=0)return false;
  const age=Date.now()-time;
  return age>=0&&age<=hours*60*60*1000;
}

function videoTopicTokens(value=''){
  return cleanText(value).toLowerCase().replace(/[^0-9a-z가-힣\s]/g,' ').split(/\s+/)
    .filter(token=>token.length>1)
    .filter(token=>!['관련','공식','최신','영상','뉴스','이슈'].includes(token));
}

export function normalizeRelatedVideos(videos=[], topicTitle='') {
  const seen=new Set();
  const topicTokens=videoTopicTokens(topicTitle);
  const compactTopic=cleanText(topicTitle).toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
  return (Array.isArray(videos)?videos:[]).map(item=>({
    id:String(item.id||''),
    title:cleanText(item.title).slice(0,140),
    channel:cleanText(item.channel||item.source||'YouTube').slice(0,80),
    thumbnail:item.thumbnail||null,
    publishedAt:item.publishedAt||null,
    url:canonicalizeUrl(item.url||item.link||''),
    viewCount:Number(item.viewCount||0),
    channelTrusted:item.channelTrusted===true||item.verifiedOfficial===true,
    relevanceScore:Number(item.relevanceScore||0),
  })).filter(item=>{
    if(!item.id||!item.title||!/^https:\/\/www\.youtube\.com\/watch\?/i.test(item.url))return false;
    const maxHours=item.channelTrusted?24*30:24*14;
    if(!isWithinResearchWindow(item.publishedAt,maxHours))return false;
    const title=item.title.toLowerCase();
    const compactTitle=title.replace(/[^0-9a-z가-힣]/g,'');
    const matched=topicTokens.filter(token=>title.includes(token)).length;
    const directlyRelevant=(compactTopic.length>=2&&compactTitle.includes(compactTopic))||(topicTokens.length>0&&matched===topicTokens.length);
    if(!directlyRelevant)return false;
    const channelCompact=item.channel.toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
    const topicOwned=compactTopic.length>=2&&channelCompact.includes(compactTopic);
    if(!item.channelTrusted&&!topicOwned&&item.relevanceScore<60)return false;
    if(seen.has(item.id))return false;seen.add(item.id);return true;
  }).sort((a,b)=>Number(b.channelTrusted)-Number(a.channelTrusted)||b.relevanceScore-a.relevanceScore||b.viewCount-a.viewCount).slice(0,2);
}

export function makeStructuredApiSource({source='공개 데이터 API',link='',sourceType='authorized',rightsBasis='structured_api',facts=[],publishedAt=null,metadata={}}={}) {
  const sentences=(Array.isArray(facts)?facts:[]).map(cleanText).filter(Boolean).slice(0,12);
  if(!link||!sentences.length)return null;
  return normalizeSourceItem({
    source,
    title:`${source} 구조화 데이터`,
    description:sentences.join('. '),
    link,
    sourceType,
    rightsBasis,
    discoveryUsable:true,
    evidenceUsable:true,
    bodyFetchAllowed:false,
    textReuseAllowed:false,
    provider:'structured_api',
    publishedAt:publishedAt||new Date().toISOString(),
    metadata,
  });
}

function dedupeSources(items=[]) {
  const seen=new Set();
  return (Array.isArray(items)?items:[]).map(normalizeSourceItem).filter(item=>{
    const key=canonicalizeUrl(item.canonicalUrl||item.link||'')||`${item.source}|${item.title}`;
    if(!key||seen.has(key))return false;seen.add(key);return true;
  });
}


function relatedTokens(value='') {
  const aliases={새로운:'신작',새:'신작',캐스팅:'출연',합류:'출연',임신소식:'임신',임신사실:'임신',공개:'발표'};
  return cleanText(value).toLowerCase().replace(/[^0-9a-zㄱ-힣\s]/g,' ').split(/\s+/)
    .filter(token=>token.length>1)
    .filter(token=>!['속보','단독','종합','영상','포토','뉴스','관련','공식','기자','직접','깜짝'].includes(token))
    .map(token=>aliases[token]||token);
}

function sameRelatedStory(a={},b={}) {
  const leftUrl=canonicalizeUrl(a.link||a.url||''),rightUrl=canonicalizeUrl(b.link||b.url||'');
  if(leftUrl&&rightUrl&&leftUrl===rightUrl)return true;
  const left=new Set(relatedTokens(a.displayTitle||a.title||a.label||''));
  const right=new Set(relatedTokens(b.displayTitle||b.title||b.label||''));
  if(!left.size||!right.size)return false;
  const common=[...left].filter(token=>right.has(token)||[...right].some(value=>value.includes(token)||token.includes(value))).length;
  return common/Math.max(1,Math.min(left.size,right.size))>=0.68;
}

export function mergeResearchBundle({topicTitle='',plan={},newsBundle={},officialEvidence=[],structuredEvidence=[],relatedContent=[],relatedVideos=[],diagnostics={}}={}) {
  const evidenceSources=dedupeSources([
    ...(Array.isArray(newsBundle.evidenceSources)?newsBundle.evidenceSources:newsBundle.items||[]),
    ...(Array.isArray(officialEvidence)?officialEvidence:[]),
    ...(Array.isArray(structuredEvidence)?structuredEvidence:[]),
  ])
    .filter(item=>item.evidenceUsable??item.contentUsable)
    .filter(item=>isSourceRelevantToTopic(item,topicTitle))
    .filter(item=>isWithinResearchWindow(item.publishedAt||item.modifiedAt,36))
    .slice(0,12);
  const discoveryItems=Array.isArray(newsBundle.relatedNews)?newsBundle.relatedNews:buildRelatedNews(newsBundle.discoveryItems||[],topicTitle);
  const normalizedNews=buildRelatedNews(discoveryItems.filter(item=>isWithinResearchWindow(item.publishedAt||item.modifiedAt,36)).map(item=>({
    ...item,
    title:item.transientOriginalTitle||item.title||item.label,
  })),topicTitle);
  const combinedRelated=[
    ...(Array.isArray(newsBundle.relatedContent)?newsBundle.relatedContent:[]),
    ...(Array.isArray(relatedContent)?relatedContent:[]),
  ];
  const {online:onlineInputs,factual:factualRelated}=splitOnlineReactionInputs(combinedRelated);
  const normalizedContent=buildRelatedContent(factualRelated,topicTitle)
    .filter(item=>!normalizedNews.some(news=>sameRelatedStory(news,item)))
    .slice(0,3);
  const videos=normalizeRelatedVideos(relatedVideos,topicTitle);
  const factLedger=buildFactLedger(evidenceSources,{topicTitle});
  return {
    items:evidenceSources,
    evidenceSources,
    relatedNews:normalizedNews,
    relatedContent:normalizedContent,
    onlineReactionRanking:buildOnlineReactionRankingSignal(onlineInputs),
    onlineReactionInput:onlineReactionInputPolicy(),
    relatedVideos:videos,
    videos,
    discoveryCount:Number(newsBundle.discoveryCount||normalizedNews.length),
    rejectionStats:newsBundle.rejectionStats||{},
    rejectionSamples:newsBundle.rejectionSamples||[],
    sourcePolicy:'independent_keyword_ai_research_36h',
    sourceWindowPolicy:'strict_published_within_36h',
    researchPlan:plan,
    researchDiagnostics:diagnostics,
    factLedger,
    promptText:buildStructuredFactPrompt(factLedger),
    newestAt:evidenceSources[0]?.publishedAt||normalizedNews[0]?.publishedAt||null,
    cutoffAt:newsBundle.cutoffAt||null,
    maxAgeHours:Number(newsBundle.maxAgeHours||36),
    detailedReady:factLedger.facts.length>=Number(plan.detailedMinFacts||1)&&evidenceSources.length>0,
  };
}

export function researchCompleteness(bundle={}) {
  const facts=Array.isArray(bundle.factLedger?.facts)?bundle.factLedger.facts:[];
  const evidence=Array.isArray(bundle.evidenceSources)?bundle.evidenceSources:[];
  const official=evidence.filter(item=>item.sourceType==='official').length;
  const structured=evidence.filter(item=>item.provider==='structured_api').length;
  return {
    evidenceCount:evidence.length,
    factCount:facts.length,
    officialCount:official,
    structuredCount:structured,
    relatedNewsCount:Array.isArray(bundle.relatedNews)?bundle.relatedNews.length:0,
    relatedVideoCount:Array.isArray(bundle.relatedVideos)?bundle.relatedVideos.length:0,
    detailedReady:Boolean(bundle.detailedReady),
  };
}

export function researchSourceDomain(item={}) {
  return domainFromUrl(item.link||item.url||item.canonicalUrl||'');
}
