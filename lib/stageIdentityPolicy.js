import { taskIdentity, stageIdentity } from './candidateIdentity.js';

export function normalizedStageKeyword(value='') {
  return String(value||'').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
}

function semanticKeywordMatch(content={},trend={}){
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

function slugSet(values=[]){
  return new Set(values.map(value=>String(value||'').trim()).filter(Boolean));
}

export function assessStageIdentity(content={},trend={},runId='',index=0,contentVersion=0){
  const expectedTaskId=taskIdentity(trend,index);
  const expectedStageId=stageIdentity(runId,trend,index);
  const actualCandidateId=String(content?.candidateId||'').trim();
  const actualStageId=String(content?.publicationStageId||'').trim();
  const expectedSlugs=slugSet([trend?.slug,trend?.originalSlug]);
  const actualSlugs=slugSet([content?.slug,content?.publicSlug,content?.originalSlug]);
  const exactSlug=[...expectedSlugs].some(value=>actualSlugs.has(value));
  const keywordMatched=semanticKeywordMatch(content,trend);
  const versionMatched=Number(content?.contentVersion||0)===Number(contentVersion||0);

  if(expectedTaskId&&actualCandidateId===String(expectedTaskId)){
    return {matched:true,matchType:'candidate_id',versionMatched,keywordMatched,exactSlug,expectedTaskId,expectedStageId,actualCandidateId,actualStageId};
  }
  if(expectedStageId&&actualStageId===String(expectedStageId)){
    return {matched:true,matchType:'publication_stage_id',versionMatched,keywordMatched,exactSlug,expectedTaskId,expectedStageId,actualCandidateId,actualStageId};
  }

  const conflictingCandidate=Boolean(actualCandidateId&&expectedTaskId&&actualCandidateId!==String(expectedTaskId));
  const conflictingStage=Boolean(actualStageId&&expectedStageId&&actualStageId!==String(expectedStageId));
  const belongsToCurrentRun=Boolean(actualStageId&&runId&&actualStageId.startsWith(`${runId}:`));

  // candidateId는 순위와 실행마다 달라질 수 있으므로 영구 콘텐츠 식별자로 사용하지 않습니다.
  // 같은 slug와 같은 핵심 키워드를 가진 과거 실행·공개 콘텐츠는 현재 실행 ID로 승격합니다.
  // 단, 현재 runId에서 이미 다른 stageId가 명시된 경우에는 진짜 충돌이므로 거부합니다.
  if(exactSlug&&keywordMatched&&!belongsToCurrentRun){
    return {matched:true,matchType:(conflictingCandidate||conflictingStage)?'legacy_cross_run_slug_keyword':'legacy_slug_keyword',versionMatched,keywordMatched,exactSlug,expectedTaskId,expectedStageId,actualCandidateId,actualStageId,conflictingCandidate,conflictingStage};
  }
  if(exactSlug&&!conflictingCandidate&&!conflictingStage){
    return {matched:true,matchType:keywordMatched?'legacy_slug_keyword':'legacy_slug_exact',versionMatched,keywordMatched,exactSlug,expectedTaskId,expectedStageId,actualCandidateId,actualStageId};
  }

  return {matched:false,matchType:'mismatch',versionMatched,keywordMatched,exactSlug,conflictingCandidate,conflictingStage,belongsToCurrentRun,expectedTaskId,expectedStageId,actualCandidateId,actualStageId};
}

export function stageMatchesTrend(content={},trend={},runId='',index=0,contentVersion=0) {
  const assessment=assessStageIdentity(content,trend,runId,index,contentVersion);
  return assessment.matched&&assessment.versionMatched;
}
