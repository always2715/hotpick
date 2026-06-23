import crypto from 'crypto';
import { getQStashClient, getSiteUrl, qstashConfigured } from './qstash';
import { createCronRun, patchCronRun, initializeCronRunTasks, addAudit } from './kv';
import { compactTrendPayload, contentTierForTrend } from './topContentPolicy';

export { contentTierForTrend, selectTopContentCandidates } from './topContentPolicy';

function cleanPart(value = '') {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function makeRunId(trigger = 'cron') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = crypto.randomBytes(4).toString('hex');
  return `${cleanPart(trigger) || 'cron'}-${stamp}-${random}`;
}

function dedupeId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}


function compactTrend(trend = {}) {
  return compactTrendPayload(trend);
}


export async function createTrendRefreshRun({ trigger = 'external_cron' } = {}) {
  const runId = makeRunId(trigger);
  await createCronRun({ runId, trigger, status: 'queued' });
  await addAudit('trend_refresh_queued', '', null, { runId, trigger }, 'TOP 갱신 실행 준비', trigger === 'admin' ? 'admin' : 'external_cron');
  return { runId };
}

export async function enqueueTrendRefreshStep({ runId, trigger = 'external_cron', phase = 'start', cursor = 0 } = {}) {
  if (!qstashConfigured()) throw new Error('QStash 환경변수 3개가 설정되지 않았습니다.');
  if (!runId) throw new Error('runId가 필요합니다.');
  const safePhase = ['start','batch','retry','finalize'].includes(String(phase)) ? String(phase) : 'start';
  const safeCursor = Math.max(0, Number(cursor || 0));
  const response = await getQStashClient().publishJSON({
    url: `${getSiteUrl()}/api/jobs/update-trends`,
    body: { runId, trigger, phase:safePhase, cursor:safeCursor },
    deduplicationId: dedupeId(['update-trends-v831', runId, cleanPart(trigger)||'external_cron', safePhase, String(safeCursor)]),
    retries: 4,
    timeout: '300s',
    flowControl: {
      key: `stellate-trend-refresh-${runId}`,
      parallelism: 1,
      rate: 12,
      period: '1m',
    },
    label: ['stellate', 'update-trends', safePhase],
  });
  await patchCronRun(runId, {
    nextPhase:safePhase,
    nextCursor:safeCursor,
    lastQStashMessageId:response.messageId || '',
    lastQueuedAt:new Date().toISOString(),
  });
  return response;
}

export async function enqueueTrendRefresh({ trigger = 'external_cron' } = {}) {
  if (!qstashConfigured()) {
    throw new Error('QStash 환경변수 3개가 설정되지 않았습니다.');
  }

  const { runId } = await createTrendRefreshRun({ trigger });

  try {
    const response = await enqueueTrendRefreshStep({ runId, trigger, phase:'start', cursor:0 });
    await patchCronRun(runId, {
      status: 'queued',
      qstashMessageId: response.messageId || '',
      queuedAt: new Date().toISOString(),
    });
    return { runId, messageId: response.messageId || '' };
  } catch (error) {
    await patchCronRun(runId, {
      status: 'failed',
      error: error.message || 'QStash 작업 등록 실패',
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export async function enqueueContentJobs(runId, trends = []) {
  if (!qstashConfigured()) throw new Error('QStash 환경변수가 설정되지 않았습니다.');
  const safeTrends = (Array.isArray(trends) ? trends : [])
    .filter(item => item?.slug && item?.keyword)
    .map(item => ({ ...item, contentTier: contentTierForTrend(item) }))
    .filter(item => item.contentTier !== 'none');
  await initializeCronRunTasks(runId, safeTrends);

  if (safeTrends.length === 0) {
    await patchCronRun(runId, {
      status: 'completed',
      queued: 0,
      completed: 0,
      finishedAt: new Date().toISOString(),
    });
    return [];
  }

  const endpoint = `${getSiteUrl()}/api/jobs/generate-content`;
  const requests = safeTrends.map(trend => ({
    url: endpoint,
    body: { runId, trend: compactTrend(trend) },
    deduplicationId: dedupeId(['generate-content', runId, trend.slug]),
    retries: 3,
    timeout: '300s',
    flowControl: {
      key: 'stellate-content-generation',
      parallelism: 2,
      rate: 6,
      period: '1m',
    },
    label: ['stellate', 'generate-content'],
  }));

  const responses = await getQStashClient().batchJSON(requests);
  await patchCronRun(runId, {
    status: 'processing',
    queued: safeTrends.length,
    contentMessageIds: responses.map(item => item.messageId).filter(Boolean).join(','),
  });
  return responses;
}

export async function enqueueTelegramTop10(trends = []) {
  if (!qstashConfigured() || !process.env.CRON_SECRET) return null;
  return getQStashClient().publishJSON({
    url: `${getSiteUrl()}/api/telegram`,
    body: { type: 'top10', trends },
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    retries: 2,
    timeout: '30s',
    label: ['stellate', 'telegram'],
  });
}

export async function enqueueMissingContentJobs(trends = [], { trigger = 'admin_missing_feed' } = {}) {
  const safeTrends = (Array.isArray(trends) ? trends : [])
    .filter(item => item?.slug && item?.keyword)
    .map(item => ({ ...item, contentTier: contentTierForTrend(item) }))
    .filter(item => item.contentTier !== 'none');
  const runId = makeRunId(trigger);
  await createCronRun({ runId, trigger, status: 'queued' });
  await addAudit('missing_content_queued', '', null, { runId, count: safeTrends.length }, '피드·상세 누락 콘텐츠 QStash 등록', 'admin');
  const responses = await enqueueContentJobs(runId, safeTrends);
  return { runId, count: safeTrends.length, messageIds: responses.map(item => item.messageId).filter(Boolean) };
}

export async function enqueueSelectedContentJobs(trends = [], { trigger = 'admin_selected_retry' } = {}) {
  return enqueueMissingContentJobs(trends, { trigger });
}
