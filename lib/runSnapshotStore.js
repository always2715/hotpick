export function runSnapshotKey(namespace,runId){
  return `${String(namespace||'').replace(/:$/,'')}:cron:content:${String(runId||'').trim()}`;
}

function uniqueFields(candidateId='',aliases=[]){
  return [...new Set([candidateId,...(Array.isArray(aliases)?aliases:[])].map(value=>String(value||'').trim()).filter(Boolean))];
}

export async function writeDualRunSnapshot(redis,{stageKey,snapshotKey,candidateId,aliases=[],serialized,stageTtlSec=60*60*24*14,snapshotTtlSec=60*60*24*30}={}){
  if(!redis||!stageKey||!snapshotKey||!candidateId||!serialized)throw new Error('dual snapshot write arguments are incomplete');
  const fields=uniqueFields(candidateId,aliases);
  const hashPayload=Object.fromEntries(fields.map(field=>[field,serialized]));
  const writes=await Promise.allSettled([
    redis.set(stageKey,serialized,{ex:stageTtlSec}),
    redis.hset(snapshotKey,hashPayload),
  ]);
  try{await redis.expire(snapshotKey,snapshotTtlSec);}catch{}
  let stage=null,snapshot=null,snapshotField='';
  try{stage=await redis.get(stageKey);}catch{}
  for(const field of fields){
    try{
      const value=await redis.hget(snapshotKey,field);
      if(value){snapshot=value;snapshotField=field;break;}
    }catch{}
  }
  if(!stage&&snapshot){try{await redis.set(stageKey,snapshot,{ex:stageTtlSec});stage=snapshot;}catch{}}
  if(!snapshot&&stage){
    try{
      await redis.hset(snapshotKey,hashPayload);
      await redis.expire(snapshotKey,snapshotTtlSec);
      snapshot=stage;snapshotField=candidateId;
    }catch{}
  }
  return {stage,snapshot,snapshotField,fields,writes,verified:Boolean(stage||snapshot)};
}
