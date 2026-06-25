import { requireAdmin } from '../../../lib/adminAuth';
import { getAdminRunSnapshot, getCronRuns, getTrendRefreshHealth, getTrendsUpdatedAt, getActiveTrendRefreshRunId, getCumulativeFeedStats } from '../../../lib/kv';
import { qstashConfigured, getSiteUrl } from '../../../lib/qstash';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!requireAdmin(req,res))return;
  const includeTasks=req.query.includeTasks==='1';
  const [runs,refreshHealth,trendsUpdatedAt,activeRunId,cumulativeFeed]=await Promise.all([
    includeTasks?getAdminRunSnapshot(20):getCronRuns(20),
    getTrendRefreshHealth(),
    getTrendsUpdatedAt(),
    getActiveTrendRefreshRunId(),
    getCumulativeFeedStats(),
  ]);
  const runtime={
    redisConfigured:Boolean(String(process.env.UPSTASH_REDIS_REST_URL||'').trim()&&String(process.env.UPSTASH_REDIS_REST_TOKEN||'').trim()),
    qstashConfigured:qstashConfigured(),
    cronSecretConfigured:Boolean(String(process.env.CRON_SECRET||'').trim()),
    anthropicConfigured:Boolean(String(process.env.ANTHROPIC_API_KEY||'').trim()),
    naverConfigured:Boolean(String(process.env.NAVER_CLIENT_ID||'').trim()&&String(process.env.NAVER_CLIENT_SECRET||'').trim()),
    siteUrl:getSiteUrl(),
    cronMode:'external',
    cronEndpoint:`${getSiteUrl()}/api/cron`,
  };
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({runs,refreshHealth,trendsUpdatedAt,activeRunId,cumulativeFeed,runtime});
}
