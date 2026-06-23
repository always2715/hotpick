export class TrendRefreshError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TrendRefreshError';
    this.code = String(code || 'trend_refresh_failed');
    this.details = details && typeof details === 'object' ? details : {};
  }
}

function identity(item = {}) {
  return String(item.eventKey || item.trendKey || item.slug || item.keyword || '').trim();
}

export function assertFreshTrendSet(trends = [], diagnostics = {}, previous = []) {
  if (!Array.isArray(trends) || trends.length === 0) {
    const reason = String(diagnostics?.reason || 'no_research_candidates');
    const message = reason === 'google_trends_empty'
      ? 'Google Trends 후보를 가져오지 못해 TOP을 갱신하지 않았습니다.'
      : '멀티소스 조사를 시작할 수 있는 신규 후보가 없어 기존 TOP을 유지했습니다. 관리자 후보 보고서에서 원시 후보와 제외 사유를 확인해 주세요.';
    throw new TrendRefreshError(reason, message, {
      previousCount: Array.isArray(previous) ? previous.length : 0,
      diagnostics,
    });
  }

  const keys = trends.map(identity);
  if (keys.some(key => !key)) {
    throw new TrendRefreshError('invalid_trend_identity', '신규 TOP 후보에 식별자가 없는 항목이 있습니다.', {
      invalidCount: keys.filter(key => !key).length,
    });
  }
  const unique = new Set(keys);
  if (unique.size !== keys.length) {
    throw new TrendRefreshError('duplicate_trend_identity', '신규 TOP 후보에 중복 사건 식별자가 남아 있습니다.', {
      expectedCount: keys.length,
      uniqueCount: unique.size,
    });
  }
  return trends;
}

export function verifyPersistedTrendSet(expected = [], persisted = [], expectedUpdatedAt = '', actualUpdatedAt = '') {
  if (!Array.isArray(persisted)) {
    throw new TrendRefreshError('trend_save_verify_failed', 'Redis에 저장된 TOP 형식을 확인할 수 없습니다.');
  }
  if (persisted.length !== expected.length) {
    throw new TrendRefreshError('trend_save_verify_failed', 'Redis TOP 저장 건수가 계산 결과와 일치하지 않습니다.', {
      expectedCount: expected.length,
      persistedCount: persisted.length,
    });
  }
  const expectedSlugs = expected.map(item => String(item?.slug || ''));
  const persistedSlugs = persisted.map(item => String(item?.slug || ''));
  const mismatchIndex = expectedSlugs.findIndex((slug, index) => slug !== persistedSlugs[index]);
  if (mismatchIndex >= 0) {
    throw new TrendRefreshError('trend_save_verify_failed', 'Redis TOP 저장 순서 또는 항목이 계산 결과와 일치하지 않습니다.', {
      mismatchIndex,
      expectedSlug: expectedSlugs[mismatchIndex],
      persistedSlug: persistedSlugs[mismatchIndex],
    });
  }
  if (!actualUpdatedAt || (expectedUpdatedAt && actualUpdatedAt !== expectedUpdatedAt)) {
    throw new TrendRefreshError('trend_save_verify_failed', 'Redis TOP 갱신 시각 검증에 실패했습니다.', {
      expectedUpdatedAt,
      actualUpdatedAt,
    });
  }
  return {
    verified: true,
    savedCount: persisted.length,
    updatedAt: actualUpdatedAt,
  };
}

export function summarizeTrendRefresh(previous = [], next = []) {
  const prev = new Map((Array.isArray(previous) ? previous : []).map((item, index) => [identity(item), { ...item, rank: Number(item?.rank || index + 1) }]));
  const current = new Map((Array.isArray(next) ? next : []).map((item, index) => [identity(item), { ...item, rank: Number(item?.rank || index + 1) }]));
  let entered = 0;
  let dropped = 0;
  let moved = 0;
  for (const [key, item] of current) {
    const before = prev.get(key);
    if (!before) entered += 1;
    else if (Number(before.rank) !== Number(item.rank)) moved += 1;
  }
  for (const key of prev.keys()) if (!current.has(key)) dropped += 1;
  const changed = entered + dropped + moved;
  return {
    previousCount: prev.size,
    nextCount: current.size,
    entered,
    dropped,
    moved,
    changed,
    unchanged: changed === 0,
    result: changed === 0 ? 'verified_unchanged' : 'updated',
  };
}

