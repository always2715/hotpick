import {
  startTrendRefreshRun,
  executeTrendRefreshBatch,
  executeTrendRefreshRetryBatch,
  finalizeTrendRefreshRun,
} from '../../../lib/trendRefreshJob';
import { verifyQStashRequest } from '../../../lib/qstash';

export const config = {
  maxDuration: 300,
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    ({ body } = await verifyQStashRequest(req));
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Invalid QStash signature' });
  }

  const runId = String(body?.runId || '');
  const trigger = String(body?.trigger || 'external_cron');
  const phase = String(body?.phase || 'start');
  const cursor = Math.max(0, Number(body?.cursor || 0));
  if (!runId) return res.status(400).json({ error: 'runId가 필요합니다.' });

  try {
    let result;
    if (phase === 'batch') {
      result = await executeTrendRefreshBatch(runId, cursor, { actor:'qstash', trigger });
    } else if (phase === 'retry') {
      result = await executeTrendRefreshRetryBatch(runId, cursor, { actor:'qstash', trigger });
    } else if (phase === 'finalize') {
      result = await finalizeTrendRefreshRun(runId, { actor:'qstash', trigger });
    } else {
      result = await startTrendRefreshRun(runId, { actor:'qstash', trigger });
    }
    return res.status(result?.accepted ? 202 : 200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      runId,
      phase,
      cursor,
      code: error.code || 'trend_refresh_failed',
      error: error.message,
      details: error.details || {},
    });
  }
}
