export const FEED_INDEX_SCHEMA_VERSION = 4;

const HIDDEN_VISIBILITY = new Set(['hidden_feed', 'private', 'trashed']);

function asTime(value = '') {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function feedIndexItemRejectionReasons(indexed = {}, expected = {}) {
  const reasons = [];
  if (!indexed || typeof indexed !== 'object') return ['피드 인덱스 항목 없음'];

  if (Number(indexed.feedIndexSchemaVersion || 0) !== FEED_INDEX_SCHEMA_VERSION) reasons.push('피드 인덱스 스키마 불일치');
  if (!String(indexed.slug || '').trim()) reasons.push('slug 없음');
  if (expected.slug && indexed.slug !== expected.slug) reasons.push('slug 불일치');
  if (indexed.hasContent !== true) reasons.push('본문 준비 상태 누락');
  if (indexed.publicReady !== true) reasons.push('공개 준비 상태 누락');
  if (indexed.feedReady !== true) reasons.push('피드 준비 상태 누락');
  if (String(indexed.status || '') !== 'published') reasons.push('게시 상태 불일치');
  if (HIDDEN_VISIBILITY.has(String(indexed.visibility || ''))) reasons.push('피드 비공개 상태');

  const title = String(indexed.feedTitle || indexed.displayTitle || indexed.keyword || '').trim();
  const summary = String(indexed.summary || indexed.previewSummary || indexed.why || '').trim();
  if (title.length < 4) reasons.push('피드 제목 없음');
  if (summary.length < 20) reasons.push('피드 요약 없음');

  const expectedVersion = Number(expected.sourceContentVersion || expected.contentVersion || 0);
  const indexedVersion = Number(indexed.sourceContentVersion || indexed.contentVersion || 0);
  if (expectedVersion > 0 && indexedVersion !== expectedVersion) reasons.push('콘텐츠 버전 불일치');

  if (expected.category && indexed.category !== expected.category) reasons.push('카테고리 불일치');
  if (expected.feedTitle && title !== String(expected.feedTitle).trim()) reasons.push('피드 제목 갱신 필요');
  if (expected.summary && summary !== String(expected.summary).trim()) reasons.push('피드 요약 갱신 필요');

  const expectedUpdatedAt = asTime(expected.sourceUpdatedAt || expected.updatedAt || expected.generatedAt);
  const indexedUpdatedAt = asTime(indexed.sourceUpdatedAt || indexed.updatedAt || indexed.generatedAt);
  if (expectedUpdatedAt > 0 && indexedUpdatedAt < expectedUpdatedAt) reasons.push('원본 콘텐츠보다 오래된 인덱스');

  return [...new Set(reasons)];
}


export function isVisibleFeedIndexRecord(indexed = {}, includeHidden = false) {
  if (!indexed || typeof indexed !== 'object') return false;
  const hasContent = indexed.hasContent === true || indexed.hasNews === true;
  if (!hasContent || indexed.publicReady !== true || indexed.feedReady !== true) return false;
  if (String(indexed.status || '') !== 'published') return false;
  if (!includeHidden && HIDDEN_VISIBILITY.has(String(indexed.visibility || ''))) return false;
  const title = String(indexed.feedTitle || indexed.displayTitle || indexed.keyword || '').trim();
  const summary = String(indexed.summary || indexed.previewSummary || indexed.why || '').trim();
  return title.length >= 4 && summary.length >= 20;
}

export function isCurrentFeedIndexItem(indexed = {}, expected = {}) {
  return feedIndexItemRejectionReasons(indexed, expected).length === 0;
}
