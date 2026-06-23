import { getCachedContent, toSlug } from '../../lib/api';
import { getCachedTrends, getContent } from '../../lib/kv';
import { detectCategoryDetailed } from '../../lib/categories';
import { isInternalRequest, requireAdminOrInternal } from '../../lib/adminAuth';
import { contentTierForTrend } from '../../lib/topContentPolicy';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdminOrInternal(req, res)) return;

  const slugParam = String(req.query.slug || req.body?.slug || '');
  const keywordParam = String(req.query.keyword || req.body?.keyword || '');
  const force = req.body?.force !== false;
  if (force && !isInternalRequest(req) && req.body?.confirmed !== true) {
    return res.status(409).json({ success:false, error:'관리자 확인 화면에서 최종 실행을 눌러야 합니다.', confirmationRequired:true });
  }
  if (!slugParam && !keywordParam) return res.status(400).json({ success: false, error: 'slug 또는 keyword가 필요합니다.' });

  try {
    const trends = await getCachedTrends({ includeHidden: true });
    let trend = trends.find(item => item.slug === slugParam || item.keyword === keywordParam || item.displayTitle === keywordParam);
    if (trend) trend = { ...trend, contentTier: contentTierForTrend(trend), topEligible: true };
    if (!trend && slugParam) {
      const existing = await getContent(slugParam, { includePrivate: true });
      if (existing) trend = {
        slug: slugParam, keyword: existing.keyword || existing.displayTitle, rawKeyword: existing.rawKeyword || existing.keyword,
        displayTitle: existing.displayTitle || existing.keyword, searchQuery: existing.searchQuery || existing.displayTitle || existing.keyword,
        category: existing.category, categoryConfidence: existing.categoryConfidence, categoryReason: existing.categoryReason,
        qualityScore: existing.qualityScore || 60, rankingScore: existing.rankingScore, rankingGrade: existing.rankingGrade, rank: existing.rank, contentTier: existing.contentTier, topEligible: existing.topEligible === true, imageMeta: existing.imageMeta || null,
      };
    }
    if (!trend && keywordParam) {
      const category = detectCategoryDetailed(keywordParam, '');
      trend = {
        keyword: keywordParam,
        rawKeyword: keywordParam,
        displayTitle: keywordParam,
        searchQuery: keywordParam,
        slug: toSlug(keywordParam),
        category: category.category,
        categoryConfidence: category.confidence,
        categoryReason: category.reason,
        qualityScore: 60,
        imageMeta: null,
      };
    }
    if (!trend) return res.status(404).json({ success: false, error: 'TOP 또는 피드 항목을 찾을 수 없습니다.' });

    const content = await getCachedContent(
      trend.slug,
      trend.keyword,
      trend.imageMeta || null,
      trend,
      { force }
    );
    return res.status(200).json({ success: true, content });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || '콘텐츠 생성 실패' });
  }
}
