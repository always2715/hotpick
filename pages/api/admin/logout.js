import { addAudit } from '../../../lib/kv';
import { clearAdminSessionCookie } from '../../../lib/adminAuth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  clearAdminSessionCookie(res);
  await addAudit('admin_logout', '', null, null, '관리자 로그아웃', 'admin');
  return res.status(200).json({ success: true });
}