export function normalizeRefreshError(error) {
  const code = String(error?.code || 'trend_refresh_failed');
  const details = error?.details && typeof error.details === 'object' ? error.details : {};
  return {
    code,
    message: String(error?.message || 'TOP 갱신에 실패했습니다.'),
    details,
  };
}

export function assessTrendSetHealth(next = [], previous = [], diagnostics = {}, { consecutiveLow = 0, targetCount = 30 } = {}) {
  const nextCount=Array.isArray(next)?next.length:0;
  const previousCount=Array.isArray(previous)?previous.length:0;
  const target=Math.max(1,Number(targetCount||30));
  const rejected=Number(diagnostics?.rejected||0);
  const merged=Number(diagnostics?.mergedCandidates||0);
  const dominantRejectionShare=Number(diagnostics?.dominantRejectionShare||0);
  const failureCount=Number(diagnostics?.naverSignalFailures||0)+(Array.isArray(diagnostics?.errors)?diagnostics.errors.length:0);
  const incompleteTarget=nextCount<target;
  const lowCount=incompleteTarget;
  const suddenDrop=previousCount>=target&&nextCount<target;
  const massRejected=dominantRejectionShare>=0.7;
  const externalFailure=failureCount>0;
  const reasons=[];
  if(nextCount===0)reasons.push(`공개 가능한 신규 TOP이 0개`);
  else if(incompleteTarget)reasons.push(`TOP ${target}개 목표 미충족: ${nextCount}개 준비`);
  if(externalFailure)reasons.push('일부 외부 데이터 조회 실패 존재');
  if(massRejected)reasons.push('후보의 70% 이상 탈락');
  const unhealthy=incompleteTarget;
  return {
    healthy:!unhealthy,
    degraded:false,bootstrap:previousCount===0,lowCount,suddenDrop,massRejected,externalFailure,incompleteTarget,
    targetCount:target,previousCount,nextCount,failureCount,rejected,merged,dominantRejectionShare,
    consecutiveLow:unhealthy?Number(consecutiveLow||0)+1:0,
    allowMergeWithPrevious:true,
    reasons,
  };
}
export function shouldCommitProgressiveRecovery(nextCount=0, previousCount=0, targetCount=30) {
  const next=Math.max(0,Number(nextCount||0));
  const previous=Math.max(0,Number(previousCount||0));
  const target=Math.max(1,Number(targetCount||30));
  return next>0&&next<target&&previous<target&&next>previous;
}

export function isRecentTrendForCarryover(item={}, now=Date.now()) {
  const newestHours=Number(item.newestArticleHours);
  if(Number.isFinite(newestHours)&&newestHours>=0)return newestHours<=36;
  const timestamp=new Date(item.sourceNewestAt||item.updatedAt||item.publishedAt||0).getTime();
  return Number.isFinite(timestamp)&&timestamp>0&&now-timestamp<=36*60*60*1000;
}

export function mergeRecentPreviousTrends(next=[],previous=[],limit=30) {
  const result=[];
  const seen=new Set();
  for(const item of [...(Array.isArray(next)?next:[]),...(Array.isArray(previous)?previous:[])]){
    const key=identity(item);if(!key||seen.has(key))continue;
    if(result.length>=(Math.max(1,Math.min(30,Number(limit||30)))))break;
    if(result.length>=next.length&&!isRecentTrendForCarryover(item))continue;
    seen.add(key);result.push(item);
  }
  return result.map((item,index)=>({...item,rank:index+1}));
}
