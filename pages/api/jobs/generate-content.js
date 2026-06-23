import { getCachedContent } from '../../../lib/api';
import { getContent, updateCronRunTask, CONTENT_STATUS, addAudit } from '../../../lib/kv';
import { verifyQStashRequest } from '../../../lib/qstash';

export const config = {
  maxDuration: 300,
  api: { bodyParser: false },
};

function retryAttempt(req) {
  const value = req.headers['upstash-retried'];
  const parsed = Number(Array.isArray(value) ? value[0] : value || 0);
  return Number.isFinite(parsed) ? parsed + 1 : 1;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    ({ body } = await verifyQStashRequest(req));
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Invalid QStash signature' });
  }

  const runId = String(body?.runId || '');
  const trend = body?.trend || {};
  const slug = String(trend.slug || '');
  const attempts = retryAttempt(req);
  if (!runId || !slug || !trend.keyword) {
    return res.status(400).json({ error: 'runId와 trend 정보가 필요합니다.' });
  }

  await updateCronRunTask(runId, slug, {
    title: trend.displayTitle || trend.keyword,
    status: 'processing',
    attempts,
    startedAt: new Date().toISOString(),
    error: '',
  });

  try {
    const before = await getContent(slug, { includePrivate: true });
    const content = await getCachedContent(
      slug,
      trend.keyword,
      trend.imageMeta || null,
      trend,
      { checkForUpdates: true }
    );

    if (content?.status === CONTENT_STATUS.FAILED) {
      const message = content.lastError || content.aiError || '콘텐츠 생성 실패';
      await updateCronRunTask(runId, slug, {
        status: 'failed',
        attempts,
        error: message,
        finishedAt: new Date().toISOString(),
      });
      await addAudit('content_generation_failed', slug, null, { runId, attempts }, '', 'qstash', 'failed', message);
      return res.status(500).json({ success: false, runId, slug, error: message });
    }


    if (content?.status === CONTENT_STATUS.REVIEW_REQUIRED) {
      const message = (content.publicationReasons || []).join(' / ') || '자동 검증 후 관리자 검토가 필요합니다.';
      await updateCronRunTask(runId, slug, {
        status: 'review', attempts, error: message,
        generatedAt: content.generatedAt || '', finishedAt: new Date().toISOString(),
      });
      await addAudit('content_review_required', slug, null, { runId, attempts, qualityScore: content.qualityScore, reasons: content.publicationReasons || [] }, message, 'qstash');
      return res.status(200).json({ success: true, runId, slug, result: 'review' });
    }

    if (!(content?.hasContent ?? content?.hasNews)) {
      await updateCronRunTask(runId, slug, {
        status: 'pending',
        attempts,
        error: content?.lastError || '확인 가능한 사실 자료와 관심도 신호가 부족합니다.',
        finishedAt: new Date().toISOString(),
      });
      return res.status(200).json({ success: true, runId, slug, result: 'pending' });
    }

    const reused = Boolean(before?.generatedAt && before.generatedAt === content.generatedAt);
    const result = reused ? 'reused' : 'generated';
    await updateCronRunTask(runId, slug, {
      status: result,
      attempts,
      generatedAt: content.generatedAt || '',
      finishedAt: new Date().toISOString(),
      error: '',
    });
    await addAudit('content_generation_completed', slug, null, { runId, result, attempts }, '', 'qstash');
    return res.status(200).json({ success: true, runId, slug, result });
  } catch (error) {
    await updateCronRunTask(runId, slug, {
      status: 'failed',
      attempts,
      error: error.message || '콘텐츠 작업 실패',
      finishedAt: new Date().toISOString(),
    });
    return res.status(500).json({ success: false, runId, slug, error: error.message });
  }
}
