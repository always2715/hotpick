function normalize(value='') {
  return String(value || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

function exactKeys(item={}) {
  return new Set([
    item.stableEventId,
    item.eventKey,
    item.trendKey,
    item.slug,
    item.topKeyword,
    item.keyword,
    item.displayTitle,
    ...(Array.isArray(item.identityAliases) ? item.identityAliases : []),
    ...(Array.isArray(item.keywordAliases) ? item.keywordAliases : []),
  ].map(normalize).filter(Boolean));
}

function strongKeys(item={}) {
  return new Set([item.stableEventId,item.eventKey,item.trendKey].map(normalize).filter(Boolean));
}

function keywordKeys(item={}) {
  return new Set([item.topKeyword,item.keyword,item.displayTitle].map(normalize).filter(Boolean));
}

function intersects(left=new Set(), right=new Set()) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

export function rankIdentityScore(next={}, previous={}) {
  if (intersects(strongKeys(next), strongKeys(previous))) return 100;
  const nextSlug=normalize(next.slug), previousSlug=normalize(previous.slug);
  if (nextSlug && nextSlug===previousSlug) return 95;
  if (intersects(keywordKeys(next), keywordKeys(previous))) return 85;
  if (intersects(exactKeys(next), exactKeys(previous))) return 70;
  return 0;
}

export function applyRankMovements(nextRows=[], previousRows=[]) {
  const previous=(Array.isArray(previousRows)?previousRows:[]).map((item,index)=>({...item,rank:Number(item?.rank||index+1)}));
  const used=new Set();
  return (Array.isArray(nextRows)?nextRows:[]).map((item,index)=>{
    const rank=index+1;
    let bestIndex=-1;
    let bestScore=0;
    for(let cursor=0;cursor<previous.length;cursor++){
      if(used.has(cursor))continue;
      const score=rankIdentityScore(item,previous[cursor]);
      if(score>bestScore){bestScore=score;bestIndex=cursor;}
    }
    const matched=bestIndex>=0&&bestScore>=70?previous[bestIndex]:null;
    if(matched)used.add(bestIndex);
    const previousRank=matched?Number(matched.rank||bestIndex+1):null;
    const rankChange=previousRank==null?null:previousRank-rank;
    const movementStatus=previousRank==null?'new':rankChange>0?'up':rankChange<0?'down':'same';
    return {
      ...item,
      rank,
      previousRank,
      rankChange,
      movementStatus,
      retained:previousRank!=null,
      newEntry:previousRank==null,
      previousSlug:matched?.slug||null,
      rankIdentityScore:bestScore||0,
      badge:previousRank==null?'NEW':rank<=3?'HOT':rankChange>=5?'UP':'',
    };
  });
}
