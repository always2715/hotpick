import { prepareTrendRefresh, getCachedContent, buildFactBasedStageCandidate, CONTENT_VERSION } from './api';
import {
  patchCronRun,
  getSNSSettings,
  addAudit,
  getContent,
  getCachedTrends,
  commitAtomicTopPublication,
  saveTrendCandidateReport,
  getTrendRefreshHealth,
  setTrendRefreshHealth,
  initializeCronRunTasks,
  updateCronRunTask,
  getCronRunTasks,
  getCronRun,
  saveTrendRunCandidates,
  getTrendRunCandidates,
  clearTrendRunWorkspace,
  getPublicationStage,
  saveTrendRunContentSnapshot,
  getTrendRunContentSnapshot,
  repairPublishedFeedIndexes,
  claimActiveTrendRefresh,
  heartbeatActiveTrendRefresh,
  releaseActiveTrendRefresh,
  acquireLock,
  releaseLock,
} from './kv';
import { enqueueTelegramTop10, enqueueTrendRefreshStep } from './jobs';
import { prepareSelectedTopCandidates, taskIdentity, stageIdentity, taskMapByCandidate } from './candidateIdentity';
import { assessStageIdentity, stageMatchesTrend } from './stageIdentityPolicy';
import { contentTierForTrend } from './topContentPolicy';
import { PUBLIC_TOP_COUNT, TOP_GENERATION_POOL_COUNT, TOP_POLICY_VERSION } from './topConfig';
import { buildTrendBrief } from './contentArchitecture';
import { feedDraftIsReady } from './feedPolicy';
import { isFixedKeywordFeedReady, fixedKeywordFeedRejectionReasons } from './publicationPolicy';
import { assessResearchBackedFeedSet, assessFeedDuplicateRisk } from './feedSetQuality';
import {
  TrendRefreshError,
  normalizeRefreshError,
  assessTrendSetHealth,
  summarizeTrendRefresh,
} from './trendRefreshPolicy';

export const TARGET_TOP_COUNT = PUBLIC_TOP_COUNT;
export const RESEARCH_POOL_LIMIT = TOP_GENERATION_POOL_COUNT;
export const TREND_REFRESH_STEP_BATCH_SIZE = 1;
export const TREND_REFRESH_RETRY_BATCH_SIZE = 1;
const STEP_BATCH_SIZE = TREND_REFRESH_STEP_BATCH_SIZE;
const RETRY_BATCH_SIZE = TREND_REFRESH_RETRY_BATCH_SIZE;
export const MAX_AUTOMATIC_ATTEMPTS = Math.min(3, Math.max(1, Number(process.env.TOP_KEYWORD_AUTO_ATTEMPTS || 3)));
const ACTIVE_RUN_TTL_SEC = 2 * 60 * 60;
// QStash 요청 제한(300초)보다 짧게 유지해, 서버가 강제 종료된 뒤 재전달 메시지가
// 남은 lock 때문에 성공(200)으로 소비되지 않도록 합니다.
export const PHASE_LOCK_TTL_SEC = 240;
const TERMINAL_TASKS = new Set(['generated','reused']);
export const MAX_CANDIDATE_ATTEMPTS = Math.max(2,Math.min(5,Number(process.env.TOP_KEYWORD_MAX_ATTEMPTS||3)));
export const FINALIZE_RECOVERY_PASSES = 1; // v8.0.28: finalize에서 외부 검색 없이 기존 Fact Ledger 기반 로컬 복구를 1회 수행합니다.
export const MAX_RUN_STEPS = Math.max(32,Math.min(120,Number(process.env.TOP_REFRESH_MAX_STEPS||72)));
export const MAX_RUN_DURATION_MS = Math.max(30*60*1000,Math.min(3*60*60*1000,Number(process.env.TOP_REFRESH_MAX_MINUTES||120)*60*1000));
const TERMINAL_RUNS = new Set(['completed','completed_with_errors','failed','cancelled','stopped_timeout']);


function taskProgress(tasks=[]) {
  const rows=Array.isArray(tasks)?tasks:[];
  return {
    attempted:rows.filter(task=>Number(task?.attempts||0)>0).length,
    ready:rows.filter(task=>TERMINAL_TASKS.has(String(task?.status||''))).length,
    retryWait:rows.filter(task=>String(task?.status||'')==='retry_wait').length,
    failed:rows.filter(task=>String(task?.status||'')==='failed').length,
    processing:rows.filter(task=>String(task?.status||'')==='processing').length,
  };
}

function isResearchRetryReason(reason='') {
  return /(?:확인 사실 없음|연결 출처 없음|공식·신뢰 근거 없음|근거가 연결된 사실|출처 조회|source|timeout|timed out|429|5\d\d|network|fetch|dns|tls|connection|lock busy|CONTENT_LOCK_BUSY|stage_not_found|stage_identity_mismatch|STAGE_READ_FAILED|STAGE_WRITE_VERIFY_FAILED|RUN_CONTENT_READ_FAILED|RUN_CONTENT_WRITE_VERIFY_FAILED|CONTENT_KEYWORD_NOT_READY|STRICT_CONTENT_ACCURACY_FAILED|NO_ACCURATE_CONTENT|content_validation|피드 제목|피드 요약|최종 제목|상세 본문|상세 콘텐츠 형식|공개 금지 내부 진단|저작권 유사도|사실 충돌|키워드 설명형 피드 생성 검증 실패)/i.test(String(reason||''));
}

function shouldRetryCandidate(errorOrReasons) {
  const values=Array.isArray(errorOrReasons)
    ? errorOrReasons
    : [errorOrReasons?.code,errorOrReasons?.message,...(Array.isArray(errorOrReasons?.details?.reasons)?errorOrReasons.details.reasons:[])];
  return values.filter(Boolean).some(isResearchRetryReason);
}

function phaseLockName(runId,phase,cursor=0){
  return `trend-step:${runId}:${phase}:${Math.max(0,Number(cursor||0))}`;
}


function stopRequested(run={}) {
  return String(run?.stopRequested||'').toLowerCase()==='true'||String(run?.status||'')==='stop_requested';
}

function runAgeMs(run={}) {
  const started=new Date(run?.startedAt||run?.queuedAt||run?.updatedAt||0).getTime();
  return started>0?Math.max(0,Date.now()-started):0;
}

async function assertRunCanContinue(runId,phase,{countStep=false}={}) {
  const run=await getCronRun(runId);
  if(!run)throw new TrendRefreshError('trend_run_not_found','TOP 갱신 실행 정보를 찾을 수 없습니다.',{runId,phase});
  if(String(run?.engineVersion||'')&&String(run.engineVersion)!=='8.0.36')throw new TrendRefreshError('top20_new_run_required',`이 실행은 ${run.engineVersion} 엔진에서 시작돼 v8.0.36 TOP25 생성·TOP20 공개 구조로 재개할 수 없습니다. 기존 작업을 중단하고 새 TOP20 작업을 시작하세요.`,{runId,phase,engineVersion:run.engineVersion});
  if(stopRequested(run))throw new TrendRefreshError('trend_refresh_cancelled',run.stopReason||'관리자 요청으로 TOP 갱신을 중단했습니다.',{runId,phase});
  if(runAgeMs(run)>MAX_RUN_DURATION_MS)throw new TrendRefreshError('trend_refresh_time_limit',`TOP 갱신이 최대 실행시간 ${Math.round(MAX_RUN_DURATION_MS/60000)}분을 초과해 자동 중단됐습니다.`,{runId,phase,maxMinutes:Math.round(MAX_RUN_DURATION_MS/60000)});
  if(countStep){
    const next=Number(run.stepCount||0)+1;
    if(next>MAX_RUN_STEPS)throw new TrendRefreshError('trend_refresh_step_limit',`TOP 갱신 단계가 최대 ${MAX_RUN_STEPS}회를 초과해 자동 중단됐습니다.`,{runId,phase,maxSteps:MAX_RUN_STEPS});
    await patchCronRun(runId,{stepCount:next,lastPhase:phase,heartbeatAt:new Date().toISOString()});
    return {...run,stepCount:next};
  }
  return run;
}

async function stopRun(runId,error,{actor='qstash',trigger='external_cron'}={}) {
  const code=String(error?.code||'trend_refresh_cancelled');
  const status=code==='trend_refresh_cancelled'?'cancelled':'stopped_timeout';
  const message=String(error?.message||'TOP 갱신을 중단했습니다.');
  const tasks=await getCronRunTasks(runId);
  for(const task of tasks){
    if(TERMINAL_TASKS.has(task.status)||task.status==='failed'||task.status==='stopped')continue;
    await updateCronRunTask(runId,String(task.candidateId||task.slug),{status:'stopped',error:message,errorCode:code,finishedAt:new Date().toISOString()});
  }
  await patchCronRun(runId,{status,stopRequested:'true',stopReason:message,refreshCode:code,error:message,finishedAt:new Date().toISOString(),stoppedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString()});
  await releaseActiveTrendRefresh(runId);
  await addAudit('trend_refresh_stopped','',null,{runId,trigger,code,details:error?.details||{}},status==='cancelled'?'관리자 요청으로 TOP 갱신 중단':'안전 한도 초과로 TOP 갱신 자동 중단',actor,'stopped',message);
  return {success:false,stopped:true,runId,status,code,error:message};
}

function isStopCode(code='') {
  return ['trend_refresh_cancelled','trend_refresh_time_limit','trend_refresh_step_limit'].includes(String(code));
}


function stageValidationReasons(content={}) {
  return [
    ...(Number(content?.contentVersion||0)===CONTENT_VERSION?[]:['content_version_mismatch']),
    ...fixedKeywordFeedRejectionReasons(content||{}),
    ...(feedDraftIsReady(content||{})?[]:['feed_validation_failed']),
  ];
}


