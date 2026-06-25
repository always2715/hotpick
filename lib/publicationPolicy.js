import { sanitizePublicContent, containsPublicMetaCopy } from './publicCopy.js';
import { ledgerAccuracyReport, isGenericFactText } from './contentAccuracy.js';
import { FEED_DETAIL_MIN_CHARS } from './feedLengthPolicy.js';
const INTERNAL_COPY = /(?:A|B|C|D)등급\s*후보|(?:A|B|C|D)\s*신뢰도|STELLATE\s*관심도\s*점수|세부 사실을 뒷받침할 공식 자료가 충분하지|연결 가능한 관련 뉴스가 없어도|기본 브리핑을 생성|AI 비용 안전장치|공식 자료가 추가되면 상세|자동으로 검증된 자료가 부족|QStash|Fact Ledger가 부족|source fetch|콘텐츠 생성 정책|저작권 정책을 위해 원문을 사용하지|검증 콘텐츠 준비 중|콘텐츠 생성 중 문제가 발생/i;
const GENERIC_EVENT = /^(?:현재 상황|공식 발표|관련 소식|최근 이슈|새로운 소식|최신 소식|수치 변화|상태 변화|시장 가격 변동|가격 변동|주요 동향|최근 동향|핵심 내용|확인된 사실|화제|관심 증가)$/;
const PUBLIC_SOURCE_TYPES = new Set(['official','authorized','trusted_news','independent']);

function textValues(content={}) {
  const card=content.card||{};
  return [
    content.topTitle,content.feedTitle,content.detailTitle,content.displayTitle,
    card.feedTitle,card.detailTitle,card.summary,card.why,
    ...(Array.isArray(card.points)?card.points:[]),content.blog,
    ...(Array.isArray(content.qa)?content.qa.flatMap(item=>[item?.q,item?.a]):[]),
    ...(Array.isArray(content.instagramCards)?content.instagramCards.flatMap(item=>[item?.headline,item?.body]):[]),
  ].filter(Boolean).map(String);
}

function sourceStats(content={}) {
  const rows=Array.isArray(content.evidenceSources)?content.evidenceSources:Array.isArray(content.sourceItems)?content.sourceItems:[];
  const usable=rows.filter(row=>PUBLIC_SOURCE_TYPES.has(String(row?.sourceType||'')));
  const official=usable.filter(row=>row.sourceType==='official').length;
  const independentDomains=new Set(usable.map(row=>String(row?.domain||'').trim()).filter(Boolean));
  const trusted=usable.filter(row=>['official','authorized','trusted_news','independent'].includes(String(row?.sourceType||''))).length;
  return {usable:usable.length,official,trusted,independentDomains:independentDomains.size};
}


function copyrightAcceptable(content={}) {
  const risk=content?.copyrightRisk||{};
  if(risk.passed!==false)return true;
  // v8.0.15: 저작권 검사는 후보 탈락 장치가 아니라 표현 재작성 안전장치입니다.
  // 원문과 사실상 동일한 수준만 차단하고, 경미한 표현 유사도는 TOP 개수를 줄이지 않습니다.
  return Number(risk.maxSimilarity||0)<0.85&&Number(risk.longPhraseMatches||0)<=3;
}

