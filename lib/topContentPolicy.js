function visibilityAllowsPublicTop(trend = {}) {
  const visibility = String(trend.visibility || 'published');
  return !['private', 'trashed', 'hidden_feed', 'hidden_top'].includes(visibility);
}

export function isCurrentPublicTop(trend = {}, { limit = 30 } = {}) {
  if (!visibilityAllowsPublicTop(trend)) return false;
  const rank = Number(trend.rank || 0);
  const maxRank = Math.min(30, Math.max(1, Number(limit || 30)));
  if (!(rank >= 1 && rank <= maxRank)) return false;
  const allowedPolicies=new Set(['atomic_verified_event_v3','strict_atomic_top30_v4','fixed_top30_content_pipeline_v5','relative_top30_graded_content_v6','feed_first_relative_top30_v7','sample_aligned_feed_top30_v8','resilient_stage_recovery_top30_v9','guaranteed_safe_stage_top30_v10','research_backed_feed_top30_v11','single_entity_feed_top30_v12','single_entity_feed_top30_v13','fixed_top30_sample_feed_v14','fixed_keyword_content_v15']);
  const grade=String(trend.contentGrade||'B').toUpperCase();
  return allowedPolicies.has(String(trend.publicTopPolicy||''))
    &&trend.publicReady===true
    &&trend.contentReady===true
    &&(grade==='D'||Number(trend.verifiedFactCount||0)>=1);
}

export function isResearchCandidate(trend={}) {
  const rank=Number(trend.rank||0);
  return trend.publicTopPolicy==='research_pending_v3'&&trend.mainVisible===true&&rank>=1&&rank<=30;
}

export function isTopBriefEligible() {
  return false;
}

export function contentTierForTrend(trend = {}) {
  if(isResearchCandidate(trend))return Number(trend.rank||99)<=10?'full':'standard';
  if (!visibilityAllowsPublicTop(trend) || !isCurrentPublicTop(trend)) return 'none';
  return Number(trend.rank||99)<=10?'full':'standard';
}

export function shouldSkipSourceFetchForBrief() {
  return false;
}

export function selectTopContentCandidates(trends = [], { limit = 30 } = {}) {
  const maxRank = Math.min(30, Math.max(1, Number(limit || 30)));
  return (Array.isArray(trends) ? trends : [])
    .filter(item => item?.slug && (item?.keyword || item?.topKeyword || item?.displayTitle || item?.topTitle))
    .map(item => ({ ...item, keyword:item.keyword||item.topKeyword||item.displayTitle||item.topTitle }))
    .filter(item => isCurrentPublicTop(item,{limit:maxRank}))
    .sort((a,b)=>Number(a.rank||99)-Number(b.rank||99))
    .map(item=>({ ...item, contentTier:contentTierForTrend(item), topEligible:true }));
}

export function compactTrendPayload(trend = {}) {
  return {
    slug: trend.slug,
    keyword: trend.keyword,
    rawKeyword: trend.rawKeyword,
    topKeyword: trend.topKeyword,
    topTopic: trend.topTopic,
    topTitle: trend.topTitle,
    displayTitle: trend.displayTitle,
    titleStatus: trend.titleStatus || null,
    titleReady: trend.titleReady === true,
    titleSource: trend.titleSource || null,
    searchQuery: trend.searchQuery,
    category: trend.category,
    categoryConfidence: trend.categoryConfidence,
    categoryReason: trend.categoryReason,
    qualityScore: trend.qualityScore,
    rankingScore: trend.rankingScore,
    rankingGrade: trend.rankingGrade,
    rank: Number(trend.rank || 99),
    contentTier: contentTierForTrend(trend),
    topEligible: isCurrentPublicTop(trend)||isResearchCandidate(trend),
    mainVisible: trend.mainVisible === true,
    visibility: trend.visibility || 'published',
    eventCoherence: trend.eventCoherence,
    independentSources: trend.independentSources,
    officialSources: trend.officialSources,
    eventKey: trend.eventKey,
    publicTopPolicy:trend.publicTopPolicy||null,
    publicReady:trend.publicReady===true,
    contentReady:trend.contentReady===true,
    verifiedFactCount:Number(trend.verifiedFactCount||0),
    verifiedEvidenceCount:Number(trend.verifiedEvidenceCount||0),
    contentGrade:String(trend.contentGrade||'B').toUpperCase(),
    contentScore:Number(trend.contentScore||0),
    candidateType:trend.candidateType||null,
    causeStatus:trend.causeStatus||null,
    relatedArticles:Array.isArray(trend.relatedArticles)?trend.relatedArticles.slice(0,5):[],
    imageMeta: trend.imageMeta || null,
  };
}