export async function readVerifiedStage(runId, trend, index=0) {
  const taskId=taskIdentity(trend,index);
  const stageId=stageIdentity(runId,trend,index);
  const keyword=localRepairKeyword(trend);
  const sources=[];
  const seenFingerprints=new Set();
  const addSource=(name,content)=>{
    if(!content)return;
    const fingerprint=String(content?.fingerprint||content?.sourceSignature||`${content?.slug||''}:${content?.updatedAt||content?.stagedAt||''}:${name}`);
    if(seenFingerprints.has(fingerprint))return;
    seenFingerprints.add(fingerprint);
    sources.push({name,content});
  };

  // 실행별 candidateId 외에도 같은 실행의 slug/stage alias로 조회합니다.
  // candidateId가 중간에 변경되거나 레거시 데이터에 없더라도 같은 run+slug 원본을 복구할 수 있습니다.
  try{addSource('run_snapshot',await getTrendRunContentSnapshot(runId,taskId,{slug:trend.slug,stageId,retries:2,throwOnError:false}));}catch{}
  try{addSource('run_stage',await getPublicationStage(stageId,{retries:2,throwOnError:false}));}catch{}
  if(trend?.slug&&String(trend.slug)!==stageId){
    try{addSource('legacy_slug_stage',await getPublicationStage(trend.slug,{retries:2,throwOnError:false}));}catch{}
  }
  try{addSource('published_content',await getContent(trend.slug,{includePrivate:true}));}catch{}

  let firstInvalid=null;
  const identityDiagnostics=[];
  for(const row of sources){
    const identity=assessStageIdentity(row.content,trend,runId,index,CONTENT_VERSION);
    if(!identity.matched){
      identityDiagnostics.push(`${row.name}:${identity.matchType}:${identity.actualCandidateId||'no-candidate-id'}:${identity.actualStageId||'no-stage-id'}`);
      continue;
    }
    let candidate={...row.content,slug:trend.slug,candidateId:taskId,publicationStageId:stageId,originalSlug:trend.originalSlug||trend.slug};
    let reasons=stageValidationReasons(candidate);

    // 이전 contentVersion, 일반화 Fact, 제목·요약 형식 문제는 같은 검증 Fact Ledger로 현재 버전에 맞춰 재구성합니다.
    if(!identity.versionMatched||reasons.length||!isFixedKeywordFeedReady(candidate)){
      const repairReason=[!identity.versionMatched?'content_version_mismatch':'',...reasons].filter(Boolean).join(' / ')||'실행별 콘텐츠 최종 검증 복구';
      const repaired=buildFactBasedStageCandidate(
        candidate,
        keyword,
        {...trend,keyword,topKeyword:keyword,contentTier:trend.contentTier||candidate.contentTier||'standard'},
        trend.imageMeta||trend.thumbnail||candidate.imageMeta||null,
        repairReason,
      );
      if(repaired){
        candidate={...repaired,slug:trend.slug,candidateId:taskId,publicationStageId:stageId,originalSlug:trend.originalSlug||trend.slug,stageRecoveredFrom:row.name,stageIdentityMatchType:identity.matchType};
        reasons=stageValidationReasons(candidate);
      }
    }

    if(!reasons.length&&isFixedKeywordFeedReady(candidate)){
      const persisted=await saveTrendRunContentSnapshot(runId,taskId,candidate,{stageId});
      return {ready:true,code:'ready',content:persisted,reasons:[],source:row.name,identityMatchType:identity.matchType};
    }
    if(!firstInvalid)firstInvalid={content:candidate,reasons:[...new Set(reasons.length?reasons:['content_validation_failed'])],source:row.name,identity};
  }

  if(firstInvalid)return {ready:false,code:'stage_validation_failed',content:firstInvalid.content,reasons:firstInvalid.reasons,source:firstInvalid.source,identityMatchType:firstInvalid.identity?.matchType||''};
  if(sources.length){
    const found=sources.slice(0,4).map(row=>`${row.name}:${String(row.content?.candidateId||'no-candidate-id')}:${String(row.content?.topKeyword||row.content?.keyword||row.content?.displayTitle||'no-keyword')}`);
    return {ready:false,code:'stage_identity_mismatch',content:null,reasons:[`저장된 콘텐츠는 있으나 현재 후보와 연결할 수 없음 (${identityDiagnostics.join(' | ')||found.join(' | ')})`]};
  }
  return {ready:false,code:'stage_not_found',content:null,reasons:['단일 후보 처리 후 실행별 stage·snapshot·slug alias가 모두 없음']};
}

function localRepairKeyword(trend={}) {
  return String(trend?.topKeyword||trend?.keyword||trend?.rawKeyword||trend?.displayTitle||'').replace(/\s+/g,' ').trim();
}

function localRepairEvidenceStats(content={}) {
  const facts=(Array.isArray(content?.factLedger?.facts)?content.factLedger.facts:[])
    .filter(fact=>String(fact?.text||fact?.claim||'').trim());
  const direct=Array.isArray(content?.evidenceSources)?content.evidenceSources:Array.isArray(content?.sourceItems)?content.sourceItems:[];
  const ledgerSources=Array.isArray(content?.factLedger?.sources)?content.factLedger.sources:[];
  const evidence=[...direct,...ledgerSources].filter(row=>String(row?.link||row?.url||row?.canonicalUrl||'').trim());
  return {facts:facts.length,evidence:evidence.length};
}

async function repairCandidateStageFromVerifiedFacts(runId,trend,index,task=null,reason='') {
  const taskId=taskIdentity(trend,index);
  const stageId=stageIdentity(runId,trend,index);
  const candidates=[];
  const add=(source,content)=>{if(content)candidates.push({source,content});};
  try{add('run_snapshot',await getTrendRunContentSnapshot(runId,taskId,{slug:trend.slug,stageId,retries:2,throwOnError:false}));}catch{}
  try{add('stage',await getPublicationStage(stageId,{retries:2,throwOnError:false}));}catch{}
  if(trend?.slug&&String(trend.slug)!==stageId){
    try{add('legacy_slug_stage',await getPublicationStage(trend.slug,{retries:2,throwOnError:false}));}catch{}
  }
  try{add('published_content',await getContent(trend.slug,{includePrivate:true}));}catch{}

  let sourceContent=null;
  let source='';
  for(const row of candidates){
    const identity=assessStageIdentity(row.content,trend,runId,index,CONTENT_VERSION);
    if(!identity.matched)continue;
    const stats=localRepairEvidenceStats(row.content);
    if(stats.facts<1||stats.evidence<1)continue;
    sourceContent=row.content;source=row.source;break;
  }
  if(!sourceContent)return {repaired:false,taskId,stageId,reason:'repair_source_missing_or_identity_mismatch'};
  const stats=localRepairEvidenceStats(sourceContent);
  const keyword=localRepairKeyword(trend);
  const repaired=buildFactBasedStageCandidate(
    sourceContent,
    keyword,
    {...trend,keyword,topKeyword:keyword,contentTier:trend.contentTier||sourceContent.contentTier||'standard'},
    trend.imageMeta||trend.thumbnail||sourceContent.imageMeta||null,
    reason||'최종 공개 전 Fact Ledger 기반 로컬 복구',
  );
  if(!repaired)return {repaired:false,taskId,stageId,reason:'fact_repair_not_available',stats};
  try{
    await saveTrendRunContentSnapshot(runId,taskId,{...repaired,slug:trend.slug,candidateId:taskId,publicationStageId:stageId,originalSlug:trend.originalSlug||trend.slug,localRecovery:true,localRecoverySource:source},{stageId});
    const verified=await readVerifiedStage(runId,trend,index);
    if(!verified.ready)return {repaired:false,taskId,stageId,reason:'repaired_stage_validation_failed',reasons:verified.reasons||[]};
    await updateCronRunTask(runId,taskId,{
      candidateId:taskId,slug:trend.slug,publicationStageId:stageId,status:'generated',feedReady:true,
      error:'',errorCode:'',recoveredFromFactLedger:true,recoverySource:source,recoveryReason:reason||'',candidatePhase:'snapshot_verified',finishedAt:new Date().toISOString(),
    });
    return {repaired:true,taskId,stageId,source,content:verified.content};
  }catch(error){
    return {repaired:false,taskId,stageId,reason:String(error?.message||'local_repair_failed'),code:String(error?.code||'LOCAL_STAGE_REPAIR_FAILED')};
  }
}

async function repairIncompleteStagesLocally(runId,candidates=[],tasks=[]) {
  const taskMap=taskMapByCandidate(tasks);
  const results=await mapLimit(candidates,4,async (trend,index)=>{
    const taskId=taskIdentity(trend,index);
    try{
      const verified=await readVerifiedStage(runId,trend,index);
      if(verified.ready)return {candidateId:taskId,slug:trend.slug,repaired:false,alreadyReady:true};
      return repairCandidateStageFromVerifiedFacts(runId,trend,index,taskMap.get(taskId),(verified.reasons||[]).join(' / ')||verified.code);
    }catch(error){
      return repairCandidateStageFromVerifiedFacts(runId,trend,index,taskMap.get(taskId),String(error?.message||error||'stage_read_failed'));
    }
  });
  return results.filter(row=>row?.repaired||(!row?.alreadyReady&&row?.reason));
}

