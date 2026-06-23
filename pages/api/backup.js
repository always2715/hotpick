import { exportBackup } from '../../lib/kv';
import { requireAdmin } from '../../lib/adminAuth';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const backup = await exportBackup();
  res.setHeader('Content-Disposition', `attachment; filename="stellate-v7.4.1-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify(backup, null, 2));
}
