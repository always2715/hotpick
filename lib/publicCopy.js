const WINDOW_PATTERNS = [
  /최근\s*36\s*시간\s*(?:자료|정보|보도|콘텐츠)(?:에서|를|을|만)?/gi,
  /최근\s*36\s*시간\s*(?:이내|내에?|안에|동안|기준(?:으로)?)/gi,
  /최근\s*36\s*시간/gi,
  /36\s*시간\s*(?:이내|내에?|안에|동안|기준(?:으로)?|범위|조사)/gi,
];

export function sanitizePublicText(value = '') {
  let text = String(value || '');
  text = text.replace(WINDOW_PATTERNS[0], '확인된 자료에서');
  for (const pattern of WINDOW_PATTERNS.slice(1)) text = text.replace(pattern, '');
  return text
    .replace(/[ \t]+([,.;!?])/g, '$1')
    .replace(/([.!?])\s*([.!?])+/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/^\s*[,·:;-]\s*/g, '')
    .trim();
}

export function containsPublicResearchWindow(value = '') {
  return /(?:최근\s*)?36\s*시간(?:\s*(?:이내|내에?|안에|동안|기준))?/i.test(String(value || ''));
}

export function sanitizePublicContent(content = {}) {
  const card = content?.card || {};
  const onlineTrend = content?.onlineTrend || {};
  return {
    ...content,
    topTitle: sanitizePublicText(content?.topTitle),
    displayTitle: sanitizePublicText(content?.displayTitle),
    feedTitle: sanitizePublicText(content?.feedTitle),
    feedHeadline: sanitizePublicText(content?.feedHeadline),
    detailTitle: sanitizePublicText(content?.detailTitle),
    blog: sanitizePublicText(content?.blog),
    card: {
      ...card,
      feedTitle: sanitizePublicText(card?.feedTitle),
      previewLabel: sanitizePublicText(card?.previewLabel),
      detailTitle: sanitizePublicText(card?.detailTitle),
      summary: sanitizePublicText(card?.summary),
      why: sanitizePublicText(card?.why),
      points: (Array.isArray(card?.points) ? card.points : []).map(sanitizePublicText).filter(Boolean),
    },
    qa: (Array.isArray(content?.qa) ? content.qa : []).map(item => ({
      ...item,
      q: sanitizePublicText(item?.q),
      a: sanitizePublicText(item?.a),
    })),
    instagramCards: (Array.isArray(content?.instagramCards) ? content.instagramCards : []).map(item => ({
      ...item,
      headline: sanitizePublicText(item?.headline),
      body: sanitizePublicText(item?.body),
    })),
    instagramCaption: sanitizePublicText(content?.instagramCaption),
    onlineTrend: {
      ...onlineTrend,
      summary: sanitizePublicText(onlineTrend?.summary),
      notice: sanitizePublicText(onlineTrend?.notice),
    },
  };
}
