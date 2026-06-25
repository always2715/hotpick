export const FEED_DETAIL_MIN_CHARS = 1000;
export const FEED_DETAIL_TARGET_CHARS = 5000;
export const FEED_DETAIL_RECOMMENDED_MIN_CHARS = 3500;
export const FEED_DETAIL_RECOMMENDED_MAX_CHARS = 6000;

function visibleBlogText(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^##\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .trim();
}

// v8.0.56: 분량은 실제 피드 화면에 노출되는 텍스트 전체를 기준으로 계산합니다.
// 메인 제목, 핵심 요약, 포인트, 소제목, 본문, Q&A와 그 사이 공백·줄바꿈을 포함합니다.
// Markdown 표식(##, 목록 기호)은 화면에 그대로 보이지 않으므로 글자 수에서 제외합니다.
export function feedDetailPublicText(value = '', title = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const card = value.card || {};
    const mainTitle = String(
      value.detailTitle ||
      value.feedTitle ||
      value.topTitle ||
      card.detailTitle ||
      card.feedTitle ||
      value.displayTitle ||
      title ||
      ''
    ).trim();
    const summaryRows = [
      card.summary || card.lead || '',
      card.why || card.context || '',
      ...(Array.isArray(card.points) ? card.points : []),
    ];
    const qaRows = (Array.isArray(value.qa) ? value.qa : [])
      .flatMap(row => [row?.q || '', row?.a || '']);

    return [
      mainTitle,
      ...summaryRows,
      visibleBlogText(value.blog || ''),
      ...qaRows,
    ]
      .map(row => String(row || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  const mainTitle = String(title || '').trim();
  return [mainTitle, visibleBlogText(value)]
    .filter(Boolean)
    .join('\n\n');
}

export function feedDetailLength(value = '', title = '') {
  return feedDetailPublicText(value, title).length;
}

export function isFeedDetailLengthValid(value = '', title = '') {
  return feedDetailLength(value, title) >= FEED_DETAIL_MIN_CHARS;
}

export function isFeedDetailLengthRecommended(value = '', title = '') {
  const length = feedDetailLength(value, title);
  return length >= FEED_DETAIL_RECOMMENDED_MIN_CHARS && length <= FEED_DETAIL_RECOMMENDED_MAX_CHARS;
}

export function feedDetailLengthReason(value = '', title = '') {
  const length = feedDetailLength(value, title);
  if (length < FEED_DETAIL_MIN_CHARS) {
    return `피드 공개 텍스트 ${FEED_DETAIL_MIN_CHARS.toLocaleString()}자 미만`;
  }
  return '';
}

export function feedDetailLengthGuidance(value = '', title = '') {
  const length = feedDetailLength(value, title);
  if (length < FEED_DETAIL_MIN_CHARS) return 'minimum_not_met';
  if (length < FEED_DETAIL_RECOMMENDED_MIN_CHARS) return 'concise_supported';
  if (length <= FEED_DETAIL_RECOMMENDED_MAX_CHARS) return 'recommended_range';
  return 'long_but_allowed';
}
