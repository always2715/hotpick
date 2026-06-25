import { PUBLIC_TOP_COUNT, TOP_POLICY_VERSION } from './topConfig.js';

const VIDEO_LIKE = /\b(?:official\s*(?:trailer|video|mv|clip)|teaser|trailer|special\s*clip|live|pv)\b|예고편|티저|생방송|라이브|리뷰|리액션|시뮬레이션|떡밥|총정리|지립니다|멘탈\s*터진|진짜\s*떴|feat\.?/i;
const FRAGMENT = /(?:^|\s)(?:do|the|for|of|with|vs|part|episode|ep|한|하는|하려는|하려고|했던|된|되는|될|인|이라는|같은|없는|있는|위한|대한|놓고|두고|둘러싼|앞둔)\s*$/i;
const EDITORIAL_LABEL = /^(?:기자수첩|사설|칼럼|취재수첩|인터뷰)(?:\s|$)/;
const QUANTITY_ONLY_FRAGMENT = /^(?:(?:최소|최대|약|총|무려|적어도|많게는|최고|최저)\s*)?\d+(?:[.,]\d+)*(?:명|건|개|곳|대|회|일|시간|분|개월|년|%|퍼센트|포인트|원|달러|위|점)(?:\s*(?:이상|이하|내외|가량|정도))?$/i;
const TRAILING_VERB_FRAGMENT = /(?:급등해|급락해|상승해|하락해|증가해|감소해|늘어|줄어|올라|내려|커져|작아져|확대돼|축소돼)$/;
const GENERIC_TOPICS = new Set(['현재 상황','공식 발표','관련 소식','최근 이슈','새로운 소식','최신 소식','화제','관심 증가']);

const CATEGORY_CONTEXT = {
  sports:/축구|야구|농구|배구|테니스|골프|선수|감독|리그|월드컵|올림픽|KBO|K리그|EPL|MLB|NBA|득점|출전|결장|이적|우승|경기/,
  entertainment:/영화|드라마|예능|방송|배우|가수|아이돌|앨범|신곡|컴백|공연|콘서트|넷플릭스|디즈니|티빙|예고편|티저/,
  economy:/실적|매출|영업이익|순이익|공시|주가|시장|금리|환율|투자|인수|합병|수주|기업|은행|증권/,
  life:/날씨|기온|강수|비|눈|폭염|한파|태풍|미세먼지|생활|건강|교육|육아|교통|분리수거/,
  politics:/정부|국회|대통령|장관|의원|선거|투표|정책|법안|규제|수사|재판|판결|경찰|검찰/,
  tech:/서비스|앱|소프트웨어|업데이트|출시|반도체|스마트폰|클라우드|데이터센터|보안|해킹|장애|AI|인공지능/,
  ai:/AI|인공지능|챗GPT|ChatGPT|Claude|Gemini|LLM|오픈AI|앤트로픽/i,
};

function clean(value='') { return String(value||'').replace(/\s+/g,' ').trim(); }
function reasons(item={}) { return [...(item.rankingReasons||[]),...(item.rankingPenalties||[])].map(String); }
function hasReason(item={}, pattern) { return reasons(item).some(reason=>pattern.test(reason)); }

function categoryContextMatches(item={}) {
  const category=String(item.category||'general');
  if(category==='general'||!CATEGORY_CONTEXT[category])return true;
  const context=clean(`${item.keyword||''} ${item.rawKeyword||''} ${item.topKeyword||''} ${(item.relatedArticles||[]).map(row=>row?.title||'').join(' ')}`);
  return CATEGORY_CONTEXT[category].test(context);
}

function eventTypeMatchesCategory(item={}) {
  const topic=clean(item.topTopic||'');
  const category=String(item.category||'general');
  if(/경기 결과|경기 활약|출전 상황|거취 변화/.test(topic))return category==='sports';
  if(/기상 상황/.test(topic))return category==='life';
  if(/방송·작품 소식|방송 내용 공개|출연 소식|시청률 변화|새 활동 소식/.test(topic))return category==='entertainment';
  if(/선거 진행 상황|수사·재판 진행|정책 변화/.test(topic))return category==='politics';
  if(/실적 발표|시장·가격 변동|사업 계획/.test(topic))return ['economy','tech'].includes(category);
  if(/서비스 장애|보안 이슈|제품·서비스 변화|출시 일정/.test(topic))return ['tech','ai','economy'].includes(category);
  return true;
}

