import { isUnsplashImageUrl } from './images.js';
import { buildThumbnailPoolSeeds, THUMBNAIL_POOL_CATEGORIES, THUMBNAIL_POOL_TARGET_SIZE, THUMBNAIL_POOL_VERSION } from './thumbnailPoolCatalog.js';
import { poolItemToImageMeta, selectThumbnailFromPool, hasFixedThumbnail } from './thumbnailPool.js';
import { getThumbnailPoolState, saveThumbnailPoolState, getThumbnailUsage, recordThumbnailUsage, updateThumbnailPoolItem } from './kv.js';

const UTM='utm_source=stellate&utm_medium=referral';
function withUtm(url){if(!url)return null;return `${url}${url.includes('?')?'&':'?'}${UTM}`;}
function safeWords(value=''){return String(value||'').toLowerCase().replace(/[^0-9a-z가-힣\s-]/g,' ').replace(/\s+/g,' ').trim();}
function rejectedPhoto(photo={}){
  const metadata=safeWords(`${photo.alt_description||''} ${photo.description||''} ${(photo.tags||[]).map(tag=>tag?.title||tag?.name||'').join(' ')}`);
  const ratio=Number(photo.width||0)/Math.max(1,Number(photo.height||1));
  return ratio<1.35||/(logo|brand logo|poster|watermark|portrait|selfie|meme|text sign)/i.test(metadata);
}

async function fetchCategoryPhotos(query,page=1){
  const key=String(process.env.UNSPLASH_ACCESS_KEY||'').trim();
  if(!key)throw new Error('UNSPLASH_ACCESS_KEY가 설정되지 않았습니다.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=20&page=${page}&orientation=landscape&content_filter=high`,{headers:{Authorization:`Client-ID ${key}`,'Accept-Version':'v1'},signal:controller.signal});
    if(!response.ok)throw new Error(`Unsplash 이미지 풀 조회 실패: HTTP ${response.status}`);
    const body=await response.json();
    return (Array.isArray(body.results)?body.results:[]).filter(photo=>photo?.id&&isUnsplashImageUrl(photo?.urls?.regular||'')&&!rejectedPhoto(photo));
  }finally{clearTimeout(timer);}
}

function toPoolItem(seed,photo,previous={}){
  return {
    ...seed,
    unsplashPhotoId:photo.id,
    photographerName:photo.user?.name||'',
    photographerProfileUrl:withUtm(photo.user?.links?.html)||null,
    sourceUrl:withUtm(photo.links?.html)||null,
    unsplashPhotoUrl:withUtm(photo.links?.html)||null,
    imageUrl:photo.urls?.regular||null,
    thumbUrl:photo.urls?.small||photo.urls?.regular||null,
    downloadLocation:photo.links?.download_location||null,
    altDescription:photo.alt_description||photo.description||'',
    width:Number(photo.width||0),height:Number(photo.height||0),
    lastUsedAt:previous.lastUsedAt||null,
    usageCount:Number(previous.usageCount||0),
    enabled:previous.enabled!==false,
    reviewStatus:previous.reviewStatus||'automated-screened',
    storageMode:'unsplash-cdn',
    poolVersion:THUMBNAIL_POOL_VERSION,
  };
}