export function publicContentRejectionReasons(content={}) {
  const reasons=[];
  const grade=String(content?.contentGrade||'').toUpperCase()||'B';
  const facts=Array.isArray(content.factLedger?.facts)?content.factLedger.facts:[];
  const supported=facts.filter(fact=>fact?.status==='confirmed'||fact?.sourceType==='official'||(Array.isArray(fact?.sourceIds)&&fact.sourceIds.length>0));
  const ledgerAccuracy=ledgerAccuracyReport(content.factLedger||{});
  const sources=sourceStats(content);
  const title=String(content.feedTitle||content.card?.feedTitle||content.displayTitle||'').trim();
  const summary=String(content.card?.summary||content.summary||'').trim();
  const topKeyword=String(content.topKeyword||'').trim();
  const topTopic=String(content.topTopic||'').trim();
  const interestTitle=grade==='D'&&topTopic==='관련 관심 증가';
  const canonicalTitle=Boolean(topKeyword&&topTopic&&String(content.topTitle||'').trim()===`${topKeyword} · ${topTopic}`&&topTopic.length>=4&&topTopic.length<=18&&(interestTitle||!GENERIC_EVENT.test(topTopic)));

  const strictAccuracy=Number(content?.contentVersion||0)>=126;
  if(strictAccuracy&&!ledgerAccuracy.passed)reasons.push(...ledgerAccuracy.reasons.map(reason=>`정확성 검증: ${reason}`));
  const genericFacts=facts.filter(fact=>isGenericFactText(fact?.text||fact?.claim||''));
  if(strictAccuracy&&genericFacts.length)reasons.push('실제 사실문 대신 일반화된 Fact 문구가 포함됨');
  if(strictAccuracy&&content?.accuracyValidation?.passed!==true)reasons.push('생성 문안의 Fact ID·수치·해석 정확성 검증 미통과');
  if(content.status!=='published'||content.visibility!=='published')reasons.push('공개 상태 아님');
  if(!['detailed','graded_detail'].includes(String(content.contentMode||''))&&content.contentType!=='detailed')reasons.push('상세 콘텐츠 형식 아님');
  if(content.hasContent!==true||!String(content.blog||'').trim())reasons.push('상세 본문 없음');
  const feedBodyLength=String(content.blog||'').trim().length;
  const enforceFlexibleFeedLength=Number(content?.contentVersion||0)>=134||['v8044-2000-3000','v8045-min1000-target5000','v8046-min1000-target5000-recovery'].includes(String(content?.feedDetailLengthPolicy||''));
  if(enforceFlexibleFeedLength&&feedBodyLength<FEED_DETAIL_MIN_CHARS)reasons.push(`피드 상세 본문 최소 ${FEED_DETAIL_MIN_CHARS.toLocaleString()}자 기준 미충족`);
  if(grade==='A'||grade==='B'){
    if(supported.length<1)reasons.push('근거가 연결된 사실 1개 미만');
    if(sources.usable<1||sources.trusted<1)reasons.push('사용 가능한 공식·신뢰 근거 없음');
    if(Number(content.groundingScore||0)<50)reasons.push('근거 연결 50점 미만');
  }else if(grade==='C'){
    if(supported.length<1)reasons.push('C등급 확인 사실 없음');
    if(sources.usable<1)reasons.push('C등급 연결 출처 없음');
    if(Number(content.groundingScore||0)<20)reasons.push('C등급 근거 연결 미달');
  }else if(grade==='D'){
    if(String(content.candidateType||'interest')!=='interest')reasons.push('D등급 후보 유형 불일치');
    if(String(content.causeStatus||'unconfirmed')!=='unconfirmed')reasons.push('D등급 원인 상태 불일치');
  }
  if(!copyrightAcceptable(content))reasons.push('저작권 유사도 검사 미통과');
  if(content.titleReady!==true||content.titleStatus!=='ready'||!canonicalTitle)reasons.push('최종 제목 검증 미통과');
  if(!title||title.length<5||title.length>64)reasons.push('피드 제목 기본 형식 미충족');
  if(summary.length<20||summary.length>220)reasons.push('피드 요약 기본 형식 미충족');
  if(textValues(content).some(value=>INTERNAL_COPY.test(value)))reasons.push('공개 금지 내부 진단 문구 포함');
  if(textValues(content).some(value=>containsPublicMetaCopy(value)))reasons.push('독자용 본문에 출처·검증 내부 안내문 포함');
  return [...new Set(reasons)];
}

export function isPublicContentReady(content={}) {
  return publicContentRejectionReasons(content).length===0;
}

// TOP20은 먼저 확정하고, 그 20개에 대해 독립 AI 조사·상세 작성·제목 생성을 수행합니다.
// 이 검사는 관리자 검토 플래그나 편집 진단 때문에 이미 선정된 TOP 키워드가 탈락하지 않도록
// 실제 공개에 필요한 구조·근거·제목·치명적 복제 위험만 확인합니다.
export function fixedTop20ContentRejectionReasons(content={}) {
  const staged={...content,status:'published',visibility:'published'};
  const reasons=[...publicContentRejectionReasons(staged)];
  const conflicts=Array.isArray(content?.factLedger?.conflicts)?content.factLedger.conflicts:[];
  if(conflicts.length&&String(content?.contentGrade||'').toUpperCase()!=='D')reasons.push('출처 간 사실 충돌');
  return [...new Set(reasons)];
}

export function isFixedTop20ContentReady(content={}) {
  return fixedTop20ContentRejectionReasons(content).length===0;
}


// Legacy names are retained as aliases so older admin utilities keep working during the TOP20 migration.
export const fixedTop30ContentRejectionReasons = fixedTop20ContentRejectionReasons;
export const isFixedTop30ContentReady = isFixedTop20ContentReady;

