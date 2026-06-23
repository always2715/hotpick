import { requireAdmin } from '../../../lib/adminAuth';
import { getAllContents, getReviewDrafts } from '../../../lib/kv';
import { CONTENT_VERSION } from '../../../lib/api';
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!requireAdmin(req,res))return;
  const limit=Math.max(1,Math.min(1000,Number(req.query.limit||500)));
  const [contents,allReviewDrafts]=await Promise.all([getAllContents(limit),getReviewDrafts(limit)]);
  const reviewDrafts=allReviewDrafts.filter(item=>Number(item?.contentVersion||0)===CONTENT_VERSION);
  const currentContents=contents.filter(item=>Number(item?.contentVersion||0)===CONTENT_VERSION||item?.status==='published');
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({contents:currentContents,reviewDrafts,staleReviewDraftCount:Math.max(0,allReviewDrafts.length-reviewDrafts.length)});
}
