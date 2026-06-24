import { taskIdentity, stageIdentity } from './candidateIdentity.js';

export function normalizedStageKeyword(value='') {
  return String(value||'').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
}

export function stageMatchesTrend(content={},trend={},runId='',index=0,contentVersion=0) {
  if(Number(content?.contentVersion||0)!==Number(contentVersion||0))return false;
  const expectedTaskId=taskIdentity(trend,index);
  const expectedStageId=stageIdentity(runId,trend,index);

  if(expectedTaskId&&String(content?.candidateId||'')===String(expectedTaskId))return true;
  if(expectedStageId&&String(content?.publicationStageId||'')===String(expectedStageId))return true;

  const expectedSlug=String(trend?.slug||'').trim();
  const actualSlug=String(content?.slug||content?.publicSlug||'').trim();
  if(!expectedSlug||actualSlug!==expectedSlug)return false;

  const expectedValues=[trend?.topKeyword,trend?.keyword,trend?.rawKeyword,trend?.displayTitle]
    .map(normalizedStageKeyword).filter(Boolean);
  const actualValues=[content?.topKeyword,content?.keyword,content?.rawKeyword,content?.displayTitle,content?.searchQuery]
    .map(normalizedStageKeyword).filter(Boolean);
  return expectedValues.some(expected=>actualValues.some(actual=>{
    if(expected===actual)return true;
    const shorter=expected.length<=actual.length?expected:actual;
    const longer=expected.length>actual.length?expected:actual;
    return shorter.length>=2&&longer.includes(shorter);
  }));
}
