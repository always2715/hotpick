import { getCachedTrends, queryFeedPosts } from '../../lib/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const page = Math.max(1, Math.min(100, Number(req.query.page || 1)));
  const limit = Math.max(1, Math.min(40, Number(req.query.limit || 20)));
  const category = String(req.query.category || 'all');
  const scope = ['all', 'top', 'past'].includes(String(req.query.scope)) ? String(req.query.scope) : 'all';
  const sort = ['latest', 'oldest', 'sequence', 'views'].includes(String(req.query.sort)) ? String(req.query.sort) : 'latest';
  const search = String(req.query.search || '').trim().slice(0, 80);

  try {
    const trends = await getCachedTrends();
    const topSlugs = trends.map(item => item.slug);
    const { items, total, recovered=false, errorCode='' } = await queryFeedPosts({
      limit,
      offset: (page - 1) * limit,
      category,
      scope,
      sort,
      search,
      topSlugs,
    });
    const topMap = {};
    trends.forEach(item => { topMap[item.slug] = { rank: item.rank, displayTitle: item.displayTitle || item.keyword }; });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ items, total, topMap, page, limit, recovered, errorCode });
  } catch (error) {
    return res.status(500).json({ error: error.message || '피드 조회 실패' });
  }
}
