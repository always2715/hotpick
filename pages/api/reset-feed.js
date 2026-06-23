import { resetFeed } from '../../lib/kv';
import { requireAdmin } from '../../lib/adminAuth';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  if (req.body?.confirmed !== true) return res.status(409).json({ error:'관리자 확인 화면에서 최종 실행을 눌러야 합니다.', confirmationRequired:true });
  try {
    const count = await resetFeed({ confirmation: req.body?.confirmation, createBackup: true });
    return res.json({ success: true, count });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
}
