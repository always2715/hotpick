import { isUnsplashImageUrl } from './images.js';
import { THUMBNAIL_POOL_VERSION, RECENT_THUMBNAIL_REUSE_WINDOW } from './thumbnailPoolCatalog.js';

function text(value=''){return String(value||'').toLowerCase().replace(/\s+/g,' ').trim();}
function list(value){return Array.isArray(value)?value.map(v=>String(v||'').trim()).filter(Boolean):[];}
function includesAny(haystack,terms=[]){return terms.some(term=>haystack.includes(String(term).toLowerCase()));}
function stableNumber(value=''){return [...String(value||'')].reduce((sum,char)=>((sum*33)+char.codePointAt(0))>>>0,5381);}

const POOL_CATEGORY_RULES=[
  ['environment',['태풍','폭우','집중호우','홍수','침수','산불','폭염','기후','재난','지진','화재','storm','flood','wildfire','climate']],
  ['health_education',['병원','의료','건강','질병','백신','학교','교육','수능','강의','연구실','과학 연구','hospital','medical','education']],
  ['global',['국제','글로벌','해외','외교','무역','국경','세계','공항','항공','global','international','trade']],
  ['politics',['정부','국회','대통령','장관','정책','법안','행정','선거','투표','규제','법원','검찰','경찰','government','policy']],
  ['sports',['축구','야구','농구','배구','골프','경기','선수','우승','리그','월드컵','sports','football','baseball']],
  ['culture',['가수','배우','연예','공연','콘서트','영화','드라마','방송','앨범','컴백','아이돌','concert','cinema']],
  ['tech_ai',['인공지능','생성형 ai','챗gpt','chatgpt','클로드','gemini','데이터센터','서버','클라우드','사이버','해킹','앱','소프트웨어','ai','technology']],
  ['corporate',['기업','회사','공장','생산','물류','반도체','제조','실적','산업','삼성전자','현대차','business','factory']],
  ['finance',['주가','증시','코스피','코스닥','환율','금리','투자','금융','은행','대출','물가','비트코인','시장','finance','stock']],
  ['society',['도시','시민','교통','출퇴근','주거','소비','생활','인구','공공시설']],
];

export function determineThumbnailPoolCategory(content={}){
  const haystack=text(`${content.topTitle||''} ${content.feedTitle||''} ${content.detailTitle||''} ${content.topKeyword||content.keyword||''} ${content.card?.summary||''} ${content.blog||''}`);
  for(const [category,terms] of POOL_CATEGORY_RULES){if(includesAny(haystack,terms))return category;}
  const appCategory=String(content.category||'general');
  return ({economy:'finance',tech:'tech_ai',ai:'tech_ai',entertainment:'culture',sports:'sports',travel:'global',politics:'politics',life:'society',general:'society'})[appCategory]||'society';
}

const MOOD_RULES=[
  ['긴급',['긴급','경고','비상','주의보','속보']],
  ['사고',['사고','재난','피해','침수','화재','산불','태풍','폭우']],
  ['하락',['하락','급락','감소','부진','위기','손실','적자','불안','변동성','부담','혼잡']],
  ['논란',['논란','갈등','충돌','수사','조사','기소','재판']],
  ['규제',['규제','정책','법안','대책','제도','행정']],
  ['발표',['발표','공개','출시','선보','개최','브리핑','컴백']],
  ['성장',['상승','급등','증가','성장','개선','회복','흥행','우승','기록']],
  ['분석',['분석','전망','예상','데이터','지표','실적']],
  ['변화',['변화','전환','개편','교체','확대','축소','이동']],
];

export function buildThumbnailContext(content={}){
  const raw=text(`${content.topTitle||''} ${content.feedTitle||''} ${content.detailTitle||''} ${content.topKeyword||content.keyword||''} ${content.card?.summary||''} ${content.card?.why||''} ${(content.card?.points||[]).join(' ')} ${content.blog||''}`);
  const moods=MOOD_RULES.filter(([,terms])=>includesAny(raw,terms)).map(([mood])=>mood);
  if(!moods.length)moods.push('일반');
  const tone=includesAny(raw,['하락','급락','위기','사고','재난','피해','논란','갈등','수사','경고','긴급','불안','변동성','부담','적자','혼잡'])?'negative'
    :includesAny(raw,['상승','성장','개선','회복','흥행','축하','우승','출시'])?'positive':'neutral';
  const subjects=[...new Set(raw.split(/[^0-9a-z가-힣]+/).filter(word=>word.length>=2).slice(0,40))];
  return {category:determineThumbnailPoolCategory(content),moods,subjects,tone,raw,slug:content.slug||'',eventId:content.stableEventId||content.eventKey||content.slug||''};
}

