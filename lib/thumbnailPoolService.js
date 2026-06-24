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
function usablePoolItem(item={}){
  return Boolean(item?.id&&item?.enabled!==false&&isUnsplashImageUrl(item.imageUrl||item.thumbUrl||'')&&item.unsplashPhotoId);
}
function usablePoolItems(state={}){return (Array.isArray(state?.items)?state.items:[]).filter(usablePoolItem);}
function categoryQueries(config={}){
  const base=String(config.query||'').trim();
  return [...new Set([base,`${base} wide angle editorial landscape`,`${base} professional detail close up`,`${base} night editorial background`,`${base} minimal clean news background`].filter(Boolean))];
}

async function fetchCategoryPhotos(query,page=1){
  const key=String(process.env.UNSPLASH_ACCESS_KEY||'').trim();
  if(!key)throw new Error('UNSPLASH_ACCESS_KEY가 설정되지 않았습니다.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=30&page=${page}&orientation=landscape&content_filter=high`,{headers:{Authorization:`Client-ID ${key}`,'Accept-Version':'v1'},signal:controller.signal});
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

export async function bootstrapThumbnailPool({force=false,fast=false}={}){
  const current=await getThumbnailPoolState();
  const currentUsable=usablePoolItems(current);
  if(!force&&currentUsable.length>=THUMBNAIL_POOL_TARGET_SIZE){return {...current,items:currentUsable,reused:true,complete:true};}
  const seeds=buildThumbnailPoolSeeds();
  const previousById=new Map((current?.items||[]).map(item=>[item.id,item]));
  const selectedBySeed=new Map();
  const usedPhotoIds=new Set();
  if(!force){
    for(const item of currentUsable){selectedBySeed.set(item.id,item);usedPhotoIds.add(item.unsplashPhotoId);}
  }
  const failures=[];
  const entries=Object.entries(THUMBNAIL_POOL_CATEGORIES).map(([category,config])=>({
    category,config,seeds:seeds.filter(seed=>seed.category===category),
  })).filter(entry=>entry.seeds.some(seed=>!selectedBySeed.has(seed.id)));

  // 자동 준비는 카테고리별 2페이지를 병렬 조회합니다. 최대 20회 요청으로 카테고리당 50개,
  // 전체 500개를 한 번에 확보하는 것을 목표로 하며 TOP 순위 계산과는 완전히 분리됩니다.
  const firstPass=await Promise.all(entries.map(async entry=>{
    const query=categoryQueries(entry.config)[0];
    try{
      const settled=await Promise.allSettled([fetchCategoryPhotos(query,1),fetchCategoryPhotos(query,2)]);
      const photos=settled.filter(result=>result.status==='fulfilled').flatMap(result=>result.value||[]);
      const errors=settled.filter(result=>result.status==='rejected').map(result=>String(result.reason?.message||result.reason));
      return {...entry,photos,error:errors.join(' / ')};
    }catch(error){return {...entry,photos:[],error:String(error?.message||error)};}
  }));

  for(const result of firstPass){
    if(result.error)failures.push({category:result.category,error:result.error,phase:'parallel_first_pass'});
    const missing=result.seeds.filter(seed=>!selectedBySeed.has(seed.id));
    const photos=[];
    for(const photo of result.photos||[]){
      if(usedPhotoIds.has(photo.id)||photos.some(row=>row.id===photo.id))continue;
      photos.push(photo);
      if(photos.length>=missing.length)break;
    }
    missing.forEach((seed,index)=>{
      const photo=photos[index];if(!photo)return;
      usedPhotoIds.add(photo.id);selectedBySeed.set(seed.id,toPoolItem(seed,photo,previousById.get(seed.id)||{}));
    });
  }

  // 관리자 전체 구축은 첫 패스로 채우지 못한 슬롯만 제한적으로 추가 조회합니다.
  if(!fast){
    for(const {category,config,seeds:categorySeeds} of entries){
      let missingSeeds=categorySeeds.filter(seed=>!selectedBySeed.has(seed.id));
      if(!missingSeeds.length)continue;
      const queries=categoryQueries(config);
      // Unsplash 데모 요금제의 일반적인 시간당 요청 한도를 넘지 않도록 전체 구축도 최대 50회 요청으로 제한합니다.
      // 첫 패스 20회 + 카테고리별 추가 3회(총 30회)이며, 부족분은 다음 구축 실행에서 이어서 보충합니다.
      const attempts=[[queries[0],3],[queries[1],1],[queries[2],1]].filter(([query])=>query);
      for(const [query,page] of attempts){
        let fetched=[];
        try{fetched=await fetchCategoryPhotos(query,page);}
        catch(error){failures.push({category,error:String(error?.message||error),phase:'fill_missing'});continue;}
        for(const photo of fetched){
          if(!missingSeeds.length)break;
          if(usedPhotoIds.has(photo.id))continue;
          const seed=missingSeeds.shift();
          usedPhotoIds.add(photo.id);selectedBySeed.set(seed.id,toPoolItem(seed,photo,previousById.get(seed.id)||{}));
        }
        if(!missingSeeds.length)break;
      }
    }
  }

  for(const {category,seeds:categorySeeds} of entries){
    const missingAfter=categorySeeds.filter(seed=>!selectedBySeed.has(seed.id)).map(seed=>seed.id);
    if(missingAfter.length)failures.push({category,error:`missing_slots:${missingAfter.join(',')}`});
  }
  const order=new Map(seeds.map((seed,index)=>[seed.id,index]));
  const items=[...selectedBySeed.values()].filter(usablePoolItem).sort((a,b)=>Number(order.get(a.id)??999)-Number(order.get(b.id)??999));
  if(!items.length){
    const error=new Error('Unsplash 사전 이미지 풀을 한 건도 구성하지 못했습니다. UNSPLASH_ACCESS_KEY와 API 제한을 확인하세요.');
    error.details={items:0,targetSize:THUMBNAIL_POOL_TARGET_SIZE,failures};
    throw error;
  }
  const complete=items.length>=THUMBNAIL_POOL_TARGET_SIZE;
  const state={version:THUMBNAIL_POOL_VERSION,targetSize:THUMBNAIL_POOL_TARGET_SIZE,items,complete,createdAt:current?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),failures};
  await saveThumbnailPoolState(state);
  return state;
}

export async function ensureThumbnailPoolReady({force=false}={}){
  let state=await getThumbnailPoolState();
  let usable=usablePoolItems(state);
  if(!force&&usable.length>=THUMBNAIL_POOL_TARGET_SIZE)return {...state,items:usable,ready:true,complete:true,bootstrapped:false};
  if(!String(process.env.UNSPLASH_ACCESS_KEY||'').trim()){
    return {...state,items:usable,ready:usable.length>0,complete:usable.length>=THUMBNAIL_POOL_TARGET_SIZE,bootstrapped:false,reason:'UNSPLASH_ACCESS_KEY_MISSING'};
  }
  try{
    state=await bootstrapThumbnailPool({force,fast:true});
    usable=usablePoolItems(state);
    return {...state,items:usable,ready:usable.length>0,complete:usable.length>=THUMBNAIL_POOL_TARGET_SIZE,bootstrapped:true};
  }catch(error){
    state=await getThumbnailPoolState();usable=usablePoolItems(state);
    return {...state,items:usable,ready:usable.length>0,complete:usable.length>=THUMBNAIL_POOL_TARGET_SIZE,bootstrapped:false,reason:String(error?.message||error),errorDetails:error?.details||null};
  }
}

export async function selectCuratedThumbnailForContent(content={},existingImageMeta=null,{usedIds=[]}={}){
  // 썸네일 저장소/API 오류가 콘텐츠 생성·검증·TOP 공개 성공 여부에 영향을 주면 안 됩니다.
  if(hasFixedThumbnail(existingImageMeta))return existingImageMeta;
  let state={items:[]};let recentUsage=[];
  try{
    [state,recentUsage]=await Promise.all([getThumbnailPoolState(),getThumbnailUsage(100)]);
    if(!usablePoolItems(state).length){
      const ensured=await ensureThumbnailPoolReady();
      if(ensured?.ready)state=ensured;
    }
  }
  catch(error){console.warn('[thumbnail pool read/bootstrap skipped]',error?.message||error);return null;}
  const imageMeta=selectThumbnailFromPool({content,pool:usablePoolItems(state),recentUsage,usedIds,existingImageMeta});
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