export async function bootstrapThumbnailPool({force=false}={}){
  const current=await getThumbnailPoolState();
  if(!force&&Array.isArray(current?.items)&&current.items.length>=THUMBNAIL_POOL_TARGET_SIZE){return {...current,reused:true};}
  const seeds=buildThumbnailPoolSeeds();
  const previousById=new Map((current?.items||[]).map(item=>[item.id,item]));
  const usedPhotoIds=new Set();const items=[];const failures=[];
  for(const [category,config] of Object.entries(THUMBNAIL_POOL_CATEGORIES)){
    const categorySeeds=seeds.filter(seed=>seed.category===category);
    let photos=[];
    try{
      photos=await fetchCategoryPhotos(config.query,1);
      if(photos.length<categorySeeds.length)photos=[...photos,...await fetchCategoryPhotos(config.query,2)];
    }catch(error){failures.push({category,error:String(error?.message||error)});continue;}
    const unique=photos.filter(photo=>!usedPhotoIds.has(photo.id));
    categorySeeds.forEach((seed,index)=>{
      const photo=unique[index];if(!photo)return;
      usedPhotoIds.add(photo.id);items.push(toPoolItem(seed,photo,previousById.get(seed.id)||{}));
    });
  }
  if(items.length!==THUMBNAIL_POOL_TARGET_SIZE){
    const error=new Error(`이미지 풀을 ${items.length}/${THUMBNAIL_POOL_TARGET_SIZE}개만 구성해 저장하지 않았습니다.`);error.details={items:items.length,targetSize:THUMBNAIL_POOL_TARGET_SIZE,failures};throw error;
  }
  const state={version:THUMBNAIL_POOL_VERSION,targetSize:THUMBNAIL_POOL_TARGET_SIZE,items,createdAt:current?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),failures};
  await saveThumbnailPoolState(state);
  return state;
}

export async function selectCuratedThumbnailForContent(content={},existingImageMeta=null,{usedIds=[]}={}){
  // 썸네일 저장소/API 오류가 콘텐츠 생성·검증·TOP 공개 성공 여부에 영향을 주면 안 됩니다.
  if(hasFixedThumbnail(existingImageMeta))return existingImageMeta;
  let state={items:[]};let recentUsage=[];
  try{[state,recentUsage]=await Promise.all([getThumbnailPoolState(),getThumbnailUsage(100)]);}
  catch(error){console.warn('[thumbnail pool read skipped]',error?.message||error);return null;}
  const imageMeta=selectThumbnailFromPool({content,pool:state?.items||[],recentUsage,usedIds,existingImageMeta});
  if(!imageMeta)return null;
  const slug=String(content.slug||content.stableEventId||content.eventKey||content.topKeyword||content.keyword||'').trim();
  if(slug){
    try{
      const recorded=await recordThumbnailUsage({slug,thumbnailImageId:imageMeta.thumbnailImageId,selectedAt:imageMeta.thumbnailSelectedAt,selectionType:imageMeta.thumbnailSelectionType});
      if(recorded?.recorded){
        const item=(state?.items||[]).find(row=>row.id===imageMeta.thumbnailImageId);
        if(item)await updateThumbnailPoolItem(item.id,{lastUsedAt:imageMeta.thumbnailSelectedAt,usageCount:Number(item.usageCount||0)+1});
      }
    }catch(error){console.warn('[thumbnail usage record skipped]',error?.message||error);}
  }
  return imageMeta;
}

export async function getThumbnailPoolAdminState(){
  const [state,usage]=await Promise.all([getThumbnailPoolState(),getThumbnailUsage(100)]);
  return {...(state||{version:THUMBNAIL_POOL_VERSION,targetSize:THUMBNAIL_POOL_TARGET_SIZE,items:[]}),usage};
}

export async function updateThumbnailPoolAdminItem(id,patch={}){
  const allowed={};
  if(typeof patch.enabled==='boolean')allowed.enabled=patch.enabled;
  if(patch.moodTitle!=null)allowed.moodTitle=String(patch.moodTitle||'').trim().slice(0,80);
  if(patch.category&&THUMBNAIL_POOL_CATEGORIES[patch.category])allowed.category=patch.category;
  for(const key of ['moods','subjects','usableFor','avoidFor'])if(Array.isArray(patch[key]))allowed[key]=patch[key].map(value=>String(value||'').trim()).filter(Boolean).slice(0,20);
  if(['positive','neutral','negative'].includes(String(patch.tone||'')))allowed.tone=String(patch.tone);
  allowed.reviewStatus='admin-reviewed';
  return updateThumbnailPoolItem(id,allowed);
}

export async function manualThumbnailMeta(imageId){
  const state=await getThumbnailPoolState();
  const item=(state?.items||[]).find(row=>row.id===imageId&&row.enabled!==false);
  if(!item)throw new Error('사용 가능한 이미지 풀 항목을 찾을 수 없습니다.');
  return poolItemToImageMeta(item,'manual');
}
