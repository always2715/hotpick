import { requireAdmin } from '../../../lib/adminAuth';
import { getTrendCandidateReport, getTrendRules } from '../../../lib/kv';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!requireAdmin(req,res))return;
  const [latest,preview,rules]=await Promise.all([getTrendCandidateReport('latest'),getTrendCandidateReport('preview'),getTrendRules()]);
  res.setHeader('Cache-Control','private, no-store');
  return res.json({latest,preview,rules});
}
