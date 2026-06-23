import crypto from 'crypto';

const DEFAULT_OFFICIAL_SUFFIXES = ['.go.kr', '.gov.kr'];
const DEFAULT_OFFICIAL_DOMAINS = [
  'korea.kr','president.go.kr','assembly.go.kr','bok.or.kr','fsc.go.kr','fss.or.kr','kisa.or.kr',
  'kostat.go.kr','mcst.go.kr','molit.go.kr','mois.go.kr','mohw.go.kr','moel.go.kr','motie.go.kr',
  'msit.go.kr','kca.go.kr','ftc.go.kr','kdca.go.kr','police.go.kr','spo.go.kr','scourt.go.kr',
  'olympics.com','fifa.com','the-afc.com','kfa.or.kr','kovo.co.kr','koreabaseball.com'
];


const DEFAULT_TRUSTED_NEWS_DOMAINS = [
  'yna.co.kr','yonhapnews.co.kr','newsis.com','kbs.co.kr','imbc.com','sbs.co.kr','ytn.co.kr','jtbc.co.kr',
  'donga.com','chosun.com','joongang.co.kr','hani.co.kr','khan.co.kr','mk.co.kr','hankyung.com','edaily.co.kr',
  'etnews.com','zdnet.co.kr','bloter.net','digitaldaily.co.kr','ddaily.co.kr','inews24.com','boannews.com','securitynews.com',
  'mbn.co.kr','tvchosun.com','ichannela.com','seoul.co.kr','segye.com','munhwa.com','kmib.co.kr','nocutnews.co.kr',
  'heraldcorp.com','fnnews.com','asiae.co.kr','ajunews.com','sedaily.com','mt.co.kr','moneytoday.co.kr','dailian.co.kr',
  'sportschosun.com','osen.co.kr','xportsnews.com','starnews.com','newsen.com','mydaily.co.kr','isplus.com',
  'reuters.com','apnews.com','bbc.com'
];

const SENSITIVE_PATTERNS = [
  /사망|살인|성폭력|성범죄|마약|납치|학대|자살|극단적 선택|테러|폭발|대형사고|참사/,
  /수사|구속|기소|재판|혐의|피의자|피고인|의혹|비위|부패|선거|대통령|국회의원|정당/,
  /질병|감염|백신|치료|의약품|수술|진단|건강|의료/,
  /주가|투자|매수|매도|목표가|수익률|가상자산|코인|금리|대출/,
  /열애|결별|이혼|사생활|미성년|학교폭력|학폭/
];

const GENERIC_PATTERNS = [
  '화제가 되고 있습니다','관심이 집중되고 있습니다','귀추가 주목됩니다','지켜볼 필요가 있습니다',
  '다양한 반응이 이어지고 있습니다','관련 보도가 이어지고 있습니다','핵심 내용을 살펴보겠습니다',
  '자세한 내용은 확인이 필요합니다','이슈가 되고 있습니다','최신 소식입니다','한눈에 알아보겠습니다'
];

