export function runSnapshotKey(namespace,runId){
  return `${String(namespace||'').replace(/:$/,'')}:cron:content:${String(runId||'').trim()}`;
}

export async function writeDualRunSnapshot(redis,{stageKey,snapshotKey,candidateId,serialized,stageTtlSec=60*60*24*14,snapshotTtlSec=60*60*24*30}={}){
  if(!redis||!stageKey||!snapshotKey||!candidateId||!serialized)throw new Error('dual snapshot write arguments are incomplete');
  const writes=await Promise.allSettled([
    redis.set(stageKey,serialized,{ex:stageTtlSec}),
    redis.hset(snapshotKey,{[candidateId]:serialized}),
  ]);
  try{await redis.expire(snapshotKey,snapshotTtlSec);}catch{}
  let stage=null,snapshot=null;
  try{stage=await redis.get(stageKey);}catch{}
  try{snapshot=await redis.hget(snapshotKey,candidateId);}catch{}
  if(!stage&&snapshot){try{await redis.set(stageKey,snapshot,{ex:stageTtlSec});stage=snapshot;}catch{}}
  if(!snapshot&&stage){try{await redis.hset(snapshotKey,{[candidateId]:stage});await redis.expire(snapshotKey,snapshotTtlSec);snapshot=stage;}catch{}}
  return {stage,snapshot,writes,verified:Boolean(stage||snapshot)};
}
