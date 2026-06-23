function stableCandidateHash(value='') {
  let hash=2166136261;
  for(const ch of String(value||'')){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36).slice(0,8);
}

export function taskIdentity(trend={}, index=0) {
  return String(trend.candidateId||`r${Number(trend.rank||index+1)}-${stableCandidateHash(`${trend.slug||''}|${trend.eventKey||''}|${trend.displayTitle||trend.keyword||''}`)}`);
}

export function stageIdentity(runId, trend={}, index=0) {
  return String(trend.publicationStageId||`${runId}:${taskIdentity(trend,index)}`);
}

export function taskMapByCandidate(tasks=[]) {
  return new Map((Array.isArray(tasks)?tasks:[]).map(task=>[String(task.candidateId||task.slug),task]));
}

export function prepareSelectedTopCandidates(items=[], runId='run', targetCount=30) {
  const usedSlugs=new Set();
  return (Array.isArray(items)?items:[]).slice(0,targetCount).map((item,index)=>{
    const rank=index+1;
    const baseSlug=String(item?.slug||'').trim()||`topic-${rank}`;
    let slug=baseSlug;
    if(usedSlugs.has(slug)){
      const suffix=stableCandidateHash(`${item?.eventKey||''}|${item?.displayTitle||item?.keyword||''}|${rank}`);
      slug=`${baseSlug}-${suffix}`;
      let serial=2;
      while(usedSlugs.has(slug))slug=`${baseSlug}-${suffix}-${serial++}`;
    }
    usedSlugs.add(slug);
    const candidateId=`r${rank}-${stableCandidateHash(`${slug}|${item?.eventKey||''}|${item?.displayTitle||item?.keyword||''}`)}`;
    return {...item,originalSlug:item?.originalSlug||baseSlug,slug,rank,candidateId,publicationStageId:`${runId}:${candidateId}`};
  });
}
