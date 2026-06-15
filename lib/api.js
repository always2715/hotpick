import Parser from 'rss-parser';
import { detectCategory, CATEGORIES } from './categories';

const parser = new Parser();

// ─── 유튜브 트렌딩 수집 ───────────────────────────────
export async function fetchYoutubeTrending() {
  const API_KEY = process.env.YOUTUBE_API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=KR&maxResults=30&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.items || []).map((item) => item.snippet.title);
}

// ─── 구글 뉴스 RSS 수집 ──────────────────────────────
export async function fetchNewsForKeyword(keyword) {
  try {
    const encoded = encodeURIComponent(keyword);
    const url = `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`;
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 5).map((item) => item.title).join('\n');
  } catch {
    return '관련 뉴스 없음';
  }
}

// ─── Unsplash 이미지 검색 ────────────────────────────
export async function fetchUnsplashImage(keyword) {
  const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!ACCESS_KEY) return null;
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${ACCESS_KEY}` } }
    );
    const data = await res.json();
    return data.results?.[0]?.urls?.regular || null;
  } catch {
    return null;
  }
}

// ─── 슬러그 변환 ─────────────────────────────────────
export function toSlug(title) {
  return title.replace(/[^\w\sㄱ-힣]/g, '').trim().replace(/\s+/g, '-');
}

// ─── Claude API 콘텐츠 생성 ──────────────────────────
export async function generateContent(keyword, news) {
  const categoryKey = detectCategory(keyword);
  const category = CATEGORIES[categoryKey];

  const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;

  async function callClaude(prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  const cardPrompt = `키워드: "${keyword}"
관련 뉴스: ${news}
아래 JSON 형식으로만 응답 (마크다운 없이 순수 JSON):
{"summary":"한줄 요약 (50자 이내)","why":"왜 지금 뜨는지 (60자 이내)","points":["핵심포인트1","핵심포인트2","핵심포인트3"]}`;

  const qaPrompt = `키워드: "${keyword}"
관련 뉴스: ${news}
아래 JSON 형식으로만 응답 (마크다운 없이 순수 JSON):
{"qa":[{"q":"질문1","a":"답변1 (80자 이내)"},{"q":"질문2","a":"답변2 (80자 이내)"},{"q":"질문3","a":"답변3 (80자 이내)"}]}`;

  const [blogText, cardRaw, qaRaw, image] = await Promise.all([
    callClaude(category.prompt(keyword, news)),
    callClaude(cardPrompt),
    callClaude(qaPrompt),
    fetchUnsplashImage(keyword),
  ]);

  let card = { summary: '', why: '', points: [] };
  let qa = { qa: [] };
  try { card = JSON.parse(cardRaw.replace(/```json|```/g, '').trim()); } catch {}
  try { qa = JSON.parse(qaRaw.replace(/```json|```/g, '').trim()); } catch {}

  return {
    keyword,
    category: categoryKey,
    categoryLabel: category.label,
    categoryColor: category.color,
    heroBg: category.heroBg,
    titleColor: category.titleColor,
    metaColor: category.metaColor,
    blog: blogText,
    card,
    qa: qa.qa || [],
    image,
    generatedAt: new Date().toISOString(),
  };
}

// ─── 캐시 (메모리 + 3시간 TTL) ──────────────────────
const cache = new Map();
const CACHE_TTL = 3 * 60 * 60 * 1000;

export async function getCachedContent(keyword) {
  const cached = cache.get(keyword);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  const news = await fetchNewsForKeyword(keyword);
  const content = await generateContent(keyword, news);
  cache.set(keyword, { data: content, timestamp: Date.now() });
  return content;
}

// ─── 트렌드 캐시 ─────────────────────────────────────
let trendCache = null;
let trendCacheTime = 0;

export async function getTrends() {
  if (trendCache && Date.now() - trendCacheTime < CACHE_TTL) return trendCache;
  const titles = await fetchYoutubeTrending();
  const trends = titles.map((title, i) => ({
    rank: i + 1,
    keyword: title,
    slug: toSlug(title),
    category: detectCategory(title),
    badge: i < 3 ? 'HOT' : Math.random() > 0.7 ? 'NEW' : Math.random() > 0.5 ? 'UP' : '',
  }));
  trendCache = trends;
  trendCacheTime = Date.now();
  return trends;
}
