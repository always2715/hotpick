export const FEED_DETAIL_MIN_CHARS = 1000;
export const FEED_DETAIL_TARGET_CHARS = 5000;
export const FEED_DETAIL_RECOMMENDED_MIN_CHARS = 3500;
export const FEED_DETAIL_RECOMMENDED_MAX_CHARS = 6000;

export function feedDetailLength(value = '') {
  return String(value || '').trim().length;
}

// v8.0.45: 1,000자는 공개 최소선입니다. 약 5,000자는 권장 목표일 뿐,
// 근거가 부족한 콘텐츠를 반복·일반론으로 늘리도록 강제하지 않습니다.
export function isFeedDetailLengthValid(value = '') {
  return feedDetailLength(value) >= FEED_DETAIL_MIN_CHARS;
}

export function isFeedDetailLengthRecommended(value = '') {
  const length = feedDetailLength(value);
  return length >= FEED_DETAIL_RECOMMENDED_MIN_CHARS && length <= FEED_DETAIL_RECOMMENDED_MAX_CHARS;
}

export function feedDetailLengthReason(value = '') {
  const length = feedDetailLength(value);
  if (length < FEED_DETAIL_MIN_CHARS) return `피드 상세 본문 ${FEED_DETAIL_MIN_CHARS.toLocaleString()}자 미만`;
  return '';
}

export function feedDetailLengthGuidance(value = '') {
  const length = feedDetailLength(value);
  if (length < FEED_DETAIL_MIN_CHARS) return 'minimum_not_met';
  if (length < FEED_DETAIL_RECOMMENDED_MIN_CHARS) return 'concise_supported';
  if (length <= FEED_DETAIL_RECOMMENDED_MAX_CHARS) return 'recommended_range';
  return 'long_but_allowed';
}
