import { saveSNSSettings, getSNSSettings } from '../../lib/kv';
import { requireAdmin } from '../../lib/adminAuth';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method === 'POST') {
    const { twitterAuto, telegramAuto } = req.body;
    await saveSNSSettings({ twitterAuto, telegramAuto });
    return res.status(200).json({ success: true });
  }
  if (req.method === 'GET') return res.status(200).json(await getSNSSettings());
  return res.status(405).json({ error: 'Method not allowed' });
}