async function mapLimit(items, limit, worker) {
  const rows = Array.isArray(items) ? items : [];
  const results = new Array(rows.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      results[index] = await worker(rows[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function confirmedFactCount(content = {}) {
  const facts = Array.isArray(content?.factLedger?.facts) ? content.factLedger.facts : [];
  return facts.filter(fact => fact?.status === 'confirmed' || fact?.sourceType === 'official' || (Array.isArray(fact?.sourceIds)&&fact.sourceIds.length>0)).length;
}

function evidenceStats(content = {}) {
  const rows = Array.isArray(content?.evidenceSources)
    ? content.evidenceSources
    : Array.isArray(content?.sourceItems) ? content.sourceItems : [];
  const official = rows.filter(item => item?.sourceType === 'official').length;
  const independentDomains = new Set(rows
    .filter(item => ['official','authorized','trusted_news','independent'].includes(String(item?.sourceType || '')))
    .map(item => String(item?.domain || '').trim())
    .filter(Boolean));
  return { official, independentDomains: independentDomains.size, total: rows.length };
}

function toPublishedTrend(trend = {}, content = {}) {
  const sources = evidenceStats(content);
  const videos=Array.isArray(content.relatedVideos)?content.relatedVideos:Array.isArray(content.videos)?content.videos:[];
  const videoThumb=videos.find(video=>video?.thumbnail)?.thumbnail||null;
  const contentThumb=content.imageMeta?.thumbUrl||content.imageMeta?.imageUrl||content.image||null;
  const thumbnail=contentThumb||videoThumb||trend.thumbnail||null;
  const thumbnailSource=contentThumb?(content.imageMeta?.source||content.imageSource||trend.thumbnailSource||null):(videoThumb?'YouTube':trend.thumbnailSource||null);
  const imageMeta=content.imageMeta||(videoThumb?{
    id:`youtube-${videos.find(video=>video?.thumbnail)?.id||thumbnail}`,
    source:'youtube',imageUrl:videoThumb,thumbUrl:videoThumb,
    sourceUrl:videos.find(video=>video?.thumbnail)?.url||null,
    channel:videos.find(video=>video?.thumbnail)?.channel||'YouTube',
    imageConfidence:82,imageReason:'상세 조사와 직접 연결된 영상 썸네일',
  }:trend.imageMeta||null);
  return {
    ...trend,
    topKeyword: content.topKeyword || trend.topKeyword || trend.keyword,
    topTopic: content.topTopic || trend.topTopic || '',
    topTitle: content.topTitle || '',
    feedTitle:content.feedTitle||content.card?.feedTitle||content.topTitle||'',
    feedHeadline:content.feedHeadline||content.topTopic||'',
    previewLabel:content.card?.previewLabel||'요약 정보',
    previewInfoLine:content.card?.infoLine||`${content.topKeyword||trend.topKeyword||trend.keyword}에 대한 정보`,
    previewSummary:content.card?.listSummary||content.card?.summary||'',
    previewDetailSummary:content.card?.summary||'',
    previewWhy:content.card?.why||'',
    previewPoints:Array.isArray(content.card?.points)?content.card.points.slice(0,5):[],
    listSummary:content.card?.listSummary||content.card?.summary||'',
    displayTitle: content.displayTitle || content.topTitle || content.topKeyword || trend.displayTitle || trend.keyword,
    titleStatus: content.titleStatus || 'review_required',
    titleReady: content.titleReady === true,
    titleSource: content.titleSource || null,
    titleValidationReasons: Array.isArray(content.titleValidationReasons) ? content.titleValidationReasons : [],
    searchQuery: content.searchQuery || trend.searchQuery || trend.keyword,
    category: content.category || trend.category || 'general',
    categoryConfidence: Number(content.categoryConfidence || trend.categoryConfidence || 0),
    categoryReason: content.categoryReason || trend.categoryReason || '',
    visibility: 'published',
    mainVisible: true,
    publicTopPolicy: TOP_POLICY_VERSION,
    publicReady: true,
    contentReady: true,
    contentTier: contentTierForTrend(trend),
    contentGrade:String(content.contentGrade||'B').toUpperCase(),contentScore:Number(content.contentScore||0),
    candidateType:content.candidateType||trend.candidateType||'event',causeStatus:content.causeStatus||trend.causeStatus||'confirmed',currentStatus:content.currentStatus||trend.currentStatus||null,
    rankingScore: Number(content.rankingScore || trend.rankingScore || 0),
    rankingComponents: content.rankingComponents || trend.rankingComponents || {},
    onlineReactionScore: Number(content.onlineReactionRanking?.score || content.rankingComponents?.onlineReaction || 0),
    verifiedFactCount: confirmedFactCount(content),
    verifiedEvidenceCount: sources.total,
    officialSources: sources.official,
    independentSources: sources.independentDomains,
    sourceNewestAt: content.sourceNewestAt || trend.sourceNewestAt || null,
    newestArticleHours: Number.isFinite(Number(trend.newestArticleHours)) ? Number(trend.newestArticleHours) : null,
    thumbnail,
    thumbnailSource,
    imageMeta,
    imageConfidence:Number(imageMeta?.imageConfidence||0),
  };
}

async function failRun(runId, error, { actor = 'qstash', trigger = 'external_cron' } = {}) {
  const failure = normalizeRefreshError(error);
  let feedRecovery=null;
  try{feedRecovery=await repairPublishedFeedIndexes({topOnly:true,force:true});}
  catch(feedError){feedRecovery={error:String(feedError?.message||feedError||'피드 복구 실패')};}
  await addAudit(
    'trend_refresh_failed',
    '',
    null,
    { runId, trigger, code: failure.code, details: failure.details, feedRecovery },
    'TOP 갱신 실패·기존 공개 TOP 유지',
    actor,
    'failed',
    failure.message,
  );
  await patchCronRun(runId, {
    status: 'failed',
    refreshCode: failure.code,
    refreshDetails: JSON.stringify({...(failure.details||{}),feedRecovery}),
    feedRecovery: JSON.stringify(feedRecovery||{}),
    error: failure.message,
    finishedAt: new Date().toISOString(),
  });
  await releaseActiveTrendRefresh(runId);
  const wrapped = new Error(failure.message);
  wrapped.code = failure.code;
  wrapped.details = failure.details;
  throw wrapped;
}


async function retryableStepError(runId, error, phase, { actor = 'qstash', trigger = 'external_cron' } = {}) {
  const failure = normalizeRefreshError(error);
  await patchCronRun(runId, {
    status: `${phase}_retry_wait`,
    refreshCode: failure.code,
    refreshDetails: JSON.stringify(failure.details || {}),
    error: failure.message,
    heartbeatAt: new Date().toISOString(),
  });
  await addAudit(
    'trend_refresh_step_retry',
    '',
    null,
    { runId, trigger, phase, code: failure.code, details: failure.details },
    `TOP 갱신 ${phase} 단계 재시도 대기`,
    actor,
    'retry',
    failure.message,
  );
  const wrapped = new Error(failure.message);
  wrapped.code = failure.code;
  wrapped.details = failure.details;
  throw wrapped;
}

function buildIndependentResearchTrend(trend = {}, index = 0) {
  const keyword = String(trend.topKeyword || trend.keyword || trend.rawKeyword || '').replace(/\s+/g, ' ').trim();
  return {
    slug: trend.slug,
    runId:trend.runId||null,
    candidateId:trend.candidateId||null,
    publicationStageId:trend.publicationStageId||null,
    originalSlug:trend.originalSlug||trend.slug,
    keyword,
    topKeyword: keyword,
    rawKeyword: keyword,
    researchKeyword: keyword,
    displayTitle: keyword,
    searchQuery: keyword,
    topTitle: '',
    topTopic: '',
    rank: Number(trend.rank || index + 1),
    rankingScore: Number(trend.rankingScore || trend.qualityScore || 0),
    rankingGrade: trend.rankingGrade || '',
    rankingComponents: trend.rankingComponents || {},
    eventKey: trend.eventKey || null,
    contentTier: Number(trend.rank || index + 1) <= 10 ? 'full' : 'standard',
    topEligible: true,
    mainVisible: true,
    visibility: 'private',
    publicTopPolicy: TOP_POLICY_VERSION,
    fastRefresh: true,
    manualApproved: false,
    researchAttempt:Number(trend.researchAttempt||1),
    researchMode:String(trend.researchMode||'keyword_identity_and_current_issue'),
    researchIsolation: {
      keywordOnly: true,
      topDiscoveryContextUsed: false,
      topDiscoveryLinksUsed: false,
      topDiscoveryImageUsed: false,
      windowHours: 36,
    },
  };
}

async function processTrendCandidate(runId, trend, index, existingTask = null, options = {}) {
  const taskId=taskIdentity(trend,index);
  const stageId=stageIdentity(runId,trend,index);
  const forceRetry=options.forceRetry===true;
  const previousAttempts=Number(existingTask?.attempts||0);

  const runState=await getCronRun(runId);
  const candidateAttemptLimit=String(runState?.manualRetryAllowed||'').toLowerCase()==='true'?MAX_CANDIDATE_ATTEMPTS:MAX_AUTOMATIC_ATTEMPTS;
  if(stopRequested(runState)){
    await updateCronRunTask(runId,taskId,{candidateId:taskId,slug:trend.slug,publicationStageId:stageId,status:'stopped',error:runState?.stopReason||'관리자 요청으로 중단',errorCode:'trend_refresh_cancelled',finishedAt:new Date().toISOString()});
    return {trend,content:null,ready:false,reasons:[runState?.stopReason||'관리자 요청으로 중단'],status:'stopped'};
  }
  // QStash 요청이 stage 저장 직후 강제 종료되면 task 상태는 processing으로 남을 수 있습니다.
  // 상태와 무관하게 실행 원본을 먼저 읽어, 이미 완료된 후보를 다시 조사하거나 attempts를 소모하지 않습니다.
  try{
    const verified=await readVerifiedStage(runId,trend,index);
    if(verified.ready){
      const recoveredStatus=existingTask?.status==='reused'?'reused':'generated';
      await updateCronRunTask(runId,taskId,{candidateId:taskId,slug:trend.slug,publicationStageId:stageId,status:recoveredStatus,feedReady:true,error:'',errorCode:'',candidatePhase:'snapshot_preflight_verified',snapshotVerifiedAt:new Date().toISOString(),finishedAt:new Date().toISOString()});
      return {trend:toPublishedTrend(trend,verified.content),content:verified.content,ready:true,status:recoveredStatus,reasons:[]};
    }
  }catch(error){
    // 실행 원본이 없거나 읽기 실패한 경우에만 아래 생성·재시도 경로로 진행합니다.
  }

  // 같은 QStash 1차 배치가 재전달돼도 추가 검색 대기·실패 항목을 즉시 다시 조사하지 않습니다.
  // 재조사는 retry phase 또는 관리자 명시적 재개에서만 수행합니다.
  if(existingTask&&!forceRetry&&['retry_wait','failed','stopped'].includes(String(existingTask.status||''))){
    return {trend,content:null,ready:false,reasons:[existingTask.error||existingTask.status],status:existingTask.status};
  }

  if(previousAttempts>=candidateAttemptLimit){
    const reason=`키워드별 최대 시도 횟수 ${candidateAttemptLimit}회를 모두 사용했습니다.`;
    await updateCronRunTask(runId,taskId,{candidateId:taskId,slug:trend.slug,publicationStageId:stageId,status:'failed',error:reason,errorCode:'KEYWORD_ATTEMPT_LIMIT',finishedAt:new Date().toISOString()});
    return {trend,content:null,ready:false,reasons:[reason],status:'failed'};
  }

  const startedAt=new Date().toISOString();
  const attempt=previousAttempts+1;
  await updateCronRunTask(runId,taskId,{
    candidateId:taskId,slug:trend.slug,publicationStageId:stageId,
    status:'processing',attempts:attempt,startedAt,title:trend.displayTitle||trend.keyword,error:'',errorCode:'',candidatePhase:'research_and_generation',
  });
  await patchCronRun(runId,{status:'researching_candidates',processingIndex:index+1,currentSlug:trend.slug,currentCandidateId:taskId,currentTitle:trend.displayTitle||trend.keyword,heartbeatAt:startedAt});

  let heartbeatTimer=null;
  heartbeatTimer=setInterval(()=>{
    const heartbeatAt=new Date().toISOString();
    Promise.allSettled([
      patchCronRun(runId,{heartbeatAt,currentCandidateId:taskId,currentSlug:trend.slug}),
      updateCronRunTask(runId,taskId,{candidatePhase:'research_and_generation',heartbeatAt}),
    ]).catch(()=>{});
  },45000);

  try{
    const independentTrend=buildIndependentResearchTrend({...trend,runId,candidateId:taskId,publicationStageId:stageId,researchAttempt:attempt,researchMode:attempt===1?'keyword_identity_and_current_issue':'expanded_keyword_research'},index);
    if(!independentTrend.keyword)throw new Error('상세 조사에 사용할 확정 키워드가 없습니다.');
    const generated=await getCachedContent(
      trend.slug,
      independentTrend.keyword,
      trend.imageMeta||trend.thumbnail||null,
      independentTrend,
      {force:forceRetry||attempt>1,stageOnly:true,fixedTop20Flow:true},
    );
    await updateCronRunTask(runId,taskId,{candidatePhase:'content_returned',contentReturnedAt:new Date().toISOString()});
    const afterGenerationRun=await getCronRun(runId);
    if(stopRequested(afterGenerationRun)){
      await updateCronRunTask(runId,taskId,{candidateId:taskId,slug:trend.slug,publicationStageId:stageId,status:'stopped',error:afterGenerationRun?.stopReason||'관리자 요청으로 중단',errorCode:'trend_refresh_cancelled',finishedAt:new Date().toISOString()});
      return {trend,content:null,ready:false,reasons:[afterGenerationRun?.stopReason||'관리자 요청으로 중단'],status:'stopped'};
    }
    // 일반화된 Fact가 섞인 결과는 구체적인 검증 사실만 남겨 즉시 다시 구성합니다.
    // 이를 재검색 실패로 넘기지 않아 정상 Fact가 있는 키워드가 전체 공개를 막지 않게 합니다.
    const genericFactReason=fixedKeywordFeedRejectionReasons(generated||{}).find(reason=>/일반화된 Fact|구체적인 실제 사실문/.test(String(reason||'')));
    const normalizedGenerated=genericFactReason
      ? (buildFactBasedStageCandidate(generated,independentTrend.keyword,independentTrend,trend.imageMeta||trend.thumbnail||generated?.imageMeta||null,genericFactReason)||generated)
      : generated;

    // API 내부에서 실행별 stage를 먼저 저장하지만, 호출 경계에서도 한 번 더 쓰고 읽어
    // QStash 재전달·서버 종료 구간에서도 stage 내구성을 보장합니다.
    const saved=await saveTrendRunContentSnapshot(runId,taskId,{...normalizedGenerated,slug:trend.slug,candidateId:taskId,publicationStageId:stageId,originalSlug:trend.originalSlug||trend.slug},{stageId});
    await updateCronRunTask(runId,taskId,{candidatePhase:'snapshot_written',snapshotCandidateId:taskId,snapshotStageId:stageId,snapshotSlug:trend.slug,snapshotWrittenAt:new Date().toISOString()});
    const stageCheck=await readVerifiedStage(runId,trend,index);
    const verified=stageCheck.content||saved;
    const reasons=stageCheck.ready?[]:[...new Set([...(stageCheck.reasons||[]),...stageValidationReasons(verified||{})])];
    if(!stageCheck.ready||!verified||reasons.length||!isFixedKeywordFeedReady(verified||{})){
      const unique=[...new Set(reasons.length?reasons:['content_validation_failed'])];
      const retryable=attempt<candidateAttemptLimit&&shouldRetryCandidate(unique);
      const status=retryable?'retry_wait':'failed';
      const errorCode=retryable?'KEYWORD_ADDITIONAL_RESEARCH_REQUIRED':'KEYWORD_CONTENT_VALIDATION_FAILED';
      await updateCronRunTask(runId,taskId,{candidateId:taskId,slug:trend.slug,publicationStageId:stageId,status,error:unique.join(' / '),errorCode,finishedAt:new Date().toISOString(),nextAction:retryable?'additional_search_and_rewrite':'code_or_manual_review'});
      return {trend,content:null,ready:false,reasons:unique,status};
    }
    const finalStatus=generated?.stageCacheReused===true||generated?.reusedPublishedContent===true?'reused':'generated';
    await updateCronRunTask(runId,taskId,{candidateId:taskId,slug:trend.slug,publicationStageId:stageId,status:finalStatus,feedReady:true,error:'',errorCode:'',candidatePhase:'snapshot_verified',snapshotVerifiedAt:new Date().toISOString(),finishedAt:new Date().toISOString()});
    return {trend:toPublishedTrend(trend,verified),content:verified,ready:true,reasons:[],status:finalStatus};
  }catch(error){
    const reason=String(error?.message||'상세 콘텐츠 생성 실패');
    const code=String(error?.code||'content_generation_failed');
    const retryable=attempt<candidateAttemptLimit&&shouldRetryCandidate(error);
    const status=retryable?'retry_wait':'failed';
    const errorCode=retryable?code:(attempt>=candidateAttemptLimit?'KEYWORD_ATTEMPT_LIMIT':code);
    await updateCronRunTask(runId,taskId,{candidateId:taskId,slug:trend.slug,publicationStageId:stageId,status,error:reason,errorCode,candidatePhase:'generation_failed',finishedAt:new Date().toISOString(),nextAction:retryable?'additional_search_and_rewrite':'code_or_manual_review'});
    return {trend,content:null,ready:false,reasons:[reason],status};
  }finally{
    if(heartbeatTimer)clearInterval(heartbeatTimer);
  }
}

export async function startTrendRefreshRun(runId, { actor = 'qstash', trigger = 'external_cron' } = {}) {
  try {
    const existingRun = await getCronRun(runId);
    // v8.0.28: 실패한 실행과 이미 시작된 실행은 QStash 중복 start 메시지로 자동 재개하지 않습니다.
    // 재개는 관리자 resume_trend_run에서만 명시적으로 수행합니다.
    if(existingRun&&TERMINAL_RUNS.has(existingRun.status)){
      return {success:existingRun.status==='completed',runId,status:existingRun.status,idempotent:true,manualResumeRequired:existingRun.status!=='completed'};
    }

    await assertRunCanContinue(runId,'start',{countStep:true});
    const active = await claimActiveTrendRefresh(runId, ACTIVE_RUN_TTL_SEC);
    if (!active.claimed) {
      throw new TrendRefreshError(
        'trend_refresh_in_progress',
        '다른 TOP 갱신이 진행 중입니다. 현재 실행이 끝난 뒤 다시 시도합니다.',
        { activeRunId: active.activeRunId || '' },
      );
    }

    let persistedCandidates=await getTrendRunCandidates(runId);
    if(persistedCandidates.length&&String(existingRun?.workflowType||'')==='top_refresh_v2'){
      const requiresTop20Migration=persistedCandidates.length!==RESEARCH_POOL_LIMIT||persistedCandidates.some(candidate=>candidate?.fixedTop25Pool!==true);
      if(requiresTop20Migration){
        throw new TrendRefreshError(
          'top20_new_run_required',
          `이 실행은 ${persistedCandidates.length}개 후보 기준으로 저장돼 25개 생성 후보 중 성공한 상위 20개 공개 정책에 사용할 수 없습니다. 기존 작업을 중단하고 새 TOP 갱신을 시작하세요.`,
          {runId,currentCandidateCount:persistedCandidates.length,targetTopCount:TARGET_TOP_COUNT},
        );
      }
      const requiresIdentityMigration=persistedCandidates.some(candidate=>!candidate?.candidateId||!candidate?.publicationStageId);
      if(requiresIdentityMigration){
        persistedCandidates=prepareSelectedTopCandidates(persistedCandidates,runId);
        await saveTrendRunCandidates(runId,persistedCandidates);
        await initializeCronRunTasks(runId,persistedCandidates);
        await patchCronRun(runId,{status:'identity_migrated',identityMigrated:'true',heartbeatAt:new Date().toISOString()});
      }
      const tasks = await getCronRunTasks(runId);
      const progress=taskProgress(tasks);
      const currentCursor=Math.max(0,Number(existingRun?.lastCompletedCursor||0),Number(existingRun?.batchCursor||0));
      const alreadyQueued=Boolean(existingRun?.firstBatchMessageId||existingRun?.nextBatchMessageId||existingRun?.finalizeMessageId||existingRun?.lastQStashMessageId);
      const queueWasNeverCreated=!alreadyQueued&&['callback_started','collecting_candidates','identity_migrated'].includes(String(existingRun?.status||''));
      if(queueWasNeverCreated){
        const queued=await enqueueTrendRefreshStep({runId,trigger,phase:'batch',cursor:currentCursor});
        await patchCronRun(runId,{status:'batch_queued',batchCursor:currentCursor,attemptedCandidates:progress.attempted,publishable:progress.ready,firstBatchMessageId:queued.messageId||'',heartbeatAt:new Date().toISOString()});
        return {success:true,accepted:true,runId,phase:'batch',cursor:currentCursor,readyCount:progress.ready,idempotent:true,recoveredMissingQueue:true,messageId:queued.messageId||''};
      }
      return {success:true,accepted:true,runId,phase:String(existingRun?.nextPhase||existingRun?.lastPhase||'batch'),cursor:currentCursor,readyCount:progress.ready,attemptedCount:progress.attempted,status:existingRun?.status,idempotent:true,duplicateStartIgnored:true};
    }

    await patchCronRun(runId, {
      workflowType: 'top_refresh_v2',
      status: 'callback_started',
      callbackStartedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      error: '',
      refreshCode: '',
      stepBatchSize: STEP_BATCH_SIZE,
      targetTopCount: TARGET_TOP_COUNT,
    });

    const previous = await getCachedTrends({ includeHidden: true });
    await patchCronRun(runId, {
      status: 'collecting_candidates',
      previousTotal: previous.length,
      heartbeatAt: new Date().toISOString(),
    });

    const prepared = await prepareTrendRefresh({
      onStage: async (stage, meta = {}) => {
        await assertRunCanContinue(runId,`start_${stage}`);
        await heartbeatActiveTrendRefresh(runId, ACTIVE_RUN_TTL_SEC);
        await patchCronRun(runId, {
          status: stage,
          stageMeta: JSON.stringify(meta || {}),
          heartbeatAt: new Date().toISOString(),
        });
      },
    });

    // v8.0.36: 관심도 상대순위 상위 25개를 생성 후보 풀로 고정합니다.
    // 25개를 모두 독립 조사한 뒤 성공한 항목을 원래 관심도 순서대로 정렬해 상위 20개만 공개합니다.
    // 상위 후보가 실패하면 다음 순위의 성공 후보가 공개 순위로 승격됩니다.
    const selectedTop25 = prepareSelectedTopCandidates((prepared.trends || []).slice(0, RESEARCH_POOL_LIMIT),runId,RESEARCH_POOL_LIMIT);
    if (selectedTop25.length !== RESEARCH_POOL_LIMIT) {
      throw new TrendRefreshError('abnormal_top_pool_shrink', `관심도 기준 생성 후보가 ${selectedTop25.length}/${RESEARCH_POOL_LIMIT}개만 확정되어 기존 공개 TOP을 유지했습니다.`, {
        targetTopCount: TARGET_TOP_COUNT,
        generationPoolCount: RESEARCH_POOL_LIMIT,
        selectedCount: selectedTop25.length,
        preparedCount: Array.isArray(prepared.trends) ? prepared.trends.length : 0,
      });
    }
    const candidates = selectedTop25.map((item, index) => ({
      ...item,
      rank: index + 1,
      selectionRank: index + 1,
      visibility: 'private',
      publicTopPolicy: TOP_POLICY_VERSION,
      fixedTop20: true,
      fixedTop25Pool: true,
      publicTopCount: TARGET_TOP_COUNT,
      generationPoolCount: RESEARCH_POOL_LIMIT,
    }));

    if (!candidates.length) {
      throw new TrendRefreshError(
        'no_research_candidates',
        '조사할 수 있는 신규 TOP 후보가 없어 기존 공개 TOP을 유지했습니다.',
        { previousCount: previous.length, diagnostics: prepared.report?.diagnostics || {} },
      );
    }

    await saveTrendRunCandidates(runId, candidates);
    await initializeCronRunTasks(runId, candidates);
    await saveTrendCandidateReport({
      ...(prepared.report || {}),
      version:'8.0.36',
      runId,
      refreshFailed: false,
      workflow: 'single_candidate_qstash_with_canonical_snapshot_recovery',
      contentStaging: {
        targetTopCount: TARGET_TOP_COUNT,
        candidateCount: candidates.length,
        processedCount: 0,
        readyCount: 0,
        feedReadyCount: 0,
        rejectedCount: 0,
        skippedCount: 0,
      },
      executedAt: new Date().toISOString(),
    }, 'latest');

    await assertRunCanContinue(runId,'before_first_batch_queue');
    const queued = await enqueueTrendRefreshStep({ runId, trigger, phase: 'batch', cursor: 0 });
    await patchCronRun(runId, {
      workflowType: 'top_refresh_v2',
      status: 'batch_queued',
      total: candidates.length,
      queued: candidates.length,
      batchCursor: 0,
      processedCandidates: 0,
      publishable: 0,
      firstBatchMessageId: queued.messageId || '',
      heartbeatAt: new Date().toISOString(),
    });

    return {
      success: true,
      accepted: true,
      runId,
      phase: 'batch',
      candidateCount: candidates.length,
      batchSize: STEP_BATCH_SIZE,
      messageId: queued.messageId || '',
    };
  } catch (error) {
    if(isStopCode(error?.code))return stopRun(runId,error,{actor,trigger});
    const terminalCodes = new Set(['no_research_candidates','abnormal_top_pool_shrink','trend_refresh_in_progress','trend_lock_unavailable','top20_new_run_required']);
    if (terminalCodes.has(String(error?.code || ''))) return failRun(runId, error, { actor, trigger });
    return retryableStepError(runId, error, 'start', { actor, trigger });
  }
}

async function normalizeReadyStagesForBoundedRetry(runId,candidates=[],tasks=[],attemptLimit=MAX_AUTOMATIC_ATTEMPTS){
  const taskMap=taskMapByCandidate(tasks);
  const evaluations=await mapLimit(candidates,6,async (trend,index)=>{
    const taskId=taskIdentity(trend,index);
    const task=taskMap.get(taskId);
    if(!task||!TERMINAL_TASKS.has(String(task.status||'')))return {trend,index,taskId,task,skip:true};
    try{
      const stage=await readVerifiedStage(runId,trend,index);
      return {trend,index,taskId,task,stage,skip:false};
    }catch(error){
      return {trend,index,taskId,task,stage:{ready:false,code:String(error?.code||'stage_read_failed'),reasons:[String(error?.message||'stage_read_failed')]},skip:false};
    }
  });

  let changed=0;
  for(const row of evaluations){
    if(row.skip||row.stage?.ready)continue;
    const reasons=[...(row.stage?.reasons||[]),row.stage?.code||'stage_not_ready'].filter(Boolean);
    const canRetry=Number(row.task?.attempts||0)<attemptLimit;
    await updateCronRunTask(runId,row.taskId,{
      status:canRetry?'retry_wait':'failed',
      error:reasons.join(' / '),
      errorCode:'STAGE_VALIDATION_FAILED',
      nextAction:canRetry?'bounded_retry_phase':'local_fact_repair_then_manual_review',
      finishedAt:new Date().toISOString(),
    });
    changed+=1;
  }
  // v8.0.28: 공통 문서 구조의 토큰 유사도는 개별 stage 탈락 사유가 아닙니다.
  // 실제 중복 여부는 20개 전체 집합에서 키워드·Fact Ledger·출처 중복까지 함께 평가합니다.
  return changed?getCronRunTasks(runId):tasks;
}

async function queueRetryOrFinalize(runId, trigger, candidates, tasks, cursor=0) {
  let working=Array.isArray(tasks)?tasks:[];
  const run=await getCronRun(runId);
  const attemptLimit=String(run?.manualRetryAllowed||'').toLowerCase()==='true'?MAX_CANDIDATE_ATTEMPTS:MAX_AUTOMATIC_ATTEMPTS;
  working=await normalizeReadyStagesForBoundedRetry(runId,candidates,working,attemptLimit);
  const eligible=working.filter(task=>String(task?.status||'')==='retry_wait'&&Number(task?.attempts||0)<attemptLimit);
  if(eligible.length){
    const retryCursor=Math.max(0,Number((await getCronRun(runId))?.retryCursor||0));
    const queued=await enqueueTrendRefreshStep({runId,trigger,phase:'retry',cursor:retryCursor});
    const progress=taskProgress(working);
    await patchCronRun(runId,{status:'retry_queued',batchCursor:cursor,retryCursor,attemptedCandidates:progress.attempted,publishable:progress.ready,retryQueued:eligible.length,retryMessageId:queued.messageId||'',heartbeatAt:new Date().toISOString()});
    return {success:true,runId,phase:'retry',cursor:retryCursor,readyCount:progress.ready,retryCount:eligible.length,messageId:queued.messageId||''};
  }

  const exhausted=working.filter(task=>String(task?.status||'')==='retry_wait');
  for(const task of exhausted){
    const taskId=String(task.candidateId||task.slug||'');
    if(!taskId)continue;
    await updateCronRunTask(runId,taskId,{status:'failed',error:task.error||`추가 검색 한도 ${attemptLimit-1}회를 사용했지만 콘텐츠를 준비하지 못했습니다.`,errorCode:'KEYWORD_CONTENT_EXHAUSTED',finishedAt:new Date().toISOString(),nextAction:'manual_review_or_explicit_resume'});
  }
  if(exhausted.length)working=await getCronRunTasks(runId);
  const progress=taskProgress(working);
  const queued=await enqueueTrendRefreshStep({runId,trigger,phase:'finalize',cursor});
  await patchCronRun(runId,{status:'finalize_queued',batchCursor:cursor,attemptedCandidates:progress.attempted,publishable:progress.ready,manualRetryAllowed:'false',finalizeMessageId:queued.messageId||'',heartbeatAt:new Date().toISOString()});
  return {success:true,runId,phase:'finalize',cursor,readyCount:progress.ready,failedCount:progress.failed,messageId:queued.messageId||''};
}

export async function executeTrendRefreshBatch(runId, cursor = 0, { actor = 'qstash', trigger = 'external_cron' } = {}) {
  let lockName='';
  try {
    const run = await getCronRun(runId);
    if (!run) throw new TrendRefreshError('trend_run_not_found', 'TOP 갱신 실행 정보를 찾을 수 없습니다.', { runId });
    if (TERMINAL_RUNS.has(run.status)) return { success: run.status === 'completed', runId, status: run.status, idempotent: true };

    const requestedCursor=Math.max(0,Number(cursor||0));
    const completedCursor=Math.max(0,Number(run.lastCompletedCursor||0),Number(run.batchCursor||0));
    if(requestedCursor<completedCursor){
      const tasks=await getCronRunTasks(runId);const progress=taskProgress(tasks);
      return {success:true,runId,phase:'batch',cursor:requestedCursor,idempotent:true,duplicateBatchIgnored:true,lastCompletedCursor:completedCursor,readyCount:progress.ready,attemptedCount:progress.attempted};
    }
    const safeCursor=requestedCursor>completedCursor&&completedCursor>0?completedCursor:requestedCursor;
    lockName=phaseLockName(runId,'batch',safeCursor);
    const locked=await acquireLock(lockName,PHASE_LOCK_TTL_SEC);
    if(!locked)throw new TrendRefreshError('trend_step_lock_busy','이전 단일 후보 처리 요청이 아직 종료되지 않았습니다. QStash가 lock 만료 후 같은 cursor를 다시 처리합니다.',{runId,phase:'batch',cursor:safeCursor,lockTtlSec:PHASE_LOCK_TTL_SEC});

    await assertRunCanContinue(runId,'batch',{countStep:true});
    const active = await claimActiveTrendRefresh(runId, ACTIVE_RUN_TTL_SEC);
    if (!active.claimed) throw new TrendRefreshError('trend_refresh_lock_lost', 'TOP 갱신 실행 소유권을 확인하지 못했습니다.', { activeRunId: active.activeRunId || '' });
    await heartbeatActiveTrendRefresh(runId, ACTIVE_RUN_TTL_SEC);

    const candidates = await getTrendRunCandidates(runId);
    if (!candidates.length) throw new TrendRefreshError('trend_candidates_missing', '저장된 TOP 후보 목록을 찾을 수 없습니다.', { runId });
    const tasks = await getCronRunTasks(runId);
    const taskMap = taskMapByCandidate(tasks);

    if (safeCursor >= candidates.length) return queueRetryOrFinalize(runId,trigger,candidates,tasks,safeCursor);

    const batch = candidates.slice(safeCursor, safeCursor + STEP_BATCH_SIZE);
    await patchCronRun(runId,{status:'processing_batch',batchCursor:safeCursor,batchSize:batch.length,heartbeatAt:new Date().toISOString()});
    await mapLimit(batch, STEP_BATCH_SIZE, (trend, offset) => processTrendCandidate(runId,trend,safeCursor+offset,taskMap.get(taskIdentity(trend))));

    await heartbeatActiveTrendRefresh(runId, ACTIVE_RUN_TTL_SEC);
    await assertRunCanContinue(runId,'batch_after_processing');
    const refreshedTasks = await getCronRunTasks(runId);
    const progress=taskProgress(refreshedTasks);
    const nextCursor = safeCursor + batch.length;
    await patchCronRun(runId,{lastCompletedCursor:nextCursor,batchCursor:nextCursor,processedCandidates:progress.attempted,attemptedCandidates:progress.attempted,publishable:progress.ready,heartbeatAt:new Date().toISOString()});

    if(nextCursor>=candidates.length)return queueRetryOrFinalize(runId,trigger,candidates,refreshedTasks,nextCursor);

    const queued = await enqueueTrendRefreshStep({ runId, trigger, phase: 'batch', cursor: nextCursor });
    await patchCronRun(runId,{status:'batch_queued',batchCursor:nextCursor,lastCompletedCursor:nextCursor,processedCandidates:progress.attempted,attemptedCandidates:progress.attempted,publishable:progress.ready,nextBatchMessageId:queued.messageId||'',heartbeatAt:new Date().toISOString()});
    return {success:true,runId,phase:'batch',cursor:nextCursor,readyCount:progress.ready,attemptedCount:progress.attempted,retryWait:progress.retryWait,messageId:queued.messageId||''};
  } catch (error) {
    if(isStopCode(error?.code))return stopRun(runId,error,{actor,trigger});
    const terminalCodes = new Set(['trend_run_not_found','trend_candidates_missing','trend_refresh_lock_lost','top20_new_run_required']);
    if (terminalCodes.has(String(error?.code || ''))) return failRun(runId, error, { actor, trigger });
    return retryableStepError(runId, error, 'batch', { actor, trigger });
  } finally {
    if(lockName)await releaseLock(lockName);
  }
}

export async function executeTrendRefreshRetryBatch(runId, cursor = 0, { actor = 'qstash', trigger = 'external_cron' } = {}) {
  let lockName='';
  try{
    const run=await getCronRun(runId);
    if(!run)throw new TrendRefreshError('trend_run_not_found','TOP 갱신 실행 정보를 찾을 수 없습니다.',{runId});
    if(TERMINAL_RUNS.has(run.status))return {success:run.status==='completed',runId,status:run.status,idempotent:true};
    const attemptLimit=String(run?.manualRetryAllowed||'').toLowerCase()==='true'?MAX_CANDIDATE_ATTEMPTS:MAX_AUTOMATIC_ATTEMPTS;
    const safeCursor=Math.max(0,Number(cursor||0));
    const completedRetryCursor=Math.max(0,Number(run.retryCursor||0));
    if(safeCursor<completedRetryCursor){
      const tasks=await getCronRunTasks(runId);const progress=taskProgress(tasks);
      return {success:true,runId,phase:'retry',cursor:safeCursor,idempotent:true,duplicateRetryIgnored:true,retryCursor:completedRetryCursor,readyCount:progress.ready};
    }
    lockName=phaseLockName(runId,'retry',safeCursor);
    const locked=await acquireLock(lockName,PHASE_LOCK_TTL_SEC);
    if(!locked)throw new TrendRefreshError('trend_step_lock_busy','이전 추가 검색 요청이 아직 종료되지 않았습니다. QStash가 lock 만료 후 같은 cursor를 다시 처리합니다.',{runId,phase:'retry',cursor:safeCursor,lockTtlSec:PHASE_LOCK_TTL_SEC});

    await assertRunCanContinue(runId,'retry',{countStep:true});
    const active=await claimActiveTrendRefresh(runId,ACTIVE_RUN_TTL_SEC);
    if(!active.claimed)throw new TrendRefreshError('trend_refresh_lock_lost','TOP 갱신 실행 소유권을 확인하지 못했습니다.',{activeRunId:active.activeRunId||''});
    await heartbeatActiveTrendRefresh(runId,ACTIVE_RUN_TTL_SEC);

    const [candidates,tasks]=await Promise.all([getTrendRunCandidates(runId),getCronRunTasks(runId)]);
    if(!candidates.length)throw new TrendRefreshError('trend_candidates_missing','저장된 TOP 후보 목록을 찾을 수 없습니다.',{runId});
    const taskMap=taskMapByCandidate(tasks);
    const eligibleCandidates=candidates.filter((trend,index)=>{
      const task=taskMap.get(taskIdentity(trend,index));
      return String(task?.status||'')==='retry_wait'&&Number(task?.attempts||0)<attemptLimit;
    });
    if(!eligibleCandidates.length)return queueRetryOrFinalize(runId,trigger,candidates,tasks,safeCursor);

    const retryBatch=eligibleCandidates.slice(0,RETRY_BATCH_SIZE);
    await patchCronRun(runId,{status:'processing_retry_batch',retryCursor:safeCursor,retryBatchSize:retryBatch.length,heartbeatAt:new Date().toISOString()});
    await mapLimit(retryBatch,Math.min(STEP_BATCH_SIZE,retryBatch.length),async trend=>{
      const index=Math.max(0,candidates.findIndex(candidate=>taskIdentity(candidate)===taskIdentity(trend)));
      return processTrendCandidate(runId,trend,index,taskMap.get(taskIdentity(trend,index)),{forceRetry:true,retryPhase:true});
    });

    const refreshedTasks=await getCronRunTasks(runId);
    const progress=taskProgress(refreshedTasks);
    const nextCursor=safeCursor+retryBatch.length;
    await patchCronRun(runId,{retryCursor:nextCursor,retryProcessed:nextCursor,attemptedCandidates:progress.attempted,publishable:progress.ready,heartbeatAt:new Date().toISOString()});
    const refreshedMap=taskMapByCandidate(refreshedTasks);
    const remaining=candidates.filter((trend,index)=>{
      const task=refreshedMap.get(taskIdentity(trend,index));
      return String(task?.status||'')==='retry_wait'&&Number(task?.attempts||0)<attemptLimit;
    });
    if(remaining.length){
      const queued=await enqueueTrendRefreshStep({runId,trigger,phase:'retry',cursor:nextCursor});
      await patchCronRun(runId,{status:'retry_queued',retryCursor:nextCursor,retryQueued:remaining.length,retryMessageId:queued.messageId||'',heartbeatAt:new Date().toISOString()});
      return {success:true,runId,phase:'retry',cursor:nextCursor,readyCount:progress.ready,retryRemaining:remaining.length,messageId:queued.messageId||''};
    }
    return queueRetryOrFinalize(runId,trigger,candidates,refreshedTasks,nextCursor);
  }catch(error){
    if(isStopCode(error?.code))return stopRun(runId,error,{actor,trigger});
    const terminalCodes=new Set(['trend_run_not_found','trend_candidates_missing','trend_refresh_lock_lost','top20_new_run_required']);
    if(terminalCodes.has(String(error?.code||'')))return failRun(runId,error,{actor,trigger});
    return retryableStepError(runId,error,'retry',{actor,trigger});
  }finally{
    if(lockName)await releaseLock(lockName);
  }
}


async function deferFinalizeForPendingTasks(runId,trigger,candidates=[],tasks=[]) {
  const run=await getCronRun(runId)||{};
  const attemptLimit=String(run?.manualRetryAllowed||'').toLowerCase()==='true'?MAX_CANDIDATE_ATTEMPTS:MAX_AUTOMATIC_ATTEMPTS;
  const now=Date.now();
  let working=Array.isArray(tasks)?tasks:[];

  // 요청이 중간 종료돼 processing에 고정된 항목은 즉시 실패시키지 않고 재시도 대기로 돌립니다.
  for(const task of working.filter(row=>String(row?.status||'')==='processing')){
    const updated=new Date(task?.updatedAt||task?.startedAt||0).getTime();
    const stale=!updated||now-updated>=6*60*1000;
    if(!stale)continue;
    const taskId=String(task?.candidateId||task?.slug||'');
    if(!taskId)continue;
    const canRetry=Number(task?.attempts||0)<attemptLimit;
    await updateCronRunTask(runId,taskId,{
      status:canRetry?'retry_wait':'failed',
      error:canRetry?'처리 요청이 중간 종료돼 저장된 실행 원본을 확인한 뒤 재시도합니다.':'처리 요청 중단 후 최대 시도 횟수를 초과했습니다.',
      errorCode:canRetry?'STALE_PROCESSING_RECOVERY':'KEYWORD_ATTEMPT_LIMIT',
      nextAction:canRetry?'durable_snapshot_or_retry':'manual_review',
      finishedAt:new Date().toISOString(),
    });
  }
  working=await getCronRunTasks(runId);

  const retryable=working.filter(task=>String(task?.status||'')==='retry_wait'&&Number(task?.attempts||0)<attemptLimit);
  if(retryable.length){
    const retryCursor=Math.max(0,Number(run?.retryCursor||0));
    const queued=await enqueueTrendRefreshStep({runId,trigger,phase:'retry',cursor:retryCursor});
    await patchCronRun(runId,{status:'retry_queued',retryQueued:retryable.length,retryMessageId:queued.messageId||'',finalizeDeferred:'true',heartbeatAt:new Date().toISOString()});
    return {success:true,accepted:true,runId,phase:'retry',finalizeDeferred:true,retryCount:retryable.length,messageId:queued.messageId||''};
  }

  const queuedTasks=working.filter(task=>String(task?.status||'')==='queued');
  if(queuedTasks.length){
    const taskIds=new Set(queuedTasks.map(task=>String(task?.candidateId||task?.slug||'')));
    const firstIndex=Math.max(0,candidates.findIndex((trend,index)=>taskIds.has(taskIdentity(trend,index))));
    const queued=await enqueueTrendRefreshStep({runId,trigger,phase:'batch',cursor:firstIndex});
    await patchCronRun(runId,{status:'batch_queued',batchCursor:firstIndex,nextBatchMessageId:queued.messageId||'',finalizeDeferred:'true',heartbeatAt:new Date().toISOString()});
    return {success:true,accepted:true,runId,phase:'batch',cursor:firstIndex,finalizeDeferred:true,queuedCount:queuedTasks.length,messageId:queued.messageId||''};
  }

  const activeProcessing=working.filter(task=>String(task?.status||'')==='processing');
  if(activeProcessing.length){
    await patchCronRun(runId,{status:'waiting_for_candidate_completion',finalizeDeferred:'true',heartbeatAt:new Date().toISOString()});
    return {success:true,accepted:true,runId,phase:'wait',finalizeDeferred:true,processingCount:activeProcessing.length};
  }
  return null;
}

export async function finalizeTrendRefreshRun(runId, { actor = 'qstash', trigger = 'external_cron' } = {}) {
  try {
    const run = await getCronRun(runId);
    if (!run) throw new TrendRefreshError('trend_run_not_found', 'TOP 갱신 실행 정보를 찾을 수 없습니다.', { runId });
    if (TERMINAL_RUNS.has(run.status)) return { success: run.status === 'completed', runId, status: run.status, idempotent: true };
    await assertRunCanContinue(runId,'finalize',{countStep:true});

    const active = await claimActiveTrendRefresh(runId, ACTIVE_RUN_TTL_SEC);
    if (!active.claimed) {
      throw new TrendRefreshError('trend_refresh_lock_lost', 'TOP 갱신 실행 소유권을 확인하지 못했습니다.', { activeRunId: active.activeRunId || '' });
    }
    await patchCronRun(runId, { status: 'validating_publication', heartbeatAt: new Date().toISOString() });

    const [candidates, previous, previousHealth, tasks] = await Promise.all([
      getTrendRunCandidates(runId),
      getCachedTrends({ includeHidden: true }),
      getTrendRefreshHealth().then(value => value || {}),
      getCronRunTasks(runId),
    ]);
    if (!candidates.length) throw new TrendRefreshError('trend_candidates_missing', '저장된 TOP 후보 목록을 찾을 수 없습니다.', { runId });

    const deferred=await deferFinalizeForPendingTasks(runId,trigger,candidates,tasks);
    if(deferred)return deferred;

    let workingTasks=tasks;
    let taskMap=taskMapByCandidate(workingTasks);

    async function collectReadyRows(){
      const evaluations=await mapLimit(candidates,6,async (trend,index)=>{
        const taskId=taskIdentity(trend,index);
        const task=taskMap.get(taskId);
        try{
          // 작업 상태보다 실제 stage를 먼저 확인합니다. task 상태 저장만 실패한 경우에도 정상 stage를 살립니다.
          const stage=await readVerifiedStage(runId,trend,index);
          if(stage.ready){
            if(!task||!['generated','reused'].includes(task.status)){
              await updateCronRunTask(runId,taskId,{candidateId:taskId,slug:trend.slug,publicationStageId:stageIdentity(runId,trend,index),status:'generated',feedReady:true,error:'',errorCode:'',recoveredFromVerifiedStage:true,finishedAt:new Date().toISOString()});
            }
            return {trend:toPublishedTrend(trend,stage.content),sourceTrend:trend,task,content:stage.content,feedReady:true,ready:true,code:'ready',reasons:[]};
          }
          return {trend,task,ready:false,code:stage.code||task?.errorCode||task?.status||'stage_not_ready',reasons:[...new Set([...(stage.reasons||[]),task?.error||task?.status].filter(Boolean))]};
        }catch(error){
          return {trend,task,ready:false,code:String(error?.code||'stage_read_failed'),reasons:[String(error?.message||'stage_read_failed')]};
        }
      });
      const rows=evaluations.filter(row=>row.ready).sort((a,b)=>Number(a.trend?.rank||99)-Number(b.trend?.rank||99));
      const duplicateWarnings=[];
      for(let left=0;left<rows.length;left++)for(let right=left+1;right<rows.length;right++){
        const risk=assessFeedDuplicateRisk(rows[left].content,rows[right].content);
        if(risk.structuralSimilarity)duplicateWarnings.push({leftRank:Number(rows[left].trend?.rank||left+1),rightRank:Number(rows[right].trend?.rank||right+1),...risk});
      }
      return {
        rows,
        allReady:rows,
        missing:evaluations.filter(row=>!row.ready),
        duplicateWarnings,
      };
    }


    // v8.0.28: finalize에서는 외부 검색이나 AI 재생성을 실행하지 않습니다.
    // 대신 저장돼 있는 stage 또는 기존 공개 콘텐츠의 Fact Ledger만 사용해 형식 오류·stage 누락을 한 번 복구합니다.
    const recoveryLog=await repairIncompleteStagesLocally(runId,candidates,workingTasks);
    workingTasks=await getCronRunTasks(runId);
    taskMap=taskMapByCandidate(workingTasks);
    const collected=await collectReadyRows();
    const readyRows=collected.rows;
    const missingAfterRecovery=collected.missing;


    // 25개 후보의 실패 항목은 숨기지 않고 기록하되, 성공한 후보를 원래 순위대로 정렬해 공개 상위 20개를 구성합니다.
    const refreshedTasks = await getCronRunTasks(runId);
    const rejected = refreshedTasks
      .filter(task => ['failed','retry_wait'].includes(task.status))
      .map(task => ({
        trend:candidates.find(candidate=>taskIdentity(candidate)===String(task.candidateId||task.slug))||{slug:task.slug,candidateId:task.candidateId,displayTitle:task.title},
        reasons: task.error ? [task.error] : [task.status],
        status: task.status,
      }));
    const skipped = [];
    const processedCount = refreshedTasks.filter(task => !['queued', 'processing', 'retry_wait'].includes(task.status)).length;

    // v8.0.36: 25개 생성 후보 중 성공한 항목을 원래 selectionRank 순으로 정렬하고 상위 20개를 공개합니다.
    // 실패 후보가 있으면 다음 순위 성공 후보가 자동 승격됩니다.
    const publicationRows = readyRows
      .sort((a,b)=>Number(a.trend?.selectionRank||a.trend?.rank||99)-Number(b.trend?.selectionRank||b.trend?.rank||99))
      .slice(0, TARGET_TOP_COUNT);
    const topCountComplete = publicationRows.length === TARGET_TOP_COUNT;

    const rejectionCounts = new Map();
    rejected.forEach(row => (row.reasons || []).forEach(reason => rejectionCounts.set(reason, (rejectionCounts.get(reason) || 0) + 1)));
    const dominantRejectionCount = Math.max(0, ...rejectionCounts.values());
    const healthDiagnostics = {
      dominantRejectionShare: candidates.length ? dominantRejectionCount / candidates.length : 0,
      dominantRejectionReason: [...rejectionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
    };
    const baseHealth = assessTrendSetHealth(
      publicationRows.map(row => row.trend),
      previous.map(row => row),
      healthDiagnostics,
      { consecutiveLow: Number(previousHealth.consecutiveLow || 0), targetCount: TARGET_TOP_COUNT },
    );
    const feedQuality=assessResearchBackedFeedSet(publicationRows);
    const health={...baseHealth,healthy:Boolean(baseHealth.healthy&&feedQuality.healthy),feedQuality};
    const progressiveRecovery = false;

    await setTrendRefreshHealth({
      ...health,
      checkedAt: new Date().toISOString(),
      candidateCount: candidates.length,
      targetTopCount: TARGET_TOP_COUNT,
      topCountComplete,
      progressiveRecovery,
      rejectedContentCount: rejected.length,
      skippedCandidateCount: skipped.length,
      rejectionSamples: rejected.slice(0, 10).map(row => ({ slug: row.trend?.slug, title: row.trend?.displayTitle, reasons: row.reasons })),
    });

    const executionReport = {
      version:'8.0.36',
      publicTopPolicy: TOP_POLICY_VERSION,
      workflow: 'single_candidate_qstash_with_canonical_snapshot_recovery',
      refreshFailed: !health.healthy,
      publicationHealth: health,
      feedQuality,
      progressiveRecovery,
      contentStaging: {
        targetTopCount: TARGET_TOP_COUNT,
        candidateCount: candidates.length,
        generationPoolCount: RESEARCH_POOL_LIMIT,
        publicTopCount: TARGET_TOP_COUNT,
        processedCount,
        readyCount: readyRows.length,
        feedReadyCount: readyRows.filter(row=>row.feedReady===true).length,
        carryoverReadyCount: 0,
        rejectedCount: rejected.length,
        skippedCount: skipped.length,
        rejected:rejected.slice(0,TARGET_TOP_COUNT).map(row=>({candidateId:row.trend?.candidateId||'',slug:row.trend?.slug,title:row.trend?.displayTitle,reasons:row.reasons})),
        recoveryPasses:recoveryLog,
        duplicateWarnings:collected.duplicateWarnings||[],
        missingAfterRecovery:missingAfterRecovery.map(row=>({candidateId:taskIdentity(row.sourceTrend||row.trend),slug:(row.sourceTrend||row.trend)?.slug,code:row.code,reasons:row.reasons})),
      },
      runId,
      executedAt: new Date().toISOString(),
    };
    await saveTrendCandidateReport(executionReport, 'latest');

    if (!health.healthy) {
      const failureCode=readyRows.length<TARGET_TOP_COUNT?'top20_from25_content_incomplete':'top20_feed_quality_invalid';
      const missingLabels=missingAfterRecovery.slice(0,5).map(row=>{
        const source=row.sourceTrend||row.trend||{};
        const candidateId=taskIdentity(source);
        const task=row.task||taskMap.get(candidateId)||{};
        const label=String(source.topKeyword||source.keyword||source.displayTitle||source.slug||'미확인 키워드');
        const reason=String((row.reasons||[])[0]||row.code||'stage_not_ready');
        const status=String(task.status||'missing_task');
        const phase=String(task.candidatePhase||task.nextAction||'unknown');
        const attempts=Number(task.attempts||0);
        const errorCode=String(task.errorCode||row.code||'');
        return `${label}: ${reason} [status=${status}, phase=${phase}, attempts=${attempts}${errorCode?`, code=${errorCode}`:''}]`;
      });
      const failureMessage=readyRows.length<TARGET_TOP_COUNT
        ? `상위 25개 생성 후보 중 상세·피드·제목이 ${readyRows.length}/${RESEARCH_POOL_LIMIT}개 완료됐으며, 공개에 필요한 ${TARGET_TOP_COUNT}개를 채우지 못해 기존 TOP을 유지했습니다.${missingLabels.length?` 미완료 항목 — ${missingLabels.join(' | ')}`:''}`
        : 'TOP20 피드 품질 검증을 통과하지 못해 기존 공개 TOP을 유지했습니다.';
      throw new TrendRefreshError(failureCode, failureMessage, {
        ...health,
        targetTopCount: TARGET_TOP_COUNT,
        candidateCount: candidates.length,
        generationPoolCount: RESEARCH_POOL_LIMIT,
        publicTopCount: TARGET_TOP_COUNT,
        processedCount,
        readyCount: readyRows.length,
        carryoverReadyCount: 0,
        rejectedCount: rejected.length,
        rejected:rejected.slice(0,TARGET_TOP_COUNT).map(row=>({candidateId:row.trend?.candidateId||'',slug:row.trend?.slug,title:row.trend?.displayTitle,reasons:row.reasons})),
        recoveryPasses:recoveryLog,
        duplicateWarnings:collected.duplicateWarnings||[],
        missingAfterRecovery:missingAfterRecovery.map(row=>({candidateId:taskIdentity(row.sourceTrend||row.trend),slug:(row.sourceTrend||row.trend)?.slug,code:row.code,reasons:row.reasons})),
      });
    }

    if (publicationRows.length !== TARGET_TOP_COUNT) {
      throw new TrendRefreshError('top20_incomplete', `검증된 TOP이 ${publicationRows.length}개만 준비되어 ${TARGET_TOP_COUNT}개 공개를 완료하지 못했습니다.`, {
        targetTopCount: TARGET_TOP_COUNT,
        readyCount: publicationRows.length,
        candidateCount: candidates.length,
      });
    }

    await assertRunCanContinue(runId,'before_atomic_publication');
    const finalTrends = publicationRows.slice(0, TARGET_TOP_COUNT).map((row, index) => ({
      ...row.trend,
      selectionRank:Number(row.trend?.selectionRank||row.trend?.rank||index+1),
      sourceRank:Number(row.trend?.selectionRank||row.trend?.rank||index+1),
      promotedFromReserve:Number(row.trend?.selectionRank||row.trend?.rank||index+1)>TARGET_TOP_COUNT,
      rank:index+1,
    }));
    const finalContents = publicationRows.slice(0, TARGET_TOP_COUNT).map(row => row.content);
    const committed = await commitAtomicTopPublication(finalTrends, finalContents);
    const refreshSummary = summarizeTrendRefresh(previous, committed.trends);

    await saveTrendCandidateReport({
      ...executionReport,
      refreshFailed: false,
      degraded: false,
      refreshSummary,
      persistence: committed.persistence,
    }, 'latest');
    await setTrendRefreshHealth({
      ...health,
      healthy: true,
      consecutiveLow: 0,
      lastSuccessfulAt: new Date().toISOString(),
      publishedCount: committed.trends.length,
    });
    await patchCronRun(runId, {
      status: 'completed',
      manualRetryAllowed: 'false',
      total: candidates.length,
      publishable: committed.trends.length,
      generated: readyRows.length,
      feedReady: readyRows.filter(row=>row.feedReady===true).length,
      feedPublished: Number(committed.feedPublishedCount||0),
      review: 0,
      pending: 0,
      failed: rejected.filter(row => row.status === 'failed').length,
      skipped: skipped.length,
      previousTotal: refreshSummary.previousCount,
      entered: refreshSummary.entered,
      dropped: refreshSummary.dropped,
      moved: refreshSummary.moved,
      changed: refreshSummary.changed,
      refreshResult: refreshSummary.result,
      saveVerified: 'true',
      persistedAt: committed.persistence.updatedAt,
      trendsUpdatedAt: committed.persistence.updatedAt,
      finishedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
    });

    await addAudit('trend_refresh_completed', '', null, {
      runId,
      trigger,
      targetTopCount: TARGET_TOP_COUNT,
      total: candidates.length,
      published: committed.trends.length,
      feedPublished: Number(committed.feedPublishedCount||0),
      feedRepair: committed.feedRepair||null,
      rejected: rejected.length,
      skipped: skipped.length,
      progressiveRecovery,
      refreshSummary,
      persistence: committed.persistence,
      publicationHealth: health,
    }, 'TOP·피드·상세 원자적 갱신 완료', actor, 'success', '');

    const sns = await getSNSSettings();
    if (sns.telegramAuto) {
      try { await enqueueTelegramTop10(committed.trends); }
      catch (error) { console.error('[QStash telegram enqueue]', error?.message || error); }
    }

    await clearTrendRunWorkspace(runId);
    await releaseActiveTrendRefresh(runId);
    return {
      success: true,
      runId,
      total: candidates.length,
      publishable: committed.trends.length,
      feedPublished: Number(committed.feedPublishedCount||0),
      rejected: rejected.length,
      refreshSummary,
      persistence: committed.persistence,
      publicationHealth: health,
    };
  } catch (error) {
    if(isStopCode(error?.code))return stopRun(runId,error,{actor,trigger});
    const terminalCodes = new Set(['abnormal_top_pool_shrink','top20_from25_content_incomplete','top20_feed_quality_invalid','top20_incomplete','trend_run_not_found','trend_candidates_missing','trend_refresh_lock_lost','top20_new_run_required']);
    if (terminalCodes.has(String(error?.code || ''))) return failRun(runId, error, { actor, trigger });
    return retryableStepError(runId, error, 'finalize', { actor, trigger });
  }
}

// 이전 단일 장기 실행 진입점과의 호환용입니다. v8.0.9부터는 시작 단계만 수행하고
// 이후 후보 처리는 QStash 배치 메시지가 이어서 실행합니다.
export async function executeTrendRefreshRun(runId, options = {}) {
  return startTrendRefreshRun(runId, options);
}
