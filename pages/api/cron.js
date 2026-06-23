import { isInternalRequest } from '../../lib/adminAuth';
import { acquireLock, releaseLock } from '../../lib/kv';
import { enqueueTrendRefresh } from '../../lib/jobs';
import { qstashConfigured } from '../../lib/qstash';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isInternalRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!qstashConfigured()) {
    return res.status(503).json({ accepted: false, error: 'QStash 환경변수가 설정되지 않았습니다.' });
  }

  const locked = await acquireLock('cron-dispatch', 120);
  if (locked === null) {
    return res.status(503).json({ accepted: false, error: 'Redis 잠금 생성에 실패했습니다.' });
  }
  if (!locked) {
    return res.status(202).json({
      accepted: true,
      duplicate: true,
      message: '이미 크론 등록 작업이 진행 중입니다.',
    });
  }

  try {
    const queued = await enqueueTrendRefresh({ trigger: 'external_cron' });
    return res.status(202).json({
      accepted: true,
      runId: queued.runId,
      qstashMessageId: queued.messageId,
      message: '검증 이슈 갱신 작업을 QStash에 등록했습니다.',
    });
  } catch (error) {
    return res.status(503).json({
      accepted: false,
      error: error.message || 'QStash 작업 등록 실패',
    });
  } finally {
    await releaseLock('cron-dispatch');
  }
}
