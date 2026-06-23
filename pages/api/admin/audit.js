import { requireAdmin } from '../../../lib/adminAuth';
import { getAuditLogs } from '../../../lib/kv';
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!requireAdmin(req,res))return;
  const limit=Math.max(1,Math.min(500,Number(req.query.limit||100)));
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({audit:await getAuditLogs(limit)});
}