function overlapCount(left=[],right=[]){
  const a=list(left).map(text);const b=list(right).map(text);
  return a.reduce((sum,value)=>sum+(b.some(other=>other.includes(value)||value.includes(other))?1:0),0);
}

export function scoreThumbnailPoolItem(item={},context={},options={}){
  if(item.enabled===false||!item.id||!isUnsplashImageUrl(item.imageUrl||item.thumbUrl||''))return -9999;
  const recentIds=new Set(options.recentIds||[]);const usedIds=new Set(options.usedIds||[]);
  let score=0;
  if(item.category===context.category)score+=50;
  score+=Math.min(20,overlapCount(item.moods,context.moods)*10);
  score+=Math.min(15,overlapCount(item.subjects,context.subjects)*5);
  if(item.tone&&item.tone===context.tone)score+=10;
  if(overlapCount(item.usableFor,[...context.moods,...context.subjects])>0)score+=10;
  if(overlapCount(item.avoidFor,[...context.moods,...context.subjects])>0)score-=50;
  if(recentIds.has(item.id))score-=30;
  if(Number(item.usageCount||0)>=5)score-=Math.min(20,10+Math.floor(Number(item.usageCount||0)/10)*2);
  if(usedIds.has(item.id))score-=1000;
  return score;
}

export function poolItemToImageMeta(item={},selectionType='curated-pool',selectedAt=new Date().toISOString()){
  if(!item||!isUnsplashImageUrl(item.imageUrl||item.thumbUrl||''))return null;
  return {
    id:item.unsplashPhotoId||item.id,
    source:'unsplash',
    imageUrl:item.imageUrl,
    thumbUrl:item.thumbUrl||item.imageUrl,
    photographerName:item.photographerName||'',
    photographerProfileUrl:item.photographerProfileUrl||null,
    unsplashPhotoUrl:item.unsplashPhotoUrl||item.sourceUrl||null,
    downloadLocation:item.downloadLocation||null,
    altDescription:item.altDescription||'',
    tags:[...new Set([...(item.moods||[]),...(item.subjects||[])])].slice(0,12),
    imageConfidence:Number(item.selectionScore||0),
    imageReason:`사전 검수 이미지 풀 · ${item.categoryLabel||item.category||''} · ${item.moodTitle||''}`,
    selectorVersion:THUMBNAIL_POOL_VERSION,
    thumbnailImageId:item.id,
    thumbnailCategory:item.categoryLabel||item.category||'',
    thumbnailPoolCategory:item.category||'',
    thumbnailMood:item.moodTitle||'',
    thumbnailSelectedAt:selectedAt,
    thumbnailSelectionType:selectionType,
    poolVersion:THUMBNAIL_POOL_VERSION,
  };
}

export function hasFixedThumbnail(imageMeta={}){
  return Boolean(imageMeta&&isUnsplashImageUrl(imageMeta.imageUrl||imageMeta.thumbUrl||''));
}

export function selectThumbnailFromPool({content={},pool=[],recentUsage=[],usedIds=[],existingImageMeta=null}={}){
  if(hasFixedThumbnail(existingImageMeta))return {...existingImageMeta,preserved:true};
  const context=buildThumbnailContext(content);
  const recentIds=recentUsage.slice(0,RECENT_THUMBNAIL_REUSE_WINDOW).map(row=>row.thumbnailImageId||row.id).filter(Boolean);
  const rank=(rows,allowRecent=false)=>rows.filter(item=>allowRecent||!recentIds.includes(item.id)).map(item=>({...item,selectionScore:scoreThumbnailPoolItem(item,context,{recentIds:allowRecent?[]:recentIds,usedIds})}))
    .filter(item=>item.selectionScore>-900)
    .sort((a,b)=>b.selectionScore-a.selectionScore||Number(a.usageCount||0)-Number(b.usageCount||0)||new Date(a.lastUsedAt||0)-new Date(b.lastUsedAt||0)||stableNumber(`${context.eventId}:${a.id}`)-stableNumber(`${context.eventId}:${b.id}`));
  const enabled=Array.isArray(pool)?pool.filter(item=>item&&item.enabled!==false):[];
  let ranked=rank(enabled.filter(item=>item.category===context.category),false);
  if(!ranked.length)ranked=rank(enabled.filter(item=>item.category===context.category),true);
  if(!ranked.length)ranked=rank(enabled.filter(item=>item.category==='society'),false);
  if(!ranked.length)ranked=rank(enabled,true);
  const selected=ranked[0];
  if(!selected)return null;
  return poolItemToImageMeta(selected,'curated-pool');
}
