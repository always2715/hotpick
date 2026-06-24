import { requireAdmin } from '../../../lib/adminAuth';
import { getThumbnailPoolAdminState } from '../../../lib/thumbnailPoolService.js';

export default async function handler(req,res){
  if(!requireAdmin(req,res))return;
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    res.setHeader('Cache-Control','private, no-store');
    return res.status(200).json(await getThumbnailPoolAdminState());
  }catch(error){return res.status(500).json({error:String(error?.message||'이미지 풀 조회 실패')});}
}
