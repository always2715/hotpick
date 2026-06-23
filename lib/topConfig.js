// Public ranking size is centralized here so selection, staging, publication,
// feed recovery, admin UI, and public pages cannot drift to different counts.
export const PUBLIC_TOP_COUNT = 20;
export const PUBLIC_TOP10_COUNT = 10;
export const TOP_LABEL = `TOP${PUBLIC_TOP_COUNT}`;
export const TOP_POLICY_VERSION = 'fixed_keyword_content_v16_top20';

export function clampPublicTopCount(value = PUBLIC_TOP_COUNT) {
  return Math.max(1, Math.min(PUBLIC_TOP_COUNT, Number(value || PUBLIC_TOP_COUNT)));
}