function envList(name) {
  return String(process.env[name] || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
}

export function cleanText(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

export function domainFromUrl(value = '') {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

export function canonicalizeUrl(value = '') {
  try {
    const url = new URL(value);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','ocid','ref'].forEach(k => url.searchParams.delete(k));
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch { return String(value || '').trim(); }
}

function domainMatches(domain, allowed) {
  return allowed.some(item => domain === item || domain.endsWith(`.${item}`));
}

export function classifySource(url = '', provider = '') {
  const domain = domainFromUrl(url);
  const authorized = envList('AUTHORIZED_CONTENT_SOURCE_DOMAINS');
  const official = [...DEFAULT_OFFICIAL_DOMAINS, ...envList('OFFICIAL_CONTENT_SOURCE_DOMAINS')];
  const denied = envList('DENIED_CONTENT_SOURCE_DOMAINS');
  const trustedNews = [...DEFAULT_TRUSTED_NEWS_DOMAINS, ...envList('TRUSTED_NEWS_SOURCE_DOMAINS')];
  const providerName = String(provider || '').toLowerCase();

  // v7.8.1: 출처의 역할과 저작권 판단을 분리합니다.
  // - discoveryUsable: 주제 발견·교차 확인·관련 링크 제공 가능
  // - evidenceUsable: 상세 콘텐츠의 구조화된 사실 근거로 사용 가능
  // - bodyFetchAllowed: 서버가 원문 페이지를 읽어 구조화된 사실을 추출할 수 있음
  // - textReuseAllowed: 외부 표현의 재사용 가능 여부. STELLATE는 모든 출처에서 false입니다.
  const roles = ({ sourceType, rightsBasis, discoveryUsable, evidenceUsable, bodyFetchAllowed }) => ({
    sourceType, rightsBasis, discoveryUsable, evidenceUsable, bodyFetchAllowed,
    textReuseAllowed:false,
    // 기존 코드 호환용 별칭. 표현 재사용 허용을 의미하지 않습니다.
    contentUsable:evidenceUsable,
    domain,
  });

  if (!domain || domainMatches(domain, denied)) {
    return roles({ sourceType:'discovery', rightsBasis:'none', discoveryUsable:false, evidenceUsable:false, bodyFetchAllowed:false });
  }
  if (domainMatches(domain, authorized)) {
    return roles({ sourceType:'authorized', rightsBasis:'configured_authorization', discoveryUsable:true, evidenceUsable:true, bodyFetchAllowed:true });
  }
  if (domainMatches(domain, official) || DEFAULT_OFFICIAL_SUFFIXES.some(suffix => domain.endsWith(suffix))) {
    return roles({ sourceType:'official', rightsBasis:'official_publication', discoveryUsable:true, evidenceUsable:true, bodyFetchAllowed:true });
  }
  if (domainMatches(domain, trustedNews)) {
    return roles({ sourceType:'trusted_news', rightsBasis:'fact_verification_only', discoveryUsable:true, evidenceUsable:true, bodyFetchAllowed:true });
  }
  const policy = String(process.env.CONTENT_SOURCE_POLICY || 'verified').toLowerCase();
  const configuredIndependent = policy === 'balanced' && !['naver','google_news','google'].includes(providerName);
  return roles({
    sourceType:configuredIndependent ? 'independent' : 'discovery',
    rightsBasis:configuredIndependent ? 'configured_balanced_mode' : 'discovery_only',
    discoveryUsable:true,
    evidenceUsable:configuredIndependent,
    bodyFetchAllowed:configuredIndependent,
  });
}

export function normalizeSourceItem(item = {}) {
  const link = canonicalizeUrl(item.link || item.url || '');
  const classification = classifySource(link, item.provider);
  // 일반 SNS와 공식 계정의 발표를 구분합니다. 공식 여부는 수집 어댑터나 관리자가
  // verifiedOfficialAccount/official 플래그로 검증한 경우에만 인정합니다.
  const verifiedOfficialSocial = item.verifiedOfficialAccount === true || item.official === true;
  const sourceType = verifiedOfficialSocial ? 'official' : (item.sourceType || classification.sourceType);
  const rightsBasis = verifiedOfficialSocial ? 'verified_official_social_announcement' : (item.rightsBasis || classification.rightsBasis);
  const evidenceUsable = verifiedOfficialSocial ? true : (item.evidenceUsable ?? item.contentUsable ?? classification.evidenceUsable);
  const discoveryUsable = verifiedOfficialSocial ? true : (item.discoveryUsable ?? classification.discoveryUsable);
  const bodyFetchAllowed = verifiedOfficialSocial ? Boolean(item.bodyFetchAllowed) : (item.bodyFetchAllowed ?? classification.bodyFetchAllowed);
  return {
    ...item,
    title: cleanText(item.title),
    description: cleanText(item.description || item.summary || item.snippet || '').slice(0, 3200),
    link,
    provider: item.provider || 'unknown',
    source: cleanText(item.source || classification.domain || '출처'),
    sourceType,
    rightsBasis,
    discoveryUsable,
    evidenceUsable,
    bodyFetchAllowed,
    textReuseAllowed: false,
    // 기존 필드명은 상세 근거 사용 가능 여부의 호환 별칭입니다.
    contentUsable: evidenceUsable,
    discoveryOnly: item.discoveryOnly ?? !evidenceUsable,
    canonicalUrl: link,
    domain: classification.domain,
  };
}

export function hashText(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function makeSourceSignature(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item?.title || item?.description)
    .map(normalizeSourceItem)
    .sort((a,b) => `${a.canonicalUrl}|${a.publishedAt}`.localeCompare(`${b.canonicalUrl}|${b.publishedAt}`))
    .map(item => [
      item.canonicalUrl || '', item.publishedAt || '', item.modifiedAt || '', item.source || '',
      cleanText(item.title).toLowerCase(), hashText(cleanText(item.description || item.coreEvent || '')).slice(0,16)
    ].join('|')).join('||');
}

function factType(text=''){
  const value=cleanText(text);
  if(/정정|수정|번복/.test(value))return 'correction';
  // 전달 동사(발표·설명)보다 실제 사건의 성격을 먼저 판정합니다.
  if(/발생|사고|장애|중단|유출|화재|폭발/.test(value))return 'incident';
  if(/복구|재개|정상화|해결|완료/.test(value))return 'recovery';
  if(/예정|계획|추진|시행|출시|개최/.test(value))return 'schedule';
  if(/결정|확정|승인|선정|채택/.test(value))return 'decision';
  if(/증가|감소|상승|하락|기록|달성|집계/.test(value)||/\d/.test(value))return 'metric';
  if(/발표|공개|밝혔|공시|설명/.test(value))return 'announcement';
  if(/말했|전했|강조|언급/.test(value))return 'statement';
  return 'state_change';
}
function factValues(text=''){
  return [...String(text||'').matchAll(/(-?\d+(?:[.,]\d+)?)\s*(%p|퍼센트포인트|%|조원|억원|만원|원|만명|천명|명|건|회|배|개|도|℃|mm|cm|km|일|개월|년|시|분)?/g)].map(match=>({raw:match[0].trim(),value:Number(match[1].replace(/,/g,'')),unit:match[2]||''})).slice(0,8);
}
function extractEventAt(text='',publishedAt=null){
  const match=String(text||'').match(/(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
  if(match){
    const base=new Date(publishedAt||Date.now());const year=Number(match[1]||base.getUTCFullYear());
    return `${year}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
  }
  return null;
}
function topicTokens(value=''){
  return (cleanText(value).toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[])
    .filter(token=>!['관련','최신','소식','뉴스','이슈','공식','오늘','내일','모레','이번','전국'].includes(token));
}

export function isSourceRelevantToTopic(item={},topicTitle=''){
  const topic=cleanText(topicTitle);
  if(!topic)return true;
  const combined=cleanText(`${item.title||''} ${item.description||item.summary||item.snippet||''}`).toLowerCase();
  const compactTopic=topic.toLowerCase().replace(/[^가-힣a-z0-9]/g,'');
  const compactCombined=combined.replace(/[^가-힣a-z0-9]/g,'');
  if(compactTopic.length>=2&&compactCombined.includes(compactTopic))return true;
  const tokens=topicTokens(topic);
  if(!tokens.length)return true;
  const matched=tokens.filter(token=>combined.includes(token)).length;
  return matched===tokens.length||(tokens.length>=3&&matched>=Math.ceil(tokens.length*0.75));
}

function isFactualSentence(text=''){
  const value=cleanText(text);
  if(value.length<12||value.length>360)return false;
  if(/무단전재|재배포|저작권|쿠키|로그인|회원가입|개인정보처리방침|관련기사|기사제보|구독|광고문의|기자\s*=|사진\s*=/.test(value))return false;
  if(/[?？]$/.test(value)||/(?:…|\.\.\.)$/.test(value))return false;
  if(/관심이 (?:커지고|집중되고)|귀추가 주목|반응이 이어|화제가 되고|전망이다|것으로 보인다|가능성이 있다|기대된다|우려된다|평가된다/.test(value))return false;
  return /발표|공개|결정|확정|발생|시행|예정|계획|증가|감소|상승|하락|기록|출시|개최|중단|복구|승리|패배|득점|계약|선정|수사|기소|판결|출연|방송|무대|공연|콘서트|신곡|앨범|컴백|수상|합류|복귀|방영|참여|진행|촬영|지원|적용|변경|오픈|예약|판매|제공|업데이트|출범|취임|가입|체결|공급|수주|매출|영업이익|출시|운영|재개|종료|\d/.test(value);
}
function factTokenSimilarity(a='',b=''){
  return jaccard(ngrams(a,3),ngrams(b,3));
}

function splitFactualClauses(value=''){
  const normalizedValue=cleanText(value)
    .replace(/(복구(?:를\s*)?(?:완료했다고|완료했다|완료됐|됐다|되었다|됐))(?:으며|고)\s+/g,'$1. ')
    .replace(/(장애가\s*발생(?:했다고|했다|했))(?:으며|고)\s+/g,'$1. ');
  return normalizedValue.split(/(?<=[.!?다요])\s+/).map(cleanText).filter(Boolean);
}

function semanticFactTokens(value=''){
  const stop=new Set(['카카오는','카카오가','회사는','서비스는','서비스에서','같은','이날','해당','관련','추가','후속','오전','오후','발표했다','밝혔다','설명했다','예정이다','계획이다']);
  return (cleanText(value).toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[])
    .map(token=>token.replace(/(?:은|는|이|가|을|를|에서|으로|와|과|의|도)$/,''))
    .filter(token=>token.length>1&&!stop.has(token));
}

function valueKeys(factOrText){
  const rows=typeof factOrText==='string'?factValues(factOrText):(Array.isArray(factOrText?.values)?factOrText.values:[]);
  return new Set(rows.map(row=>`${row.value}|${row.unit||''}`));
}

function semanticFactMatch(existing={},text=''){
  const nextType=factType(text);
  if(existing.type!==nextType)return false;
  const left=semanticFactTokens(existing.text),right=semanticFactTokens(text);
  if(!left.length||!right.length)return false;
  const common=left.filter(token=>right.some(other=>other===token||other.includes(token)||token.includes(other)));
  const ratio=common.length/Math.max(1,Math.min(left.length,right.length));
  const leftValues=valueKeys(existing),rightValues=valueKeys(text);
  const sharedValue=[...leftValues].some(value=>rightValues.has(value));
  if(nextType==='metric'){
    const substantive=rows=>new Set([...rows].filter(value=>!/(?:\|년|\|일|\|개월|\|시|\|분)$/.test(value)&&!value.endsWith('|')));
    const leftSub=substantive(leftValues),rightSub=substantive(rightValues);
    const sameMeasure=[...leftSub].some(value=>rightSub.has(value));
    return ratio>=0.55&&leftSub.size>0&&rightSub.size>0&&sameMeasure;
  }
  if(['incident','recovery','schedule'].includes(nextType))return ratio>=0.45&&(sharedValue||common.length>=2);
  return ratio>=0.62&&(sharedValue||common.length>=3);
}

export function buildFactLedger(items = [], options = {}) {
  const topicTitle=cleanText(typeof options==='string'?options:options?.topicTitle||options?.topic||'');
  const usable = (Array.isArray(items) ? items : []).map(normalizeSourceItem)
    .filter(item => item.evidenceUsable ?? item.contentUsable)
    .filter(item=>isSourceRelevantToTopic(item,topicTitle));
  const facts=[];
  usable.forEach((item,index)=>{
    const sourceId=`S${index+1}`;
    const sourceRelevant=isSourceRelevantToTopic(item,topicTitle);
    const title=cleanText(item.title);
    const descriptionSentences=cleanText(item.description).split(/[•·]\s*/).flatMap(splitFactualClauses).map(cleanText);
    const candidates=[title,...descriptionSentences]
      .filter(isFactualSentence)
      .filter(text=>{
        if(!topicTitle)return true;
        if(isSourceRelevantToTopic({title:text,description:''},topicTitle))return true;
        // 제목이 키워드를 명확히 포함하는 기사에서는 본문의 완결 문장도 허용합니다.
        return sourceRelevant&&isSourceRelevantToTopic({title,description:''},topicTitle)&&/[다요]\.?$|습니다\.?$/.test(text);
      })
      .slice(0,8);
    candidates.forEach(text=>{
      const existing=facts.find(fact=>factTokenSimilarity(fact.text,text)>=0.60||semanticFactMatch(fact,text));
      if(existing){
        if(!existing.sourceIds.includes(sourceId))existing.sourceIds.push(sourceId);
        if(text.length>existing.text.length&&text.length<=320)existing.text=text;
        existing.values=[...existing.values,...factValues(text)].filter((value,pos,rows)=>rows.findIndex(row=>row.raw===value.raw)===pos).slice(0,8);
        existing.confidence=Math.min(1,Math.max(existing.confidence,item.sourceType==='official'?1:item.sourceType==='authorized'?0.95:item.sourceType==='trusted_news'?0.88:0.8)+(existing.sourceIds.length>1?0.05:0));
        return;
      }
      facts.push({
        id:`F${facts.length+1}`,text:text.slice(0,320),type:factType(text),subject:topicTitle||cleanText(text).split(/[은는이가에서]/)[0].slice(0,60),predicate:(text.match(/(발표했다|공개했다|결정했다|확정했다|발생했다|예정이다|계획이다|증가했다|감소했다|상승했다|하락했다|기록했다|출시한다|시행한다|중단됐다|복구됐다)/)||[])[1]||'',
        values:factValues(text),eventAt:extractEventAt(text,item.publishedAt),publishedAt:item.publishedAt||null,modifiedAt:item.modifiedAt||null,
        sourceIds:[sourceId],sourceType:item.sourceType,sourceTitle:item.title||'',sourceDomain:item.domain||'',status:'single_source',confidence:item.sourceType==='official'?1:item.sourceType==='authorized'?0.95:item.sourceType==='trusted_news'?0.86:0.76,
      });
    });
  });
  facts.forEach((fact,index)=>{
    fact.id=`F${index+1}`;
    const sourceRows=fact.sourceIds.map(id=>usable[Number(id.slice(1))-1]).filter(Boolean);
    const sourceTypes=sourceRows.map(row=>row.sourceType).filter(Boolean);
    const domains=new Set(sourceRows.map(row=>row.domain).filter(Boolean));
    const official=sourceTypes.some(type=>['official','authorized'].includes(type));
    fact.status=official||domains.size>=2?'confirmed':'single_source';
    fact.verificationLevel=official?'official':domains.size>=2?'multi_source':sourceTypes.includes('trusted_news')?'trusted_single':'single_source';
    fact.sourceDomains=[...domains];
  });
  const conflicts=[];
  for(let i=0;i<facts.length;i++)for(let j=i+1;j<facts.length;j++){
    if(facts[i].sourceIds.some(id=>facts[j].sourceIds.includes(id)))continue;
    const similarity=factTokenSimilarity(facts[i].text,facts[j].text);
    const left=facts[i].values.map(v=>`${v.value}|${v.unit}`).sort(),right=facts[j].values.map(v=>`${v.value}|${v.unit}`).sort();
    const leftUnits=new Set(facts[i].values.map(v=>v.unit).filter(Boolean));
    const rightUnits=new Set(facts[j].values.map(v=>v.unit).filter(Boolean));
    const sharedUnit=[...leftUnits].some(unit=>rightUnits.has(unit));
    if(facts[i].type===facts[j].type&&similarity>=0.55&&sharedUnit&&left.length&&right.length&&left.join(',')!==right.join(',')){
      conflicts.push({factIds:[facts[i].id,facts[j].id],sourceIds:[...facts[i].sourceIds,...facts[j].sourceIds],reason:'같은 사건·같은 단위의 수치가 출처별로 다릅니다.',values:[left,right]});
    }
  }
  const confirmed=facts.filter(fact=>fact.status==='confirmed');
  return {
    version:4,
    topicTitle,
    sources: usable.map((item,index)=>({id:`S${index+1}`,title:item.title,source:item.source,url:item.canonicalUrl,domain:item.domain,sourceType:item.sourceType,rightsBasis:item.rightsBasis,publishedAt:item.publishedAt||null,modifiedAt:item.modifiedAt||null,fetchDiagnostic:item.fetchDiagnostic||null})),
    facts,
    confirmedFacts:confirmed.map(fact=>fact.id),
    uncertainties:[
      ...(facts.length<1?['키워드와 직접 연결되는 구체적인 사실을 확보하지 못했습니다.']:[]),
      ...(facts.some(fact=>fact.status==='single_source')?['일부 사실은 단일 출처에서만 확인됐습니다.']:[]),
    ],
    conflicts:conflicts.slice(0,10),
  };
}

function normalized(value = '') { return cleanText(value).toLowerCase().replace(/[^가-힣a-z0-9]/g, ''); }
function ngrams(value, size = 5) {
  const text = normalized(value); const set = new Set();
  for (let i=0;i<=text.length-size;i++) set.add(text.slice(i,i+size));
  return set;
}
function jaccard(a,b) {
  if (!a.size || !b.size) return 0;
  let common=0; a.forEach(v=>{if(b.has(v)) common+=1;});
  return common / (a.size + b.size - common);
}
function hasLongSharedPhrase(a,b,min=24) {
  const left=normalized(a), right=normalized(b); if(left.length<min||right.length<min)return false;
  for(let i=0;i<=left.length-min;i++){ if(right.includes(left.slice(i,i+min))) return true; }
  return false;
}

export function collectOutputTexts(content = {}) {
  const card = content.card || {};
  return [
    content.topTitle, content.feedTitle, content.detailTitle, content.displayTitle,
    card.feedTitle, card.detailTitle, card.summary, card.why,
    ...(Array.isArray(card.points) ? card.points : []),
    content.blog, ...(Array.isArray(content.qa) ? content.qa.flatMap(x => [x?.q,x?.a]) : []),
    ...(Array.isArray(content.instagramCards) ? content.instagramCards.flatMap(x => [x?.headline,x?.body]) : []),
    content.instagramCaption,
  ].map(cleanText).filter(Boolean);
}

export function assessCopyrightRisk(content = {}, sourceItems = []) {
  const outputs = collectOutputTexts(content);
  const sources = (Array.isArray(sourceItems) ? sourceItems : []).flatMap(item => [item?.title,item?.description,item?.snippet,item?.content]).map(cleanText).filter(v => v.length >= 12);
  let maxSimilarity=0, longPhraseMatches=0, riskyPairs=[];
  for(const output of outputs){
    for(const source of sources){
      const similarity=jaccard(ngrams(output),ngrams(source));
      if(similarity>maxSimilarity) maxSimilarity=similarity;
      const longMatch=hasLongSharedPhrase(output,source,24);
      if(longMatch) longPhraseMatches+=1;
      if(similarity>=0.55||longMatch) riskyPairs.push({output:output.slice(0,100),source:source.slice(0,100),similarity:Number(similarity.toFixed(3)),longMatch});
    }
  }
  const score=Math.max(0,Math.round(100-(maxSimilarity*100)-Math.min(45,longPhraseMatches*18)));
  return { score, maxSimilarity:Number(maxSimilarity.toFixed(3)), longPhraseMatches, riskyPairs:riskyPairs.slice(0,10), passed:maxSimilarity<0.55&&longPhraseMatches===0 };
}

export function assessGrounding(content = {}, ledger = {}) {
  const facts=Array.isArray(ledger.facts)?ledger.facts:[];
  const factMap=new Map(facts.map(f=>[f.id,cleanText(f.text)]));
  const meaningfulTokens=value=>new Set((cleanText(value).toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[]).filter(token=>!['있습니다','했습니다','됩니다','대한','관련','통해','위해','이번','해당','현재'].includes(token)));
  const semanticMatch=(text,factTexts=[])=>{
    const left=meaningfulTokens(text);if(!left.size)return false;
    return factTexts.some(fact=>{
      const right=meaningfulTokens(fact);let common=0;left.forEach(token=>{if(right.has(token)||[...right].some(v=>v.includes(token)||token.includes(v)))common+=1;});
      const required=Math.min(3,Math.max(1,Math.ceil(left.size*0.16)));
      return common>=required||jaccard(ngrams(text,3),ngrams(fact,3))>=0.08;
    });
  };
  const rows=[];
  (Array.isArray(content.claimMap)?content.claimMap:[]).forEach(row=>rows.push({text:row?.text,claimIds:row?.claimIds||[],kind:'body'}));
  (Array.isArray(content.qa)?content.qa:[]).forEach(row=>rows.push({text:row?.a,claimIds:row?.claimIds||[],kind:'qa'}));
  (Array.isArray(content.instagramCards)?content.instagramCards:[]).filter(row=>!['promo','source'].includes(row?.type)).forEach(row=>rows.push({text:row?.body,claimIds:row?.claimIds||[],kind:'instagram'}));
  const card=content.card||{};
  [card.summary,card.why,...(Array.isArray(card.points)?card.points:[])].filter(Boolean).forEach(text=>rows.push({text,claimIds:[],kind:'summary'}));
  const checked=rows.filter(row=>cleanText(row.text).length>=15);
  if(!checked.length||!facts.length)return{score:0,supported:0,total:checked.length,reasons:['근거 사실 또는 검증 대상 문장이 부족합니다.'],unsupported:[]};
  let supported=0;const unsupported=[];
  for(const row of checked){
    const ids=(Array.isArray(row.claimIds)?row.claimIds:[]).filter(id=>factMap.has(id));
    const factTexts=ids.length?ids.map(id=>factMap.get(id)):facts.map(f=>f.text);
    const idValid=row.kind==='summary'||ids.length>0;
    const matched=idValid&&semanticMatch(row.text,factTexts);
    if(matched)supported+=1;else unsupported.push({kind:row.kind,text:cleanText(row.text).slice(0,160),claimIds:ids});
  }
  const score=Math.round((supported/checked.length)*100);
  const reasons=[];
  if(score<90)reasons.push('일부 문장이 연결된 사실 원장과 의미상 충분히 일치하지 않습니다.');
  if(unsupported.some(row=>row.kind!=='summary'&&!row.claimIds.length))reasons.push('유효한 Fact ID가 없는 본문·Q&A·카드가 있습니다.');
  return{score,supported,total:checked.length,reasons,unsupported:unsupported.slice(0,12)};
}

export function detectSensitiveContent(content = {}) {
  const text=collectOutputTexts(content).join(' ');
  return SENSITIVE_PATTERNS.some(pattern=>pattern.test(text));
}

export function repeatedTextRatio(values = []) {
  const normalizedValues=values.map(normalized).filter(v=>v.length>=8);
  if(normalizedValues.length<2)return 0;
  let pairs=0,duplicate=0;
  for(let i=0;i<normalizedValues.length;i++)for(let j=i+1;j<normalizedValues.length;j++){pairs++;if(jaccard(ngrams(normalizedValues[i],3),ngrams(normalizedValues[j],3))>0.45)duplicate++;}
  return pairs?duplicate/pairs:0;
}

export function countGenericPhrases(content = {}) {
  const text=collectOutputTexts(content).join(' ');
  return GENERIC_PATTERNS.filter(v=>text.includes(v)).length;
}

export function decidePublication({ content, sourceItems = [], ledger = {}, qualityScore = 0, category = '' } = {}) {
  const usable=(sourceItems||[]).map(normalizeSourceItem).filter(item=>item.evidenceUsable ?? item.contentUsable);
  const official=usable.filter(item=>item.sourceType==='official').length;
  const authorized=usable.filter(item=>item.sourceType==='authorized').length;
  const trustedNews=usable.filter(item=>item.sourceType==='trusted_news').length;
  const independent=usable.filter(item=>item.sourceType==='independent').length;
  const independentDomains=new Set(usable.map(item=>item.domain).filter(Boolean)).size;
  const copyright=assessCopyrightRisk(content,sourceItems);
  const grounding=assessGrounding(content,ledger);
  const sensitive=detectSensitiveContent(content)||['politics'].includes(category);
  const genericCount=countGenericPhrases(content);
  const fullTier=(content.contentTier||'full')==='full';
  const grade=String(content?.contentGrade||'B').toUpperCase();
  const instagramBodies=fullTier?(content.instagramCards||[]).filter(x=>x?.type!=='promo').map(x=>`${x.headline||''} ${x.body||''}`):[];
  const cardRepeatRatio=fullTier?repeatedTextRatio(instagramBodies):0;
  const reasons=[];
  const supportedFacts=(ledger.facts||[]).filter(fact=>fact?.status==='confirmed'||fact?.sourceType==='official'||(Array.isArray(fact?.sourceIds)&&fact.sourceIds.length>0));
  const finalTitle=cleanText(content?.topTitle||'');
  const finalKeyword=cleanText(content?.topKeyword||'');
  const finalTopic=cleanText(content?.topTopic||'');
  const genericFinalTopic=/^(?:현재 상황|공식 발표|관련 소식|최근 이슈|최신 소식|수치 변화|상태 변화|시장 가격 변동|가격 변동|주요 동향|최근 동향|핵심 내용|확인된 사실)$/;
  const canonicalTitle=Boolean(finalKeyword&&finalTopic&&finalTitle===`${finalKeyword} · ${finalTopic}`&&finalTopic.length>=4&&finalTopic.length<=18&&!genericFinalTopic.test(finalTopic));
  if(content?.titleReady!==true||content?.titleStatus!=='ready'||!canonicalTitle) reasons.push('키워드와 구체적 사건으로 구성된 최종 제목을 확정하지 못했습니다.');
  if(grade!=='D'&&!usable.length) reasons.push('검증에 사용할 수 있는 근거 자료가 없습니다.');
  if(grade!=='D'&&supportedFacts.length<1) reasons.push('근거가 연결된 핵심 사실이 없습니다.');
  if(grade!=='D'&&(ledger.conflicts||[]).length) reasons.push('출처 간 수치·날짜 충돌이 있어 관리자 확인이 필요합니다.');
  const groundingFloor=grade==='A'?70:grade==='B'?50:grade==='C'?20:0;
  if(grounding.score<groundingFloor) reasons.push(`본문 문장 근거 연결 점수가 ${groundingFloor}점 미만입니다.`);
  const deterministicFallback=String(content?.aiStatus||'')==='verified_fallback';
  const copyrightAccepted=copyright.passed||(deterministicFallback&&Number(copyright.maxSimilarity||0)<0.85&&Number(copyright.longPhraseMatches||0)<=3);
  if(!copyrightAccepted) reasons.push('원문 표현과의 유사도가 높습니다.');
  // 품질점수·상투 표현·카드 중복은 자동 공개 차단 조건이 아니라 편집 진단으로만 남깁니다.
  const publishable=reasons.length===0;
  return {
    publishable, status:publishable?'published':'review_required', visibility:publishable?'published':'private',
    reviewRequired:!publishable, reasons, sensitive, copyright, grounding,
    sourceStats:{usable:usable.length,official,authorized,trustedNews,independent,independentDomains,conflicts:(ledger.conflicts||[]).length},
    genericCount, cardRepeatRatio:Number(cardRepeatRatio.toFixed(3)), qualityDiagnostic:Number(qualityScore||0),
  };
}
