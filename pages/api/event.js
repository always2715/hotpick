import { recordEvent } from '../../lib/kv';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const allowed = new Set(['top_click','feed_click','detail_view','share','source_click','card_download','youtube_click','related_news_click','related_content_click']);
    if (!allowed.has(body.type)) return res.status(400).json({ error:'invalid event' });
    await recordEvent(body.type, String(body.slug || '').slice(0, 100));
    return res.status(204).end();
  } catch { return res.status(204).end(); }
}
