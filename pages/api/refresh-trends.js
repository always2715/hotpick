import { requireAdmin } from '../../lib/adminAuth';
import { enqueueTrendRefresh } from '../../lib/jobs';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  if (req.body?.confirmed !== true) return res.status(409).json({ error:'관리자 확인 화면에서 최종 실행을 눌러야 합니다.', confirmationRequired:true });
  try {
    const queued = await enqueueTrendRefresh({ trigger: 'admin' });
    return res.status(202).json({ success: true, accepted: true, runId: queued.runId, qstashMessageId: queued.messageId });
  } catch (error) {
    return res.status(503).json({ success: false, error: error.message });
  }
}
