// Public ranking and generation pool sizes are centralized here so selection,
// staging, publication, feed recovery, admin UI, and public pages cannot drift.
export const PUBLIC_TOP_COUNT = 20;
export const TOP_GENERATION_POOL_COUNT = 25;
export const PUBLIC_TOP10_COUNT = 10;
export const TOP_LABEL = `TOP${PUBLIC_TOP_COUNT}`;
export const TOP_POOL_LABEL = `TOP${TOP_GENERATION_POOL_COUNT} 후보 풀`;
export const TOP_POLICY_VERSION = 'ranked_candidate_pool_v17_top20_from25';

export function clampPublicTopCount(value = PUBLIC_TOP_COUNT) {
  return Math.max(1, Math.min(PUBLIC_TOP_COUNT, Number(value || PUBLIC_TOP_COUNT)));
}

export function clampGenerationPoolCount(value = TOP_GENERATION_POOL_COUNT) {
  return Math.max(PUBLIC_TOP_COUNT, Math.min(TOP_GENERATION_POOL_COUNT, Number(value || TOP_GENERATION_POOL_COUNT)));
}
