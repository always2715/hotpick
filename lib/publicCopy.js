const WINDOW_PATTERNS = [
  /최근\s*36\s*시간\s*(?:자료|정보|보도|콘텐츠)(?:에서|를|을|만)?/gi,
  /최근\s*36\s*시간\s*(?:이내|내에?|안에|동안|기준(?:으로)?)/gi,
  /최근\s*36\s*시간/gi,
  /36\s*시간\s*(?:이내|내에?|안에|동안|기준(?:으로)?|범위|조사)/gi,
];

// 독자용 정보가 아니라 생성·검증 과정을 설명하는 내부 문구입니다.
// 기존 Redis 콘텐츠에도 이미 들어 있을 수 있어 생성 시점뿐 아니라 조회 시점에도 제거합니다.
const PUBLIC_META_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.(?:com|co\.kr|go\.kr|or\.kr|net|org|kr)\s*(?:의|에서|자료에)[^.?!]*(?:공개 자료와 연결된|확인할 수 있는 내용을 기준으로|행동[·\s]*대상[·\s]*조건을 중심으로|정리했습니다|설명했습니다)/i,
  /공개 자료와 연결된\s*(?:기본정보|현재 이슈)/i,
  /본문은\s*주체[·\s]*행동[·\s]*대상[·\s]*조건을[^.?!]*(?:정리|확인)/i,
  /(?:이|그|해당)\s*자료에서\s*확인되는\s*범위로만\s*정리/i,
  /자료에\s*없는\s*(?:원인|전망|평가|결과)[^.?!]*(?:덧붙이지|확정하지)/i,
  /(?:같은|해당)\s*출처의\s*(?:원문|최신 안내|후속 공지)/i,
  /(?:다른 사건|동명이인)[^.?!]*섞이지 않도록/i,
  /공개 자료에 없는[^.?!]*(?:평가|결과)[^.?!]*확정하지/i,
  /기본정보는\s*현재 이슈와\s*섞지 않고/i,
  /현재 이슈는\s*공개 자료에서\s*확인되는/i,
  /여러\s*확인 자료의\s*표현이\s*다를 수 있어/i,
  /본문에\s*없는\s*인과관계나\s*향후 결과/i,
  /독자가\s*확인할\s*내용은\s*공개된\s*(?:일정|수치|조건)/i,
  /추가 발표가 없는 부분은 확정하지/i,
  /출처에\s*제시된\s*(?:일정|조건)/i,
  /표현이\s*다른\s*자료가\s*있더라도\s*공통으로\s*확인되는/i,
  /확인되지 않은 해석은 사실처럼 쓰지/i,
  /(?:원문|후속 공지|최신 안내)[^.?!]*(?:확인할 수|다시 확인)/i,
  /(?:출처|자료|원문|후속 공지|최신 안내|공식\s*(?:사이트|홈페이지|페이지)|기사|보도)[^.?!]*(?:확인할 수 있습니다|확인 가능합니다|확인 가능|확인하세요)/i,
  /세부\s*(?:조건|일정|적용 범위)[^.?!]*(?:확인할 수 있습니다|확인 가능합니다|확인 가능|확인하세요)/i,
  /(?:위|해당|이)\s*기사는\s*언론이\s*기본적으로/i,
  /언론이\s*기본적으로\s*가져야\s*할\s*객관적인\s*정보제공/i,
  /(?:Fact\s*Ledger|claimIds|source\s*fetch|출처\s*URL|검증\s*절차|생성\s*정책)/i,
  /(?:자료|출처)[^.?!]{0,80}(?:기준으로|중심으로)\s*(?:정리|설명)했습니다/i,
];

function decodeNumericEntity(match, decimal, hex) {
  const value = Number.parseInt(decimal || hex, hex ? 16 : 10);
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return ' ';
  try { return String.fromCodePoint(value); } catch { return ' '; }
}