export function researchCandidateRejectionReasons(item={}) {
  const out=[];
  const sources=Number(item.independentSources||0);
  const official=Number(item.officialSources||0);
  const coherence=Number(item.eventCoherence||0);
  const categoryConfidence=Number(item.categoryConfidence||0);
  const keyword=clean(item.keyword||item.rawKeyword||item.topKeyword||'');
  const raw=clean(item.rawKeyword||keyword);
  const title=clean(item.displayTitle||item.topTitle||keyword);
  const topic=clean(item.topTopic||'');
  if(!keyword||keyword.length<2||FRAGMENT.test(keyword)||FRAGMENT.test(title)||EDITORIAL_LABEL.test(keyword)||EDITORIAL_LABEL.test(title)||TRAILING_VERB_FRAGMENT.test(keyword)||TRAILING_VERB_FRAGMENT.test(title)||QUANTITY_ONLY_FRAGMENT.test(keyword))out.push('검색어 또는 제목이 불완전함');
  if(!topic||GENERIC_TOPICS.has(topic))out.push('구체적 사건 유형이 없음');
  if(item.manualApproved!==true&&item.topTopicSupport!=null&&Number(item.topTopicSupport)<1)out.push('사건 유형을 뒷받침하는 기사 제목 근거 부족');
  if(item.manualApproved!==true&&Array.isArray(item.titleValidationReasons)&&item.titleValidationReasons.length)out.push(...item.titleValidationReasons);
  if(coherence>0&&coherence<45)out.push('사건 일관성 45점 미만');
  if(categoryConfidence>0&&categoryConfidence<0.35)out.push('카테고리 확신도 0.35 미만');
  if(!categoryContextMatches(item))out.push('카테고리와 사건 문맥이 일치하지 않음');
  if(!eventTypeMatchesCategory(item))out.push('사건 유형과 카테고리가 일치하지 않음');
  if(hasReason(item,/최근 36시간 동일 사건 기사 없음/) && official<1 && sources<1)out.push('조사 시작 근거 없음');
  if((hasReason(item,/낚시성·영상형 문구/)||VIDEO_LIKE.test(raw))&&official<1&&sources<2)out.push('영상·리뷰형 후보의 교차 확인 부족');
  return [...new Set(out)];
}


// v8.0.2: 초기 후보 단계에서는 사건 유형·카테고리·출처 수를 확정하지 않습니다.
// Google Trends에서 발견한 후보를 먼저 멀티소스 조사한 뒤, 조사 결과로 제목과
// 공개 자격을 판정합니다. 이 단계에서는 명백히 깨진 검색어와 무근거 영상 조각만 제외합니다.
export function researchCandidateEntryRejectionReasons(item={}) {
  const out=[];
  const keyword=clean(item.keyword||item.rawKeyword||item.topKeyword||'');
  const title=clean(item.displayTitle||item.topTitle||keyword);
  const raw=clean(item.rawKeyword||keyword);
  if(!keyword||keyword.length<2||FRAGMENT.test(keyword)||FRAGMENT.test(title)||EDITORIAL_LABEL.test(keyword)||EDITORIAL_LABEL.test(title)||TRAILING_VERB_FRAGMENT.test(keyword)||TRAILING_VERB_FRAGMENT.test(title)||QUANTITY_ONLY_FRAGMENT.test(keyword))out.push('검색어 또는 제목이 불완전함');
  if(item.keywordUsable===false)out.push(`대표 키워드 해석 실패${Array.isArray(item.keywordValidationReasons)&&item.keywordValidationReasons.length?`: ${item.keywordValidationReasons.join(', ')}`:''}`);
  if(/^\d+(?:[.,]\d+)*(?:%|퍼센트|포인트|원|달러|위|점)?(?:\s|$)/i.test(keyword)||/[([{【][^\])}】]*$/.test(keyword))out.push('숫자·문장 조각 형태의 비정상 키워드');
  if(/^(?:나란히|연속|질문(?:에|을)?|답하는|오른|내린|앞둔)(?:\s|$)|(?:오른|내린|답하는|질문하는|앞둔|개월만|전에는\s*꼭)$/.test(keyword))out.push('기사 문장 조각을 대표 키워드로 사용할 수 없음');
  // 영상·리뷰형 또는 초기 출처 부족 후보도 멀티소스 조사 후 판단합니다.
  // 초기 단계에서는 깨진 검색어 외에는 자동 탈락시키지 않습니다.
  return [...new Set(out)];
}

