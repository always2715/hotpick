const HIDDEN_VISIBILITY = new Set(['hidden_feed', 'private', 'trashed']);

function titleOf(value = {}) {
  return String(value?.card?.feedTitle || value?.feedTitle || value?.displayTitle || value?.topTitle || value?.keyword || '').trim();
}

function summaryOf(value = {}) {
  return String(value?.card?.listSummary || value?.card?.summary || value?.previewSummary || value?.summary || value?.why || '').trim();
}

function bodyOf(value = {}) {
  const sectionText = Array.isArray(value?.sections)
    ? value.sections.map(section => `${section?.title || ''} ${section?.body || section?.content || ''}`).join(' ')
    : '';
  return String(value?.blog || value?.detailBody || value?.body || sectionText || '').trim();
}

export function hasUsablePersistedFeedShape(value = {}, { requireBody = false } = {}) {
  const statusPublished = String(value?.status || '') === 'published';
  const hasContent = value?.hasContent === true
    || value?.hasNews === true
    || (requireBody && bodyOf(value).length >= 40)
    || (!requireBody && statusPublished);
  if (!hasContent) return false;
  if (titleOf(value).length < 4 || summaryOf(value).length < 20) return false;
  if (requireBody && bodyOf(value).length < 40) return false;
  return true;
}

export function isPersistedPublishedContentForFeed(content = {}) {
  if (!content || typeof content !== 'object') return false;
  if (String(content.status || '') !== 'published') return false;
  if (HIDDEN_VISIBILITY.has(String(content.visibility || 'published'))) return false;
  return hasUsablePersistedFeedShape(content, { requireBody: true });
}

export function upgradeTrustedPersistedFeedRecord(item = {}) {
  if (!item || typeof item !== 'object') return item;
  const hidden = HIDDEN_VISIBILITY.has(String(item.visibility || 'published'));
  const structurallyUsable = !hidden && hasUsablePersistedFeedShape(item, { requireBody: false });
  if (!structurallyUsable) return item;
  const status = String(item.status || 'published');
  if (status !== 'published') return item;
  return {
    ...item,
    status: 'published',
    visibility: item.visibility || 'published',
    hasContent: true,
    publicReady: item.publicReady === true || structurallyUsable,
    feedReady: item.feedReady === true || structurallyUsable,
    recoveredPublishedFeed: item.publicReady !== true || item.feedReady !== true ? true : item.recoveredPublishedFeed,
  };
}