export function decodePublicEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&ensp;|&#8194;|&#x2002;/gi, ' ')
    .replace(/&emsp;|&#8195;|&#x2003;/gi, ' ')
    .replace(/&thinsp;|&#8201;|&#x2009;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);|&#x([0-9a-f]+);/gi, decodeNumericEntity)
    .replace(/[\u00a0\u2002\u2003\u2009]/g, ' ');
}

function normalizedPlainText(value = '') {
  return decodePublicEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u200b\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function containsPublicMetaCopy(value = '') {
  const text = normalizedPlainText(value);
  if (!text) return false;
  return PUBLIC_META_PATTERNS.some(pattern => pattern.test(text));
}

function splitSentences(value = '') {
  const text = String(value || '').trim();
  if (!text) return [];
  const protectedText=text.replace(/(?:[a-z0-9-]+\.)+[a-z]{2,}/gi,domain=>domain.replace(/\./g,'∯'));
  return protectedText
    .replace(/([.!?])(?=[0-9A-Za-z가-힣])/g, '$1 ')
    .split(/(?<=[.!?])\s+/)
    .map(row => row.replace(/∯/g,'.').trim())
    .filter(Boolean);
}

export function stripPublicMetaSentences(value = '') {
  const decoded = normalizedPlainText(value);
  if (!decoded) return '';
  const rows = splitSentences(decoded);
  if (rows.length <= 1) return containsPublicMetaCopy(decoded) ? '' : decoded;
  return rows.filter(row => !containsPublicMetaCopy(row)).join(' ').trim();
}

function sanitizeLine(value = '') {
  let text = stripPublicMetaSentences(value);
  text = text.replace(WINDOW_PATTERNS[0], '확인된 자료에서');
  for (const pattern of WINDOW_PATTERNS.slice(1)) text = text.replace(pattern, '');
  return text
    .replace(/[ \t]+([,.;!?])/g, '$1')
    .replace(/([.!?])\s*([.!?])+/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^\s*[,·:;-]\s*/g, '')
    .trim();
}

export function sanitizePublicText(value = '') {
  const lines = decodePublicEntities(value).replace(/\r\n?/g, '\n').split('\n');
  const sanitized = [];
  for (const raw of lines) {
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const text = sanitizeLine(heading[2]);
      if (text) sanitized.push(`${heading[1]} ${text}`);
      continue;
    }
    const bullet = raw.match(/^([-*•])\s+(.*)$/);
    if (bullet) {
      const text = sanitizeLine(bullet[2]);
      if (text) sanitized.push(`${bullet[1]} ${text}`);
      continue;
    }
    const text = sanitizeLine(raw);
    if (text) sanitized.push(text);
    else if (sanitized.length && sanitized[sanitized.length - 1] !== '') sanitized.push('');
  }
  return sanitized.join('\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*[,·:;-]\s*/g, '')
    .trim();
}

function sanitizeParagraph(paragraph) {
  if (typeof paragraph === 'string') return sanitizePublicText(paragraph);
  if (!paragraph || typeof paragraph !== 'object') return null;
  const text = sanitizePublicText(paragraph.text || '');
  return text ? { ...paragraph, text } : null;
}

function sanitizeSection(section = {}) {
  const heading = sanitizePublicText(section?.heading || section?.title || '');
  const paragraphs = (Array.isArray(section?.paragraphs) ? section.paragraphs : [])
    .map(sanitizeParagraph)
    .filter(Boolean);
  if (!heading && !paragraphs.length) return null;
  return { ...section, ...(section.heading !== undefined ? { heading } : {}), ...(section.title !== undefined ? { title: heading } : {}), paragraphs };
}

export function sanitizeSourceDisplayText(value = '', fallback = '') {
  let text = sanitizePublicText(value)
    .replace(/^(?:출처|자료|언론사)\s*[:：]\s*/i, '')
    .replace(/\s*[|｜]\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return fallback;
  const fragments = text.split(/[.·]\s*/).map(row => row.trim()).filter(Boolean);
  const unique = [];
  for (let fragment of fragments) {
    const words=fragment.split(/\s+/).filter(Boolean);
    if(words.length>1&&words.every(word=>word===words[0]))fragment=words[0];
    const key = fragment.toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
    if (!key || unique.some(row => row.key === key)) continue;
    unique.push({ key, value: fragment });
  }
  text = unique.map(row => row.value).join(' · ').trim();
  return text || fallback;
}

export function containsPublicResearchWindow(value = '') {
  return /(?:최근\s*)?36\s*시간(?:\s*(?:이내|내에?|안에|동안|기준))?/i.test(String(value || ''));
}

export function sanitizePublicContent(content = {}) {
  const card = content?.card || {};
  const onlineTrend = content?.onlineTrend || {};
  const sections = (Array.isArray(content?.sections) ? content.sections : []).map(sanitizeSection).filter(Boolean);
  const intro = content?.intro && typeof content.intro === 'object'
    ? sanitizeParagraph(content.intro)
    : sanitizePublicText(content?.intro || '');
  return {
    ...content,
    topTitle: sanitizePublicText(content?.topTitle),
    topTopic: sanitizePublicText(content?.topTopic),
    displayTitle: sanitizePublicText(content?.displayTitle),
    feedTitle: sanitizePublicText(content?.feedTitle),
    feedHeadline: sanitizePublicText(content?.feedHeadline),
    detailTitle: sanitizePublicText(content?.detailTitle),
    summary: sanitizePublicText(content?.summary),
    why: sanitizePublicText(content?.why),
    blog: sanitizePublicText(content?.blog),
    intro,
    sections,
    card: {
      ...card,
      feedTitle: sanitizePublicText(card?.feedTitle),
      previewLabel: sanitizePublicText(card?.previewLabel),
      infoLine: sanitizePublicText(card?.infoLine),
      summaryLabel: sanitizePublicText(card?.summaryLabel),
      pointsLabel: sanitizePublicText(card?.pointsLabel),
      ctaLabel: sanitizePublicText(card?.ctaLabel),
      detailTitle: sanitizePublicText(card?.detailTitle),
      lead: sanitizePublicText(card?.lead),
      context: sanitizePublicText(card?.context),
      summary: sanitizePublicText(card?.summary),
      why: sanitizePublicText(card?.why),
      listSummary: sanitizePublicText(card?.listSummary),
      summaryParagraphs: (Array.isArray(card?.summaryParagraphs) ? card.summaryParagraphs : []).map(sanitizePublicText).filter(Boolean),
      points: (Array.isArray(card?.points) ? card.points : []).map(sanitizePublicText).filter(Boolean),
    },
    qa: (Array.isArray(content?.qa) ? content.qa : []).map(item => ({
      ...item,
      q: sanitizePublicText(item?.q),
      a: sanitizePublicText(item?.a),
    })).filter(item => item.q && item.a),
    instagramCards: (Array.isArray(content?.instagramCards) ? content.instagramCards : []).map(item => ({
      ...item,
      headline: sanitizePublicText(item?.headline),
      body: sanitizePublicText(item?.body),
    })).filter(item => item.headline || item.body),
    instagramCaption: sanitizePublicText(content?.instagramCaption),
    onlineTrend: {
      ...onlineTrend,
      summary: sanitizePublicText(onlineTrend?.summary),
      notice: sanitizePublicText(onlineTrend?.notice),
    },
  };
}
