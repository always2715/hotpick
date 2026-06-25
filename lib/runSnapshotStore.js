export function runSnapshotKey(namespace,runId){
  return `${String(namespace||'').replace(/:$/,'')}:cron:content:${String(runId||'').trim()}`;
}

function uniqueFields(candidateId='',aliases=[]){
  return [...new Set([candidateId,...(Array.isArray(aliases)?aliases:[])].map(value=>String(value||'').trim()).filter(Boolean))];
}

export async function writeDualRunSnapshot(redis,{stageKey,snapshotKey,candidateId,aliases=[],serialized,stageTtlSec=60*60*24*14,snapshotTtlSec=60*60*24*30,retries=3}={}){
  if(!redis||!stageKey||!snapshotKey||!candidateId||!serialized)throw new Error('dual snapshot write arguments are incomplete');
  const fields=uniqueFields(candidateId,aliases);
  const hashPayload=Object.fromEntries(fields.map(field=>[field,serialized]));
  const maxAttempts=Math.max(1,Math.min(5,Number(retries||3)));
  let lastWrites=[];
  let stage=null,snapshot=null,snapshotField='';
  let verifiedFields=[];

  for(let attempt=1;attempt<=maxAttempts;attempt++){
    lastWrites=await Promise.allSettled([
      redis.set(stageKey,serialized,{ex:stageTtlSec}),
      redis.hset(snapshotKey,hashPayload),
    ]);
    try{await redis.expire(snapshotKey,snapshotTtlSec);}catch{}

    try{stage=await redis.get(stageKey);}catch{}
    snapshot=null;snapshotField='';verifiedFields=[];
    for(const field of fields){
      try{
        const value=await redis.hget(snapshotKey,field);
        if(value){
          verifiedFields.push(field);
          if(!snapshot){snapshot=value;snapshotField=field;}
        }
      }catch{}
    }

    // 둘 중 하나만 성공한 경우 같은 시도 안에서 반대쪽과 모든 alias를 자가 복구합니다.
    if(!stage&&snapshot){try{await redis.set(stageKey,snapshot,{ex:stageTtlSec});stage=await redis.get(stageKey);}catch{}}
    if(stage&&verifiedFields.length<fields.length){
      try{
        await redis.hset(snapshotKey,hashPayload);
        await redis.expire(snapshotKey,snapshotTtlSec);
        verifiedFields=[];
        for(const field of fields){const value=await redis.hget(snapshotKey,field);if(value)verifiedFields.push(field);}
        if(!snapshot){snapshot=stage;snapshotField=candidateId;}
      }catch{}
    }

    if(stage&&snapshot&&verifiedFields.includes(candidateId)&&fields.filter(field=>field!==candidateId).every(field=>verifiedFields.includes(field))){
      return {stage,snapshot,snapshotField,fields,verifiedFields,writes:lastWrites,verified:true,attempts:attempt};
    }
    if(attempt<maxAttempts)await new Promise(resolve=>setTimeout(resolve,120*attempt));
  }
  return {stage,snapshot,snapshotField,fields,verifiedFields,writes:lastWrites,verified:Boolean(stage||snapshot),fullyVerified:false,attempts:maxAttempts};
}