export const GENERIC_INTEREST_TEMPLATE = /(?:현재 검색과 콘텐츠에서 관심이 늘고 있는 주제|지금 확인된 관심 흐름|관심 증가 자체만 확인된 단계|구체적인 상승 배경은 아직 하나의 사건으로 확인되지 않았|관련 관심 증가)/i;



// v8.0.25: TOP20에 선정된 키워드는 '현재 사건 1건'이 반드시 있어야만 작성할 수 있는
// 심사 대상이 아닙니다. 키워드의 정체·기본정보를 확인한 프로필 사실만 확보돼도
// 해당 키워드에 맞는 개별 피드를 작성할 수 있습니다. 다만 출처·사실·제목·본문은
// 실제로 존재해야 하고, 과거의 관심 증가 공통문구는 계속 차단합니다.
export function fixedKeywordFeedRejectionReasons(content={}) {
  const reasons=[...fixedTop20ContentRejectionReasons(content)];
  const facts=(Array.isArray(content?.factLedger?.facts)?content.factLedger.facts:[])
    .filter(fact=>String(fact?.text||fact?.claim||'').trim())
    .filter(fact=>(Array.isArray(fact?.sourceIds)&&fact.sourceIds.length>0)||PUBLIC_SOURCE_TYPES.has(String(fact?.sourceType||'')));
  const sources=sourceStats(content);
  const combined=textValues(content).join(' ');
  if(facts.length<1)reasons.push('키워드 정체 또는 현재 이슈를 뒷받침하는 확인 사실 없음');
  if(sources.usable<1)reasons.push('키워드 설명에 연결된 확인 출처 없음');
  if(String(content?.contentGrade||'').toUpperCase()==='D')reasons.push('공통 관심 증가형 콘텐츠는 TOP20 피드로 사용할 수 없음');
  if(GENERIC_INTEREST_TEMPLATE.test(combined))reasons.push('관심 증가 고정문 포함');
  return [...new Set(reasons)];
}

export function isFixedKeywordFeedReady(content={}) {
  return fixedKeywordFeedRejectionReasons(content).length===0;
}

export function researchBackedFeedRejectionReasons(content={}) {
  const reasons=[...fixedTop20ContentRejectionReasons(content)];
  const grade=String(content?.contentGrade||'').toUpperCase();
  const facts=(Array.isArray(content?.factLedger?.facts)?content.factLedger.facts:[]).filter(fact=>fact?.scope!=='profile'&&String(fact?.text||'').trim());
  const sources=sourceStats(content);
  const combined=textValues(content).join(' ');
  if(grade==='D')reasons.push('실제 검색 근거 기반 피드가 아닌 관심 증가 템플릿');
  if(facts.length<1)reasons.push('현재 이슈를 뒷받침하는 검색 사실 없음');
  if(sources.usable<1)reasons.push('현재 이슈를 뒷받침하는 검색 출처 없음');
  if(GENERIC_INTEREST_TEMPLATE.test(combined))reasons.push('관심 증가 고정문 포함');
  return [...new Set(reasons)];
}

export function isResearchBackedFeedReady(content={}) {
  return researchBackedFeedRejectionReasons(content).length===0;
}


export function automaticPublicationRejectionReasons(content={}) {
  const reasons=[...publicContentRejectionReasons(content)];
  if(content?.publicationDecision?.publishable!==true){
    const decisionReasons=Array.isArray(content?.publicationDecision?.reasons)?content.publicationDecision.reasons:[];
    reasons.push(...decisionReasons.map(String).filter(Boolean));
    if(!decisionReasons.length)reasons.push('자동 공개 판정 미통과');
  }
  if(content?.reviewRequired===true)reasons.push('관리자 검토 필요 상태');
  return [...new Set(reasons)];
}

export function isAutomaticPublicationReady(content={}) {
  return automaticPublicationRejectionReasons(content).length===0;
}

export function sanitizePublicCopy(content={}) {
  const copy={...content};
  delete copy.rankingGrade;
  delete copy.rankingScore;
  delete copy.publicationReasons;
  delete copy.researchDiagnostics;
  delete copy.sourceFetchWarning;
  delete copy.aiError;
  delete copy.lastError;
  delete copy.discoverySignals;
  delete copy.onlineReactionRanking;
  delete copy.onlineReactionInput;
  return sanitizePublicContent(copy);
}

export function containsForbiddenPublicCopy(content={}) {
  return textValues(content).some(value=>INTERNAL_COPY.test(value));
}
