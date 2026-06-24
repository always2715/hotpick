export const TOP_PREVIEW_MAX_CHARS = 1000;

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimAtSentence(value = '', max = 200) {
  const text = clean(value);
  if (text.length <= max) return text;
  const rows = text.split(/(?<=[.!?다요])\s+/).map(clean).filter(Boolean);
  let output = '';
  for (const row of rows) {
    const next = `${output} ${row}`.trim();
    if (next.length > max) break;
    output = next;
  }
  return (output || text).slice(0, max).trim();
}

export function compactTopPreviewContent({ summary = '', why = '', points = [] } = {}, maxChars = TOP_PREVIEW_MAX_CHARS) {
  const limit = Math.max(300, Number(maxChars || TOP_PREVIEW_MAX_CHARS));
  const safeSummary = trimAtSentence(summary, Math.min(360, Math.floor(limit * 0.38)));
  const safeWhy = trimAtSentence(why, Math.min(260, Math.floor(limit * 0.27)));
  const rows = (Array.isArray(points) ? points : []).map(value => trimAtSentence(value, 110)).filter(Boolean).slice(0, 5);

  let used = safeSummary.length + safeWhy.length;
  const safePoints = [];
  for (const row of rows) {
    const remaining = limit - used;
    if (remaining < 24) break;
    const point = trimAtSentence(row, Math.min(100, remaining));
    if (!point) continue;
    safePoints.push(point);
    used += point.length;
  }

  return {
    summary: safeSummary,
    why: safeWhy,
    points: safePoints,
    characterCount: safeSummary.length + safeWhy.length + safePoints.reduce((total, value) => total + value.length, 0),
    maxChars: limit,
  };
}
