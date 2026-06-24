import { getCachedTrends, getContent, updatePublishedThumbnailFields } from './kv.js';
import { isUnsplashImageMeta } from './images.js';
import { selectCuratedThumbnailForContent } from './thumbnailPoolService.js';

function fixedImageMeta(content={},trend={}){
  if(isUnsplashImageMeta(content?.imageMeta))return content.imageMeta;
  if(isUnsplashImageMeta(trend?.imageMeta))return trend.imageMeta;
  return null;
}

export async function backfillMissingTopThumbnails({limit=20}={}){
  const trends=(await getCachedTrends({includeHidden:true})).slice(0,Math.max(1,Number(limit||20)));
  const usedIds=trends.map(item=>item?.imageMeta?.thumbnailImageId).filter(Boolean);
  const results=[];
  for(const trend of trends){
    const content=await getContent(trend.slug,{includePrivate:true});
    const existing=fixedImageMeta(content||{},trend||{});
    if(existing){
      if(existing.thumbnailImageId&&!usedIds.includes(existing.thumbnailImageId))usedIds.push(existing.thumbnailImageId);
      results.push({slug:trend.slug,updated:false,reason:'existing_unsplash_thumbnail'});
      continue;
    }
    const imageMeta=await selectCuratedThumbnailForContent({...(trend||{}),...(content||{}),slug:trend.slug,category:content?.category||trend.category||'general'},null,{usedIds});
    if(!imageMeta){results.push({slug:trend.slug,updated:false,reason:'thumbnail_pool_unavailable'});continue;}
    await updatePublishedThumbnailFields(trend.slug,imageMeta,'thumbnail_pool_top_backfill');
    usedIds.push(imageMeta.thumbnailImageId);
    results.push({slug:trend.slug,updated:true,thumbnailImageId:imageMeta.thumbnailImageId});
  }
  return{
    checked:trends.length,
    updated:results.filter(row=>row.updated).length,
    existing:results.filter(row=>row.reason==='existing_unsplash_thumbnail').length,
    unavailable:results.filter(row=>row.reason==='thumbnail_pool_unavailable').length,
    results,
  };
}
