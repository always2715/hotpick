function clean(value=''){
  return String(value||'').replace(/\s+/g,' ').trim();
}

function summaryOf(item={},title=''){
  const card=item?.card||{};
  const candidates=[card.listSummary,card.summary,item.previewSummary,item.listSummary,item.previewDetailSummary,item.summary,card.why,item.previewWhy,item.why,...(Array.isArray(card.points)?card.points:[])];
  for(const candidate of candidates){
    const text=clean(candidate);
    if(text.length>=20)return text.slice(0,220);
  }
  const keyword=clean(item.topKeyword||item.keyword||item.displayTitle||title||'해당 이슈');
  return `${keyword} 관련 상세 콘텐츠에서 확인된 핵심 내용을 정리했습니다.`.slice(0,220);
}

export function emergencyFeedRowsFromTrends(trends=[],options={}){
  if(options.scope==='past')return[];
  const category=String(options.category||'all');
  const search=clean(options.search).toLowerCase();
  const rows=(Array.isArray(trends)?trends:[]).filter(item=>item?.slug).map((item,index)=>{
    const title=clean(item.feedTitle||item.displayTitle||item.topTitle||item.keyword||item.topKeyword);
    if(!title)return null;
    const summary=summaryOf(item,title);
    return {
      ...item,
      rank:Number(item.rank||index+1),
      slug:item.slug,
      keyword:item.keyword||item.topKeyword||title,
      displayTitle:item.displayTitle||item.topTitle||title,
      feedTitle:title,
      previewSummary:summary,
      summary,
      why:item.previewWhy||item.why||'',
      category:item.category||'general',
      image:item.thumbnail||item.image||null,
      thumbnail:item.thumbnail||item.image||null,
      generatedAt:item.generatedAt||item.updatedAt||new Date().toISOString(),
      updatedAt:item.updatedAt||item.generatedAt||new Date().toISOString(),
      feedSeq:Number(item.feedSeq||0),
      status:'published',visibility:'published',hasContent:true,publicReady:true,feedReady:true,
      emergencyTopFeedRow:true,
    };
  }).filter(Boolean).filter(item=>{
    if(category!=='all'&&item.category!==category)return false;
    if(search){
      const haystack=clean(`${item.feedTitle} ${item.displayTitle} ${item.keyword} ${item.summary}`).toLowerCase();
      if(!haystack.includes(search))return false;
    }
    return true;
  });
  const sort=String(options.sort||'latest');
  return rows.sort((a,b)=>{
    if(sort==='oldest')return new Date(a.updatedAt||0)-new Date(b.updatedAt||0);
    if(sort==='sequence')return Number(b.feedSeq||0)-Number(a.feedSeq||0);
    if(sort==='views')return Number(b.viewCount||0)-Number(a.viewCount||0);
    return new Date(b.updatedAt||0)-new Date(a.updatedAt||0);
  });
}

export function guaranteeFeedPage({items=[],total=0,trends=[],limit=20,offset=0,...options}={}){
  const safeItems=Array.isArray(items)?items.filter(Boolean):[];
  if(safeItems.length)return{items:safeItems,total:Math.max(Number(total||0),safeItems.length),emergency:false};
  const fallback=emergencyFeedRowsFromTrends(trends,options);
  const safeLimit=Math.max(1,Math.min(100,Number(limit||20)));
  const safeOffset=Math.max(0,Number(offset||0));
  const page=fallback.slice(safeOffset,safeOffset+safeLimit);
  return{items:page,total:fallback.length,emergency:page.length>0};
}