export function publicTopRejectionReasons(item={}) {
  const policy=String(item.publicTopPolicy||'');
  if(policy==='research_pending_v3')return ['조사·상세 검증 전 비공개 후보'];
  const verifiedPolicies=new Set(['atomic_verified_event_v3','strict_atomic_top30_v4','fixed_top30_content_pipeline_v5','relative_top30_graded_content_v6','feed_first_relative_top30_v7','sample_aligned_feed_top30_v8','resilient_stage_recovery_top30_v9','guaranteed_safe_stage_top30_v10','research_backed_feed_top30_v11','single_entity_feed_top30_v12','single_entity_feed_top30_v13','fixed_top30_sample_feed_v14','fixed_keyword_content_v15',TOP_POLICY_VERSION]);
  if(verifiedPolicies.has(policy)){
    const out=[];
    const grade=String(item.contentGrade||'B').toUpperCase();
    if(item.publicReady!==true)out.push('공개 준비 미완료');
    if(grade!=='D'&&Number(item.verifiedFactCount||0)<1)out.push('검증 사실 없음');
    if(grade!=='D'&&Number(item.verifiedEvidenceCount||0)<1)out.push('검증 근거 없음');
    if(grade==='D'&&String(item.candidateType||'interest')!=='interest')out.push('관심 증가형 후보 유형 불일치');
    if(item.contentReady!==true)out.push('상세 콘텐츠 미완료');
    if(item.mainVisible!==true)out.push('공개 TOP 비활성');
    return out;
  }
  return ['v8 원자적 검증 공개 정책 미적용'];
}

export function isPublicTopCandidate(item={}) { return publicTopRejectionReasons(item).length===0; }
export function isLimitedTrendCandidate() { return false; }

export function selectVisibleTrendPool(candidates=[], {limit=PUBLIC_TOP_COUNT}={}) {
  return (Array.isArray(candidates)?candidates:[])
    .filter(item=>item?.manualApproved===true||researchCandidateEntryRejectionReasons(item).length===0)
    .map(item=>({
      ...item,mainVisible:true,visibility:'private',limitedVerification:false,reviewRequired:false,manualApproved:item?.manualApproved===true,
      contentTier:Number(item.googleRank||99)<=10?'full':'standard',
      publicTopPolicy:'research_pending_v3',publicReady:false,contentReady:false,
    }))
    .sort((a,b)=>Number(b.manualApproved===true)-Number(a.manualApproved===true)||Number(b.rankingScore||0)-Number(a.rankingScore||0)||Number(a.googleRank||99)-Number(b.googleRank||99))
    .slice(0,Math.max(1,Math.min(90,Number(limit||PUBLIC_TOP_COUNT))));
}

function normalizeSubject(value='') {
  return clean(value).toLowerCase().replace(/[^0-9a-z가-힣\s]/gi,' ').replace(/\b(?:official|trailer|video|clip|live|pv|teaser)\b/gi,' ').replace(/예고편|티저|라이브|생방송|리뷰|공식/g,' ').replace(/\s+/g,' ').trim();
}

export function publicEventIdentity(item={}) {
  const subject=normalizeSubject(item.topKeyword||item.keyword||item.displayTitle||'');
  const event=normalizeSubject(item.topTopic||'');
  const videoIds=(Array.isArray(item.youtubeVideos)?item.youtubeVideos:[]).map(video=>String(video?.id||'')).filter(Boolean).sort();
  return {subject,event,videoIds,key:`${subject}|${event}`};
}

export function isSamePublicEvent(left={},right={}) {
  const a=publicEventIdentity(left),b=publicEventIdentity(right);
  if(left.eventKey&&right.eventKey&&left.eventKey===right.eventKey)return true;
  if(a.videoIds.some(id=>b.videoIds.includes(id))&&a.event&&a.event===b.event)return true;
  if(!a.subject||!b.subject||!a.event||!b.event)return false;
  return a.subject===b.subject&&a.event===b.event;
}
