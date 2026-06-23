import { contentIsReady } from './contentArchitecture.js';
import { isPublicContentReady } from './publicationPolicy.js';

export function feedDraftIsReady(content = {}) {
  const title = String(content?.card?.feedTitle || content?.feedTitle || content?.displayTitle || content?.topTitle || '').trim();
  const summary = String(content?.card?.summary || content?.summary || '').trim();
  return Boolean(
    contentIsReady(content)
    && content?.titleReady === true
    && title.length >= 4
    && summary.length >= 25
    && isPublicContentReady({ ...content, status: 'published', visibility: 'published' })
  );
}
