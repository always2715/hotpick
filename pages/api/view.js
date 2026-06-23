import { incrementView, getViewCount } from '../../lib/kv';
const BOT_PATTERN=/bot|crawler|spider|slurp|bingpreview|facebookexternalhit|kakaotalk-scrap|yeti/i;
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const slug=String(body.slug||'').slice(0,120);
  if(!slug)return res.status(400).json({error:'slug required'});
  if(BOT_PATTERN.test(String(req.headers['user-agent']||'')))return res.status(200).json({views:await getViewCount(slug),counted:false});
  const sessionId=String(body.sessionId||'').slice(0,80);
  const count=await incrementView(slug,sessionId);
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({views:count,counted:true});
}
