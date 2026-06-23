import { requireAdmin } from '../../../lib/adminAuth';
import { getCachedTrends, getTrendsUpdatedAt } from '../../../lib/kv';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!requireAdmin(req,res))return;
  const [trends,updatedAt]=await Promise.all([
    getCachedTrends({includeHidden:true}),
    getTrendsUpdatedAt(),
  ]);
  res.setHeader('Cache-Control','private, no-store');
  return res.status(200).json({trends:Array.isArray(trends)?trends:[],updatedAt:updatedAt||null});
}
