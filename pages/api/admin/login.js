import { addAudit } from '../../../lib/kv';
import { adminAuthConfigured, createAdminToken, setAdminSessionCookie, verifyAdminPassword } from '../../../lib/adminAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!adminAuthConfigured()) return res.status(503).json({ error: 'ADMIN_PASSWORD와 SESSION_SECRET을 먼저 설정해 주세요.' });
  if (!verifyAdminPassword(req.body?.password)) return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  setAdminSessionCookie(res, createAdminToken());
  await addAudit('admin_login', '', null, null, '관리자 로그인', 'admin');
  return res.status(200).json({ success: true });
}
