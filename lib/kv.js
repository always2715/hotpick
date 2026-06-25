import { Redis } from '@upstash/redis';
import { ensurePromoCard, buildInstagramCaption } from './instagram';
import { contentIsReady } from './contentArchitecture';
import { verifyPersistedTrendSet } from './trendRefreshPolicy';
import { isPublicTopCandidate } from './trendSelectionPolicy';
import { isPublicContentReady, sanitizePublicCopy } from './publicationPolicy';
import { feedDraftIsReady } from './feedPolicy';
import { FEED_INDEX_SCHEMA_VERSION, feedIndexItemRejectionReasons, isCurrentFeedIndexItem, isVisibleFeedIndexRecord } from './feedIndexPolicy';
import { PUBLIC_TOP_COUNT } from './topConfig';
import { writeDualRunSnapshot } from './runSnapshotStore';
import { isPersistedPublishedContentForFeed, upgradeTrustedPersistedFeedRecord } from './feedRecoveryPolicy';
import { currentTrendEngineMetadata } from './trendEnginePolicy';
import { applyRankMovements } from './rankMovement.js';
import { sanitizeSourceDisplayText } from './publicCopy.js';

const NS = 'stellate:v7';
const K = {
  trends: `${NS}:trends:latest`,
  stableTrends: `${NS}:trends:stable_top30`,
  trendsUpdatedAt: `${NS}:trends:updated_at`,
  previousRanks: `${NS}:trends:previous_ranks`,
  feed: `${NS}:feed:all`,
  feedSlugs: `${NS}:feed:slugs`,
  feedItems: `${NS}:feed:items`,
  feedLatest: `${NS}:feed:index:latest`,
  feedSequence: `${NS}:feed:index:sequence`,
  feedViews: `${NS}:feed:index:views`,
  feedSeq: `${NS}:feed:sequence`,
  feedIndexSchema: `${NS}:feed:index:schema`,
  feedCumulativeMigration: `${NS}:feed:cumulative:migration:v8050`,
  contentScanMarker: `${NS}:content:scan:migration:v8050`,
  feedArchiveItems: `${NS}:feed:archive:items`,
  feedArchiveContents: `${NS}:feed:archive:contents`,
  feedArchiveLatest: `${NS}:feed:archive:index:latest`,
  feedArchiveSlugs: `${NS}:feed:archive:slugs`,
  contentIndex: `${NS}:content:index`,
  audit: `${NS}:admin:audit`,
  sns: `${NS}:settings:sns`,
  cronRuns: `${NS}:cron:runs`,
  top10History: `${NS}:top10:history`,
  trendCandidatesLatest: `${NS}:trends:candidates:latest`,
  trendCandidatesPreview: `${NS}:trends:candidates:preview`,
  trendRules: `${NS}:trends:rules`,
  trendRefreshHealth: `${NS}:trends:refresh_health`,
  activeTrendRefresh: `${NS}:cron:active_trend_refresh`,
  thumbnailPool: `${NS}:thumbnail_pool:v1`,
  thumbnailUsage: `${NS}:thumbnail_usage:v1`,
};

let redis = null;
function getRedis() {
  if(redis)return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export function __setRedisClientForTests(client = null) {
  if(process.env.NODE_ENV!=='test'&&process.env.STELLATE_ALLOW_TEST_REDIS!=='true')throw new Error('테스트 환경에서만 Redis 클라이언트를 교체할 수 있습니다.');
  redis=client;
}

function parse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function toSlug(value = '') {
  return String(value).replace(/[^\w\sㄱ-힣]/g, '').trim().replace(/\s+/g, '-');
}

function contentKey(slug) { return `${NS}:content:${slug}`; }
function statusKey(slug) { return `${NS}:status:${slug}`; }
function moderationKey(slug) { return `${NS}:moderation:${slug}`; }
function reviewDraftKey(slug) { return `${NS}:review_draft:${slug}`; }
function publicationStageKey(identifier) { return `${NS}:publication_stage:${identifier}`; }
function redirectKey(slug) { return `${NS}:redirect:${slug}`; }
function imageCacheKey(query) { return `${NS}:image_cache:${String(query || '').toLowerCase().replace(/[^a-z0-9ㄱ-힣]+/g, '-').slice(0, 100)}`; }
function externalCacheKey(kind, key) { return `${NS}:external_cache:${String(kind || 'data').replace(/[^a-z0-9_-]/gi, '')}:${String(key || '').toLowerCase().replace(/[^a-z0-9ㄱ-힣]+/g, '-').slice(0, 140)}`; }
function categoryFeedKey(category) { return `${NS}:feed:index:category:${category || 'general'}`; }
function viewSessionKey(slug, sessionId) { return `${NS}:view_session:${slug}:${sessionId}`; }
function viewKey(slug) { return `${NS}:views:${slug}`; }
function eventKey(date) { return `${NS}:events:${date}`; }
function tokenKey(type, date) { return `${NS}:tokens:${type}:${date}`; }
function lockKey(name) { return `${NS}:lock:${name}`; }
function cronRunKey(runId) { return `${NS}:cron:run:${runId}`; }
function cronRunTasksKey(runId) { return `${NS}:cron:tasks:${runId}`; }
function cronRunCandidatesKey(runId) { return `${NS}:cron:candidates:${runId}`; }
function cronRunContentKey(runId) { return `${NS}:cron:content:${runId}`; }

export const VISIBILITY = {
  PUBLISHED: 'published',
  HIDDEN_TOP: 'hidden_top',
  HIDDEN_FEED: 'hidden_feed',
  PRIVATE: 'private',
  TRASHED: 'trashed',
};

export const CONTENT_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  REVIEW_REQUIRED: 'review_required',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  FAILED: 'failed',
};

export async function addAudit(action, slug = '', before = null, after = null, detail = '', actor = 'admin', result = 'success', error = '') {
  try {
    const r = getRedis();
    if (!r) return;
    const row = { action, slug, before, after, detail, actor, result, error, createdAt: new Date().toISOString() };
    await r.lpush(K.audit, JSON.stringify(row));
    await r.ltrim(K.audit, 0, 499);
  } catch {}
}

export async function getAuditLogs(limit = 100) {
  try {
    const r = getRedis();
    if (!r) return [];
    return (await r.lrange(K.audit, 0, Math.max(0, limit - 1))).map(v => parse(v)).filter(Boolean);
  } catch { return []; }
}

export async function setContentStatus(slug, patch = {}) {
  try {
    const r = getRedis();
    if (!r || !slug) return null;
    const current = parse(await r.get(statusKey(slug)), {}) || {};
    const next = { ...current, ...patch, slug, updatedAt: new Date().toISOString() };
    await r.set(statusKey(slug), JSON.stringify(next));
    return next;
  } catch { return null; }
}

export async function getContentStatus(slug) {
  try {
    const r = getRedis();
    if (!r || !slug) return null;
    return parse(await r.get(statusKey(slug)), null);
  } catch { return null; }
}

function canonicalPublicUrl(value=''){
  try{
    const parsed=new URL(String(value||''));
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','ref'].forEach(key=>parsed.searchParams.delete(key));
    parsed.hash='';
    return parsed.toString().replace(/\/$/,'');
  }catch{return String(value||'').trim();}
}
function cleanedSourceFields(item={}, fallbackTitle='원문 자료 보기'){
  const source=sanitizeSourceDisplayText(item?.source||item?.publisher||item?.domain||'','');
  let title=sanitizeSourceDisplayText(item?.label||item?.displayLabel||item?.title||'',fallbackTitle);
  const normalized=value=>String(value||'').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
  const titleKey=normalized(title),sourceKey=normalized(source);
  if(!titleKey||titleKey===sourceKey||(sourceKey&&titleKey===`${sourceKey}${sourceKey}`))title=fallbackTitle;
  return {title,source};
}
function publicSourceItems(items=[]){
  const allowedTypes=new Set(['official','authorized','trusted_news','independent']);
  const seen=new Set();const rows=[];
  for(const item of Array.isArray(items)?items:[]){
    if(!allowedTypes.has(String(item?.sourceType||'')))continue;
    const link=canonicalPublicUrl(item?.link||item?.canonicalUrl||item?.url||'');
    const fields=cleanedSourceFields(item,'원문 자료 보기');
    const fallbackKey=`${fields.source.toLowerCase()}|${fields.title.toLowerCase()}`;
    const key=link||fallbackKey;
    if(!key||seen.has(key))continue;
    seen.add(key);
    rows.push({
      title:fields.title,label:fields.title,link,source:fields.source,
      publishedAt:item?.publishedAt||null,date:item?.date||null,sourceType:item?.sourceType||null,
      rightsBasis:item?.rightsBasis||null,domain:item?.domain||null,type:item?.type||null,
    });
    if(rows.length>=8)break;
  }
  return rows;
}
function publicRelatedItems(items=[]){
  const seen=new Set();const rows=[];
  for(const item of Array.isArray(items)?items:[]){
    const link=canonicalPublicUrl(item?.link||item?.url||'');
    const fields=cleanedSourceFields(item,'관련 기사 보기');
    const key=link||`${fields.source.toLowerCase()}|${fields.title.toLowerCase()}`;
    if(!key||seen.has(key))continue;
    seen.add(key);
    rows.push({type:item?.type||'reference',source:fields.source,label:fields.title,title:fields.title,link,domain:item?.domain||'',publishedAt:item?.publishedAt||null,date:item?.date||null});
    if(rows.length>=8)break;
  }
  return rows;
}
function publicContentView(content={}){
  const {factLedger,claimMap,copyrightRisk,publicationDecision,sourceSignature,fingerprint,onlineReactionInput,...raw}=content||{};
  const safe=sanitizePublicCopy(raw);
  return {...safe,sourceItems:publicSourceItems(content?.sourceItems),evidenceSources:publicSourceItems(content?.evidenceSources||content?.sourceItems),relatedNews:publicRelatedItems(content?.relatedNews),relatedContent:publicRelatedItems(content?.relatedContent),factSummary:{
    sourceCount:Number(factLedger?.sources?.length||0),factCount:Number(factLedger?.facts?.length||0),
    conflictCount:Number(factLedger?.conflicts?.length||0),
  }};
}

function buildFeedItem(source, now = new Date().toISOString(), options = {}) {
  const raw=source||{};
  const sourceHasContent=contentIsReady(raw);
  const preservePublished=options.preservePublished===true&&isPersistedPublishedContentForFeed({...raw,status:CONTENT_STATUS.PUBLISHED,visibility:raw.visibility||VISIBILITY.PUBLISHED});
  const sourcePublicReady=isPublicContentReady({...raw,status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED})||preservePublished;
  const sourceFeedReady=feedDraftIsReady({...raw,status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED})||preservePublished;
  const sourceUpdatedAt=raw.updatedAt||raw.generatedAt||now;
  const stored=sanitizePublicCopy(raw);
  return {
    feedIndexSchemaVersion:FEED_INDEX_SCHEMA_VERSION,
    sourceUpdatedAt,
    feedSeq: stored.feedSeq, slug: stored.slug, keyword: stored.keyword, contentVersion:Number(stored.contentVersion||0),
    displayTitle: stored.displayTitle || stored.keyword,
    feedTitle: stored.card?.feedTitle || stored.feedTitle || stored.displayTitle || stored.keyword,
    feedHeadline:stored.feedHeadline||stored.topTopic||'',previewLabel:stored.card?.previewLabel||'요약 정보',previewInfoLine:stored.card?.infoLine||`${stored.topKeyword||stored.keyword}에 대한 정보`,previewSummary:stored.card?.listSummary||stored.card?.summary||'',previewWhy:stored.card?.why||'',previewPoints:Array.isArray(stored.card?.points)?stored.card.points.slice(0,5):[],
    detailTitle: stored.detailTitle || stored.card?.detailTitle || '',
    summary: stored.card?.summary || '', why: stored.card?.why || '',
    category: stored.category || 'general', categoryConfidence: stored.categoryConfidence || 0,
    image: stored.image || null, thumbnail: stored.imageMeta?.thumbUrl || stored.image || null,
    imageMeta: stored.imageMeta || null, instagramCards: stored.contentMode==='trend_brief'?[]:ensurePromoCard(stored.instagramCards, stored),
    instagramCaption: stored.instagramCaption || buildInstagramCaption(stored),
    sourceItems: publicSourceItems(stored.sourceItems), evidenceSources:publicSourceItems(stored.evidenceSources||stored.sourceItems), relatedNews:publicRelatedItems(stored.relatedNews), relatedContent:publicRelatedItems(stored.relatedContent),
    sourceTitle: stored.sourceItems?.[0]?.title || '', sourceNewestAt: stored.sourceNewestAt || null,
    generatedAt: stored.generatedAt || now, updatedAt: now, visibility: stored.visibility,
    status: stored.status, qualityScore: stored.qualityScore || 0, groundingScore: stored.groundingScore || 0,
    copyrightScore: stored.copyrightScore || 0, aiStatus: stored.aiStatus || null,
    hasContent:sourceHasContent,hasNews:Boolean(stored.hasNews),contentMode:stored.contentMode||stored.contentType||'detailed',trustSummary:stored.trustSummary||null,reviewRequired:false,
    contentTier:stored.contentTier||'standard',independentSources:Number(stored.publicationDecision?.sourceStats?.independentDomains||0),
    publicReady:sourcePublicReady,feedReady:sourceFeedReady,sourceContentVersion:Number(stored.contentVersion||0),
    verifiedFactCount:Number(stored.factLedger?.facts?.filter(f=>f?.status==='confirmed'||f?.sourceType==='official').length||0),verifiedEvidenceCount:Number(stored.evidenceSources?.length||stored.sourceItems?.length||0),
  };
}

async function writeFeedIndexes(r, feedItem) {
  const timestamp = new Date(feedItem.updatedAt || feedItem.generatedAt || Date.now()).getTime() || Date.now();
  const currentViewScore=await r.zscore(K.feedViews,feedItem.slug);
  const writes=[
    r.hset(K.feedItems, { [feedItem.slug]: JSON.stringify(feedItem) }),
    r.zadd(K.feedLatest, { score: timestamp, member: feedItem.slug }),
    r.zadd(K.feedSequence, { score: Number(feedItem.feedSeq || 0), member: feedItem.slug }),
    r.zadd(categoryFeedKey(feedItem.category), { score: timestamp, member: feedItem.slug }),
    r.sadd(K.feedSlugs, feedItem.slug),
  ];
  if(currentViewScore==null){const storedViews=await r.get(viewKey(feedItem.slug));writes.push(r.zadd(K.feedViews,{score:Number(storedViews??feedItem.viewCount??0),member:feedItem.slug}));}
  await Promise.all(writes);
}

function cumulativeArchiveTimestamp(feedItem={},existing={}){
  const value=existing.archiveFirstPublishedAt||feedItem.publishedAt||feedItem.createdAt||feedItem.generatedAt||feedItem.updatedAt||new Date().toISOString();
  const time=new Date(value).getTime();
  return {iso:new Date(Number.isFinite(time)&&time>0?time:Date.now()).toISOString(),score:Number.isFinite(time)&&time>0?time:Date.now()};
}

function buildCumulativeArchiveRecord(feedItem={},existing={}){
  const now=new Date().toISOString();
  const first=cumulativeArchiveTimestamp(feedItem,existing);
  return normalizeFeedItem({
    ...existing,...feedItem,
    archiveFirstPublishedAt:first.iso,
    archiveLastPublishedAt:now,
    archivedFeed:true,
    status:CONTENT_STATUS.PUBLISHED,
    visibility:feedItem.visibility||existing.visibility||VISIBILITY.PUBLISHED,
    hasContent:true,publicReady:true,feedReady:true,
  },{trustPersisted:true});
}

async function writeCumulativeFeedArchive(r,feedItem,content=null){
  if(!feedItem?.slug)return null;
  const existing=parse(await r.hget(K.feedArchiveItems,feedItem.slug),{})||{};
  const archived=buildCumulativeArchiveRecord(feedItem,existing);
  const first=cumulativeArchiveTimestamp(archived,existing);
  const writes=[
    r.hset(K.feedArchiveItems,{[feedItem.slug]:JSON.stringify(archived)}),
    r.zadd(K.feedArchiveLatest,{score:first.score,member:feedItem.slug}),
    r.sadd(K.feedArchiveSlugs,feedItem.slug),
  ];
  if(content&&String(content.status||'')===CONTENT_STATUS.PUBLISHED){
    writes.push(r.hset(K.feedArchiveContents,{[feedItem.slug]:JSON.stringify({...content,status:CONTENT_STATUS.PUBLISHED,visibility:feedItem.visibility||VISIBILITY.PUBLISHED,archivedFeedContent:true,archiveFirstPublishedAt:first.iso,archiveLastPublishedAt:archived.archiveLastPublishedAt})}));
  }
  await Promise.all(writes);
  return archived;
}

async function removeCumulativeFeedArchive(r,slug){
  await Promise.all([
    r.hdel(K.feedArchiveItems,slug),r.hdel(K.feedArchiveContents,slug),
    r.zrem(K.feedArchiveLatest,slug),r.srem(K.feedArchiveSlugs,slug),
  ]);
}

async function updateCumulativeArchiveVisibility(r,slug,visibility,updatedAt=new Date().toISOString()){
  const raw=await r.hget(K.feedArchiveItems,slug);
  const item=parse(raw,null);
  if(!item)return;
  const next={...item,visibility,updatedAt};
  await r.hset(K.feedArchiveItems,{[slug]:JSON.stringify(next)});
  const contentRaw=await r.hget(K.feedArchiveContents,slug);
  const archivedContent=parse(contentRaw,null);
  if(archivedContent)await r.hset(K.feedArchiveContents,{[slug]:JSON.stringify({...archivedContent,visibility,updatedAt})});
  if([VISIBILITY.HIDDEN_FEED,VISIBILITY.PRIVATE,VISIBILITY.TRASHED].includes(visibility))await r.zrem(K.feedArchiveLatest,slug);
  else{
    const first=cumulativeArchiveTimestamp(next,item);
    await r.zadd(K.feedArchiveLatest,{score:first.score,member:slug});
    await r.sadd(K.feedArchiveSlugs,slug);
  }
}

async function removeFeedVisibilityIndexes(r, slug, category = 'general') {
  await Promise.all([
    r.zrem(K.feedLatest, slug), r.zrem(K.feedSequence, slug),
    r.zrem(K.feedViews, slug), r.zrem(categoryFeedKey(category), slug), r.srem(K.feedSlugs, slug),
  ]);
}
async function removeFeedIndexes(r, slug, category = 'general') {
  await Promise.all([r.hdel(K.feedItems, slug),removeFeedVisibilityIndexes(r,slug,category)]);
}

function waitForStageRetry(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function savePublicationStage(content, options = {}) {
  const r=getRedis();
  if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  if(!content?.slug)throw new Error('공개 대기 콘텐츠 slug가 없습니다.');
  const stageId=String(options.stageId||content.publicationStageId||content.slug||'').trim();
  if(!stageId)throw new Error('공개 대기 콘텐츠 식별자가 없습니다.');
  const stagedAt=new Date().toISOString();
  const base={...content,publicationStageId:stageId,publicSlug:content.slug,status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED,publicationStaged:true,stagedAt};
  const feedDraft=buildFeedItem(base,stagedAt);
  const staged={...base,feedDraft,feedReady:feedDraftIsReady(base)};
  await r.set(publicationStageKey(stageId),JSON.stringify(staged),{ex:60*60*24*7});

  // Upstash가 성공 응답을 보냈더라도 실제 읽기까지 확인해야 generated로 인정합니다.
  let lastError=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const verified=parse(await r.get(publicationStageKey(stageId)),null);
      if(verified?.slug===content.slug){
        if(verified.feedDraft&&verified.feedReady===true)return verified;
        const rebuiltDraft=buildFeedItem(verified,verified.stagedAt||verified.generatedAt||stagedAt);
        return {...verified,feedDraft:rebuiltDraft,feedReady:feedDraftIsReady(verified)};
      }
      lastError=new Error('공개 대기 콘텐츠 저장 후 확인 결과가 비어 있습니다.');
    }catch(error){lastError=error;}
    if(attempt<2)await waitForStageRetry(120*(attempt+1));
  }
  const error=new Error(lastError?.message||'공개 대기 콘텐츠 저장 검증에 실패했습니다.');
  error.code='STAGE_WRITE_VERIFY_FAILED';
  error.stageId=stageId;
  throw error;
}

export async function getPublicationStage(identifier, options = {}) {
  const stageId=String(identifier||'').trim();
  const retries=Math.max(0,Math.min(5,Number(options.retries||0)));
  const throwOnError=options.throwOnError===true;
  let lastError=null;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const r=getRedis();
      if(!r){const error=new Error('Redis가 설정되지 않았습니다.');error.code='STAGE_READ_FAILED';throw error;}
      const staged=parse(await r.get(publicationStageKey(stageId)),null);
      if(!staged)return null;
      if(staged.feedDraft&&staged.feedReady===true)return staged;
      const feedDraft=buildFeedItem(staged,staged.stagedAt||staged.generatedAt||new Date().toISOString());
      return {...staged,feedDraft,feedReady:feedDraftIsReady(staged)};
    }catch(error){
      lastError=error;
      if(attempt<retries)await waitForStageRetry(120*(attempt+1));
    }
  }
  if(throwOnError){
    const error=new Error(lastError?.message||'공개 대기 콘텐츠 조회에 실패했습니다.');
    error.code='STAGE_READ_FAILED';
    error.stageId=stageId;
    throw error;
  }
  return null;
}


// v8.0.33: 실행별 콘텐츠를 publication_stage 한 곳에만 의존하지 않습니다.
// 같은 완성본을 run snapshot hash와 publication stage에 이중 저장하고,
// 둘 중 하나만 남아 있어도 다른 쪽을 자동 복구합니다.
export async function saveTrendRunContentSnapshot(runId, candidateId, content, options = {}) {
  const r=getRedis();
  if(!r)throw Object.assign(new Error('Redis가 설정되지 않아 실행별 콘텐츠 원본을 저장할 수 없습니다.'),{code:'RUN_CONTENT_STORE_UNAVAILABLE'});
  const safeRunId=String(runId||'').trim();
  const safeCandidateId=String(candidateId||'').trim();
  if(!safeRunId||!safeCandidateId||!content?.slug){
    throw Object.assign(new Error('실행별 콘텐츠 저장 식별자가 올바르지 않습니다.'),{code:'RUN_CONTENT_ID_MISSING'});
  }
  const stageId=String(options.stageId||content.publicationStageId||`${safeRunId}:${safeCandidateId}`).trim();
  const stagedAt=new Date().toISOString();
  const checkpoint=options.checkpoint===true;
  const base={
    ...content,publicationStageId:stageId,candidateId:safeCandidateId,runId:safeRunId,publicSlug:content.slug,
    status:checkpoint?String(content.status||'researching'):CONTENT_STATUS.PUBLISHED,
    visibility:checkpoint?VISIBILITY.PRIVATE:VISIBILITY.PUBLISHED,
    publicationStaged:true,stageCheckpoint:checkpoint,stagedAt,
  };
  const feedDraft=checkpoint?null:buildFeedItem(base,stagedAt);
  const staged={...base,feedDraft,feedReady:checkpoint?false:feedDraftIsReady(base),runSnapshotVersion:2};
  const serialized=JSON.stringify(staged);
  const snapshotKey=cronRunContentKey(safeRunId);

  const snapshotAliases=[`slug:${content.slug}`,`stage:${stageId}`];
  const dualWrite=await writeDualRunSnapshot(r,{
    stageKey:publicationStageKey(stageId),snapshotKey,candidateId:safeCandidateId,aliases:snapshotAliases,serialized,
    stageTtlSec:60*60*24*14,snapshotTtlSec:60*60*24*30,retries:3,
  });
  const stage=parse(dualWrite.stage,null);
  const snapshot=parse(dualWrite.snapshot,null);
  const verified=(snapshot?.slug===content.slug?snapshot:null)||(stage?.slug===content.slug?stage:null);
  const verifiedFields=new Set(Array.isArray(dualWrite.verifiedFields)?dualWrite.verifiedFields:[]);
  const aliasesVerified=[safeCandidateId,...snapshotAliases].every(field=>verifiedFields.has(field));
  if(!verified||dualWrite.fullyVerified===false||!aliasesVerified){
    const failed=dualWrite.writes.map((row,index)=>row.status==='rejected'?`${index===0?'stage':'snapshot'}:${row.reason?.message||row.reason}`:'').filter(Boolean);
    const missingAliases=[safeCandidateId,...snapshotAliases].filter(field=>!verifiedFields.has(field));
    const suffix=[failed.length?failed.join(' / '):'',missingAliases.length?`alias 누락: ${missingAliases.join(', ')}`:''].filter(Boolean).join(' / ');
    const error=new Error(`실행별 콘텐츠 이중 저장 후 확인에 실패했습니다.${suffix?` (${suffix})`:''}`);
    error.code='RUN_CONTENT_WRITE_VERIFY_FAILED';
    error.stageId=stageId;
    error.runId=safeRunId;
    error.candidateId=safeCandidateId;
    throw error;
  }
  if(verified.feedDraft&&verified.feedReady===true)return verified;
  const rebuiltDraft=buildFeedItem(verified,verified.stagedAt||verified.generatedAt||stagedAt);
  return {...verified,feedDraft:rebuiltDraft,feedReady:feedDraftIsReady(verified)};
}

export async function getTrendRunContentSnapshot(runId, candidateId, options = {}) {
  const safeRunId=String(runId||'').trim();
  const safeCandidateId=String(candidateId||'').trim();
  if(!safeRunId||!safeCandidateId)return null;
  const retries=Math.max(0,Math.min(5,Number(options.retries||0)));
  const throwOnError=options.throwOnError===true;
  let lastError=null;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const r=getRedis();
      if(!r)throw Object.assign(new Error('Redis가 설정되지 않았습니다.'),{code:'RUN_CONTENT_READ_FAILED'});
      const fields=[safeCandidateId,options.slug?`slug:${String(options.slug).trim()}`:'',options.stageId?`stage:${String(options.stageId).trim()}`:''].filter(Boolean);
      let content=null;
      let matchedField='';
      for(const field of fields){
        content=parse(await r.hget(cronRunContentKey(safeRunId),field),null);
        if(content){matchedField=field;break;}
      }
      if(!content)return null;
      if(matchedField!==safeCandidateId){
        try{await r.hset(cronRunContentKey(safeRunId),{[safeCandidateId]:JSON.stringify({...content,candidateId:safeCandidateId,runId:safeRunId})});}catch{}
      }
      if(content.feedDraft&&content.feedReady===true)return content;
      const feedDraft=buildFeedItem(content,content.stagedAt||content.generatedAt||new Date().toISOString());
      return {...content,feedDraft,feedReady:feedDraftIsReady(content)};
    }catch(error){
      lastError=error;
      if(attempt<retries)await waitForStageRetry(120*(attempt+1));
    }
  }
  if(throwOnError){
    const error=new Error(lastError?.message||'실행별 콘텐츠 원본 조회에 실패했습니다.');
    error.code='RUN_CONTENT_READ_FAILED';
    error.runId=safeRunId;
    error.candidateId=safeCandidateId;
    throw error;
  }
  return null;
}

export async function deleteTrendRunContentSnapshot(runId) {
  try{if(runId)await getRedis()?.del(cronRunContentKey(runId));}catch{}
}

export async function publishPublicationStage(slug) {
  const r=getRedis();
  if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  const staged=parse(await r.get(publicationStageKey(slug)),null);
  if(!staged)throw new Error('공개 대기 콘텐츠를 찾을 수 없습니다.');
  if(!isPublicContentReady(staged))throw new Error('공개 준비 검증을 통과하지 못했습니다.');
  const published=await saveContent({...staged,publicationStaged:false,status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED,publishedAt:staged.publishedAt||new Date().toISOString()});
  await r.del(publicationStageKey(slug));
  return published;
}

export async function clearPublicationStage(slug) {
  try{await getRedis()?.del(publicationStageKey(slug));}catch{}
}

export async function saveReviewDraft(content) {
  try {
    const r = getRedis();
    if (!r || !content) return content;
    const slug = content.slug || toSlug(content.displayTitle || content.keyword);
    if (!slug) return content;
    const draft = { ...content, slug, status: CONTENT_STATUS.REVIEW_REQUIRED, visibility: VISIBILITY.PRIVATE, updatedAt: new Date().toISOString() };
    await r.set(reviewDraftKey(slug), JSON.stringify(draft), { ex: 60 * 60 * 24 * 30 });
    await setContentStatus(slug, { status: CONTENT_STATUS.REVIEW_REQUIRED, lastError: (draft.publicationReasons || []).join(' / ') || draft.lastError || null });
    await addAudit('review_draft_saved', slug, null, { qualityScore:draft.qualityScore, reasons:draft.publicationReasons || [] }, '자동 검증 미통과 콘텐츠 저장', 'system');
    return draft;
  } catch { return content; }
}

export async function getReviewDraft(slug) {
  try { return parse(await getRedis()?.get(reviewDraftKey(slug)), null); } catch { return null; }
}

export async function approveReviewDraft(slug) {
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  const draft = parse(await r.get(reviewDraftKey(slug)), null);
  if (!draft) throw new Error('검토 대기 초안을 찾을 수 없습니다.');
  const candidate={ ...draft, status:CONTENT_STATUS.PUBLISHED, visibility:VISIBILITY.PUBLISHED, reviewRequired:false, approvedAt:new Date().toISOString() };
  if(!isPublicContentReady(candidate))throw new Error('v8 공개 기준을 통과하지 못한 초안은 승인할 수 없습니다. 제목·요약·근거·본문을 보완하세요.');
  const approved = await saveContent(candidate);
  await r.del(reviewDraftKey(slug));
  await addAudit('review_draft_approved', slug, draft, approved, '관리자 검토 후 공개');
  return approved;
}

export async function rejectReviewDraft(slug, detail = '') {
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  const draft = parse(await r.get(reviewDraftKey(slug)), null);
  await r.del(reviewDraftKey(slug));
  await setContentStatus(slug, { status: CONTENT_STATUS.FAILED, lastError: detail || '관리자 검토에서 반려됨' });
  await addAudit('review_draft_rejected', slug, draft, null, detail || '관리자 검토에서 반려됨');
  return true;
}

export async function saveContent(content) {
  try {
    const r = getRedis();
    if (!r) {
      const error = new Error('Redis가 설정되지 않아 콘텐츠와 피드 인덱스를 저장할 수 없습니다.');
      error.code = 'REDIS_NOT_CONFIGURED';
      throw error;
    }
    if (!content) {
      const error = new Error('저장할 콘텐츠가 없습니다.');
      error.code = 'CONTENT_INVALID';
      throw error;
    }
    const slug = content.slug || toSlug(content.displayTitle || content.keyword);
    if (!slug) {
      const error = new Error('콘텐츠 slug를 생성할 수 없습니다.');
      error.code = 'CONTENT_SLUG_MISSING';
      throw error;
    }

    const existing = parse(await r.get(contentKey(slug)), null);
    const moderation = parse(await r.get(moderationKey(slug)), {}) || {};
    const status = content.status || existing?.status || CONTENT_STATUS.PENDING;
    const requestedVisibility = content.visibility || existing?.visibility || VISIBILITY.PRIVATE;
    const visibility = moderation.visibility || requestedVisibility;
    const feedSeq = existing?.feedSeq || Number(await r.incr(K.feedSeq));
    const now = new Date().toISOString();
    const stored = { ...existing, ...content, slug, feedSeq, visibility, status, updatedAt: now, createdAt: existing?.createdAt || content.createdAt || content.generatedAt || now };

    await r.set(contentKey(slug), JSON.stringify(stored));
    await r.sadd(K.contentIndex, slug);
    await setContentStatus(slug, {
      status, retryCount: Number(content.retryCount ?? existing?.retryCount ?? 0),
      lastError: content.lastError || content.aiError || null,
      startedAt: content.startedAt || existing?.startedAt || null,
      publishedAt: status === CONTENT_STATUS.PUBLISHED ? (existing?.publishedAt || now) : (existing?.publishedAt || null),
    });

    const shouldPublishFeed = isPublicContentReady(stored) && status === CONTENT_STATUS.PUBLISHED && ![VISIBILITY.PRIVATE, VISIBILITY.TRASHED, VISIBILITY.HIDDEN_FEED].includes(visibility);
    if (!shouldPublishFeed) {
      if(contentIsReady(stored)&&status===CONTENT_STATUS.PUBLISHED){
        const hiddenFeedItem=buildFeedItem(stored,now);
        await r.hset(K.feedItems,{[slug]:JSON.stringify(hiddenFeedItem)});
        await removeFeedVisibilityIndexes(r,slug,stored.category||existing?.category);
      }else{
        await removeFeedIndexes(r,slug,stored.category||existing?.category);
      }
      return stored;
    }

    const feedItem = buildFeedItem(stored, now);
    if(existing?.category&&existing.category!==stored.category)await r.zrem(categoryFeedKey(existing.category),slug);
    await writeFeedIndexes(r, feedItem);
    await writeCumulativeFeedArchive(r, feedItem, stored);

    // 이전 버전과의 호환을 위해 레거시 리스트도 유지하되, 신규 조회는 인덱스를 우선 사용합니다.
    const rows = await r.lrange(K.feed, 0, 999);
    const idx = rows.findIndex(raw => parse(raw)?.slug === slug);
    const serialized = JSON.stringify(feedItem);
    if (idx >= 0) await r.lset(K.feed, idx, serialized);
    else { await r.lpush(K.feed, serialized); await r.ltrim(K.feed, 0, 999); }
    return stored;
  } catch (error) {
    console.error('Redis saveContent error:', error);
    if (!error.code) error.code = 'CONTENT_STORE_FAILED';
    throw error;
  }
}

export async function getContent(slug, { includePrivate = false } = {}) {
  try {
    const r = getRedis();
    if (!r || !slug) return null;
    const liveContent = parse(await r.get(contentKey(slug)), null);
    if(includePrivate){
      if(!liveContent)return null;
      const moderation=parse(await r.get(moderationKey(slug)),{})||{};
      const visibility=moderation.visibility||liveContent.visibility||VISIBILITY.PUBLISHED;
      return {...liveContent,visibility,instagramCards:liveContent.contentMode==='trend_brief'?[]:ensurePromoCard(liveContent.instagramCards,liveContent),instagramCaption:liveContent.instagramCaption||buildInstagramCaption(liveContent)};
    }
    const moderation = parse(await r.get(moderationKey(slug)), {}) || {};
    const liveVisibility=moderation.visibility||liveContent?.visibility||VISIBILITY.PUBLISHED;
    const liveMerged=liveContent?{...liveContent,visibility:liveVisibility,instagramCards:liveContent.contentMode==='trend_brief'?[]:ensurePromoCard(liveContent.instagramCards,liveContent),instagramCaption:liveContent.instagramCaption||buildInstagramCaption(liveContent)}:null;
    const livePersisted=liveMerged&&isPersistedPublishedContentForFeed(liveMerged);
    if(liveMerged&&![VISIBILITY.PRIVATE,VISIBILITY.TRASHED,VISIBILITY.HIDDEN_FEED].includes(liveVisibility)&&(isPublicContentReady(liveMerged)||livePersisted))return publicContentView(liveMerged);
    const archived=parse(await r.hget(K.feedArchiveContents,slug),null);
    if(!archived)return null;
    const archivedVisibility=moderation.visibility||archived.visibility||VISIBILITY.PUBLISHED;
    if([VISIBILITY.PRIVATE,VISIBILITY.TRASHED,VISIBILITY.HIDDEN_FEED].includes(archivedVisibility))return null;
    const archivedMerged={...archived,visibility:archivedVisibility,instagramCards:archived.contentMode==='trend_brief'?[]:ensurePromoCard(archived.instagramCards,archived),instagramCaption:archived.instagramCaption||buildInstagramCaption(archived)};
    return publicContentView(archivedMerged);
  } catch { return null; }
}

export async function getContentsBatch(slugs, { includePrivate = true } = {}) {
  try {
    const r = getRedis();
    if (!r || !Array.isArray(slugs) || slugs.length === 0) return {};
    const values = await r.mget(...slugs.map(contentKey));
    const result = {};
    slugs.forEach((slug, index) => {
      const item = parse(values?.[index], null);
      if (!item) return;
      if (!includePrivate && ([VISIBILITY.PRIVATE, VISIBILITY.TRASHED].includes(item.visibility) || (!isPublicContentReady(item)&&!isPersistedPublishedContentForFeed(item)))) return;
      const merged={ ...item, instagramCards: item.contentMode==='trend_brief'?[]:ensurePromoCard(item.instagramCards, item), instagramCaption: item.instagramCaption || buildInstagramCaption(item) };
      result[slug] = includePrivate ? merged : publicContentView(merged);
    });
    return result;
  } catch { return {}; }
}

export async function getAllContents(limit = 500) {
  try {
    const r = getRedis();
    if (!r) return [];
    const slugs = await r.smembers(K.contentIndex);
    if (!Array.isArray(slugs) || slugs.length === 0) return [];
    const map = await getContentsBatch(slugs.slice(0, limit), { includePrivate: true });
    return Object.values(map).sort((a, b) => new Date(b.updatedAt || b.generatedAt || 0) - new Date(a.updatedAt || a.generatedAt || 0));
  } catch { return []; }
}

function isVisibleFeedItem(item, includeHidden = false) {
  return isVisibleFeedIndexRecord(item, includeHidden);
}

async function scanPersistedContentSlugs(r,{force=false,limit=5000}={}){
  const indexed=await r.smembers(K.contentIndex).catch(()=>[]);
  const base=new Set(Array.isArray(indexed)?indexed:[]);
  const marker=parse(await r.get(K.contentScanMarker).catch(()=>null),{})||{};
  if(!force&&base.size>PUBLIC_TOP_COUNT&&Number(marker.discovered||0)>=base.size)return [...base];
  let cursor=0;let scanned=0;
  const prefix=`${NS}:content:`;
  try{
    do{
      const response=await r.scan(cursor,{match:`${prefix}*`,count:250});
      const nextCursor=Array.isArray(response)?response[0]:(response?.cursor??0);
      const keys=Array.isArray(response)?response[1]:(response?.keys||[]);
      for(const key of Array.isArray(keys)?keys:[]){
        const value=String(key||'');
        if(value.startsWith(prefix)&&value.length>prefix.length)base.add(value.slice(prefix.length));
        if(base.size>=limit)break;
      }
      scanned+=Array.isArray(keys)?keys.length:0;
      cursor=Number(nextCursor||0);
      if(base.size>=limit)break;
    }while(cursor!==0);
  }catch(error){
    console.warn('Redis cumulative feed content scan skipped:',error?.message||error);
  }
  const discovered=[...base].filter(Boolean).slice(0,limit);
  if(discovered.length)await r.sadd(K.contentIndex,...discovered).catch(()=>{});
  await r.set(K.contentScanMarker,JSON.stringify({discovered:discovered.length,scanned,updatedAt:new Date().toISOString()}),{ex:60*60*24}).catch(()=>{});
  return discovered;
}

async function ensureCumulativeFeedArchive(r,{force=false,limit=5000}={}){
  const [markerRaw,archiveCount]=await Promise.all([
    r.get(K.feedCumulativeMigration).catch(()=>null),r.hlen(K.feedArchiveItems).catch(()=>0),
  ]);
  const marker=parse(markerRaw,{})||{};
  if(!force&&Number(marker.version||0)===1&&Number(archiveCount||0)>0)return{migrated:false,archiveCount:Number(archiveCount||0),sourceCount:Number(marker.sourceCount||0)};
  const bySlug=new Map();
  const indexed=(await r.hvals(K.feedItems).catch(()=>[])).map(value=>normalizeFeedItem(parse(value,null),{trustPersisted:true})).filter(Boolean);
  const legacy=(await r.lrange(K.feed,0,999).catch(()=>[])).map(value=>normalizeFeedItem(parse(value,null),{trustPersisted:true})).filter(Boolean);
  [...indexed,...legacy].forEach(item=>{if(item?.slug&&isVisibleFeedItem(item,true)&&!bySlug.has(item.slug))bySlug.set(item.slug,{feedItem:item,content:null});});
  const slugs=await scanPersistedContentSlugs(r,{force:true,limit});
  const values=slugs.length?await r.mget(...slugs.map(contentKey)):[];
  for(let index=0;index<slugs.length;index++){
    const content=parse(values?.[index],null);
    if(!content||String(content.status||'')!==CONTENT_STATUS.PUBLISHED)continue;
    const visibility=String(content.visibility||VISIBILITY.PUBLISHED);
    if([VISIBILITY.PRIVATE,VISIBILITY.TRASHED,VISIBILITY.HIDDEN_FEED].includes(visibility))continue;
    const persisted=isPersistedPublishedContentForFeed(content);
    if(!isPublicContentReady({...content,status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED})&&!persisted)continue;
    const feedItem=buildFeedItem(content,content.updatedAt||content.generatedAt||new Date().toISOString(),{preservePublished:persisted});
    bySlug.set(slugs[index],{feedItem,content});
  }
  let migrated=0;
  for(const {feedItem,content} of bySlug.values()){
    await writeCumulativeFeedArchive(r,feedItem,content);
    migrated+=1;
  }
  const finalCount=await r.hlen(K.feedArchiveItems).catch(()=>migrated);
  await r.set(K.feedCumulativeMigration,JSON.stringify({version:1,archiveCount:Number(finalCount||0),sourceCount:bySlug.size,migrated,updatedAt:new Date().toISOString()})).catch(()=>{});
  return{migrated:true,archiveCount:Number(finalCount||0),sourceCount:bySlug.size};
}

async function loadCumulativeArchiveRows(r,options={}){
  await ensureCumulativeFeedArchive(r).catch(error=>console.warn('Cumulative feed archive migration skipped:',error?.message||error));
  let rows=(await r.hvals(K.feedArchiveItems).catch(()=>[])).map(value=>normalizeFeedItem(parse(value,null),{trustPersisted:true})).filter(Boolean);
  rows=filterFeedRows(rows,options);
  if(rows.length){
    const views=await r.mget(...rows.map(item=>viewKey(item.slug)));
    rows=rows.map((item,index)=>({...item,viewCount:Number(views?.[index]||item.viewCount||0)}));
  }
  return sortFeedRows(rows,options.sort||'latest');
}
function normalizeFeedItem(item,{trustPersisted=false}={}){
  let safe=item?sanitizePublicCopy(item):item;
  if(!safe)return safe;
  if(trustPersisted)safe=upgradeTrustedPersistedFeedRecord(safe);
  const hasContent=safe.hasContent===true||safe.hasNews===true;
  return {...safe,sourceItems:publicSourceItems(safe.sourceItems),evidenceSources:publicSourceItems(safe.evidenceSources||safe.sourceItems),relatedNews:publicRelatedItems(safe.relatedNews),relatedContent:publicRelatedItems(safe.relatedContent),hasContent,hasNews:Boolean(safe.hasNews),publicReady:safe.publicReady===true,feedReady:safe.feedReady===true,instagramCards:safe.contentMode==='trend_brief'?[]:ensurePromoCard(safe.instagramCards,safe),viewCount:Number(safe.viewCount||0)};
}

function compactGroundedFeedText(value=''){
  return String(value||'')
    .replace(/```[\s\S]*?```/g,' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/^#{1,6}\s+/gm,' ')
    .replace(/[>*_`~|]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function groundedFeedSummary(value={}){
  const card=value?.card||{};
  const candidates=[
    card.listSummary,card.summary,value.previewSummary,value.listSummary,value.summary,card.why,value.why,
    ...(Array.isArray(card.points)?card.points:[]),value.blog,value.detailBody,value.body,
  ].map(compactGroundedFeedText).filter(Boolean);
  let summary='';
  for(const candidate of candidates){
    if(!summary)summary=candidate;
    else if(!summary.includes(candidate)&&!candidate.includes(summary))summary=`${summary} ${candidate}`;
    if(summary.length>=80)break;
  }
  return summary.slice(0,220).trim();
}

function guaranteedFeedSummary(value={},title=''){
  const grounded=groundedFeedSummary(value);
  if(grounded.length>=20)return grounded;
  const keyword=String(value?.topKeyword||value?.keyword||value?.displayTitle||title||'해당 이슈').replace(/\s+/g,' ').trim();
  const safeTitle=String(title||keyword||'해당 이슈').replace(/\s+/g,' ').trim();
  return `${keyword||safeTitle} 관련 상세 콘텐츠에서 확인된 핵심 내용을 정리했습니다.`.slice(0,220);
}

function buildGuaranteedCurrentTopFeedItem(content={},trend={},now=new Date().toISOString()){
  const merged={
    ...trend,...content,
    slug:content?.slug||trend?.slug,
    card:{...(trend?.card||{}),...(content?.card||{})},
    status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED,hasContent:true,publicReady:true,feedReady:true,
  };
  const base=buildFeedItem(merged,content?.updatedAt||content?.generatedAt||trend?.updatedAt||trend?.generatedAt||now,{preservePublished:true});
  const title=String(base.feedTitle||content?.feedTitle||content?.card?.feedTitle||trend?.feedTitle||trend?.displayTitle||trend?.topTitle||trend?.keyword||'').trim();
  const summary=guaranteedFeedSummary({...trend,...content,card:merged.card},title)||compactGroundedFeedText(trend?.previewSummary||trend?.listSummary||trend?.previewWhy||'');
  if(!merged.slug||title.length<1)return null;
  return normalizeFeedItem({
    ...base,slug:merged.slug,feedTitle:title,displayTitle:base.displayTitle||trend?.displayTitle||title,
    previewSummary:summary,summary,why:base.why||content?.card?.why||trend?.previewWhy||'',
    status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED,hasContent:true,publicReady:true,feedReady:true,
    recoveredCurrentTopFeed:true,
  },{trustPersisted:true});
}

async function feedIndexState(r,item={}){
  if(!item?.slug)return{complete:false,reasons:['slug 없음']};
  const [storedRaw,latest,sequence,category,inSet]=await Promise.all([
    r.hget(K.feedItems,item.slug),
    r.zscore(K.feedLatest,item.slug),
    r.zscore(K.feedSequence,item.slug),
    r.zscore(categoryFeedKey(item.category||'general'),item.slug),
    r.sismember(K.feedSlugs,item.slug),
  ]);
  const storedItem=normalizeFeedItem(parse(storedRaw,null),{trustPersisted:true});
  const contentReasons=feedIndexItemRejectionReasons(storedItem||{},item);
  const indexReasons=[];
  if(latest==null)indexReasons.push('최신순 인덱스 누락');
  if(sequence==null)indexReasons.push('게시번호 인덱스 누락');
  if(category==null)indexReasons.push('카테고리 인덱스 누락');
  if(!Boolean(inSet))indexReasons.push('피드 slug 집합 누락');
  const reasons=[...contentReasons,...indexReasons];
  return{
    complete:reasons.length===0,
    stored:Boolean(storedRaw),storedItem,
    latest:latest!=null,sequence:sequence!=null,category:category!=null,inSet:Boolean(inSet),
    reasons,
  };
}

async function repairPublishedFeedIndexesInternal(r,{topOnly=false,force=false,preservePublished=true}={}){
  const topRows=parse(await r.get(K.trends),[])||[];
  const topSlugs=(Array.isArray(topRows)?topRows:[]).map(row=>row?.slug).filter(Boolean);
  const contentSlugs=topOnly?topSlugs:(await scanPersistedContentSlugs(r,{force}));
  const slugs=[...new Set([...(topOnly?topSlugs:contentSlugs||[]),...topSlugs])].slice(0,5000);
  if(!slugs.length)return{checked:0,repaired:0,verified:0,skipped:0,removed:0,stale:0,missingContent:0,topOnly,force};
  const values=await r.mget(...slugs.map(contentKey));
  let repaired=0,verified=0,skipped=0,removed=0,stale=0,missingContent=0;
  const failures=[];
  for(let index=0;index<slugs.length;index++){
    const slug=slugs[index];
    const content=parse(values?.[index],null);
    if(!content){missingContent+=1;continue;}
    const explicitlyHidden=[VISIBILITY.HIDDEN_FEED,VISIBILITY.PRIVATE,VISIBILITY.TRASHED].includes(String(content.visibility||VISIBILITY.PUBLISHED));
    const strictVisible=isPublicContentReady(content)&&content.status===CONTENT_STATUS.PUBLISHED&&!explicitlyHidden;
    const persistedVisible=preservePublished&&isPersistedPublishedContentForFeed(content);
    const visible=strictVisible||persistedVisible;
    const existingRaw=await r.hget(K.feedItems,slug);
    const existing=normalizeFeedItem(parse(existingRaw,null),{trustPersisted:true});
    if(!visible){
      if(explicitlyHidden||String(content.status||'')!==CONTENT_STATUS.PUBLISHED){
        if(existingRaw){await removeFeedIndexes(r,slug,existing?.category||content.category||'general');removed+=1;}
        else skipped+=1;
      }else{
        // 생성 규칙이 바뀌어도 이전에 정상 공개된 피드를 실패 실행 중 삭제하지 않습니다.
        skipped+=1;
      }
      continue;
    }
    const feedItem=buildFeedItem(content,content.updatedAt||content.generatedAt||new Date().toISOString(),{preservePublished:persistedVisible});
    const state=await feedIndexState(r,feedItem);
    if(state.complete&&!force){skipped+=1;verified+=1;continue;}
    if(state.reasons.length)stale+=1;
    if(existing?.category&&existing.category!==feedItem.category)await r.zrem(categoryFeedKey(existing.category),slug);
    await writeFeedIndexes(r,feedItem);
    await writeCumulativeFeedArchive(r,feedItem,content);
    const verifiedState=await feedIndexState(r,feedItem);
    if(verifiedState.complete){repaired+=1;verified+=1;}
    else failures.push({slug,reasons:verifiedState.reasons});
  }
  const trendsUpdatedAt=await r.get(K.trendsUpdatedAt);
  await r.set(K.feedIndexSchema,JSON.stringify({
    version:FEED_INDEX_SCHEMA_VERSION,
    trendsUpdatedAt:trendsUpdatedAt||'',
    rebuiltAt:new Date().toISOString(),
    topOnly:Boolean(topOnly),
    checked:slugs.length,
    verified,
  }));
  return{checked:slugs.length,repaired,verified,skipped,removed,stale,missingContent,failures,topOnly,force,preservePublished};
}

export async function repairPublishedFeedIndexes(options={}){
  const r=getRedis();
  if(!r)throw new Error('Redis가 설정되지 않아 피드 인덱스를 복구할 수 없습니다.');
  const result=await repairPublishedFeedIndexesInternal(r,options||{});
  await addAudit('feed_index_repair','',null,result,options?.topOnly?'현재 TOP 피드 인덱스 자동 복구':'공개 콘텐츠 피드 인덱스 자동 복구','system');
  return result;
}

async function ensureFeedIndexes(r){
  const [latestCount,itemCount,markerRaw,trendsUpdatedAt,topRowsRaw]=await Promise.all([
    r.zcard(K.feedLatest),r.hlen(K.feedItems),r.get(K.feedIndexSchema),r.get(K.trendsUpdatedAt),r.get(K.trends),
  ]);
  const marker=parse(markerRaw,{})||{};
  const topRows=parse(topRowsRaw,[])||[];
  const topSlugs=(Array.isArray(topRows)?topRows:[]).map(row=>row?.slug).filter(Boolean).slice(0,PUBLIC_TOP_COUNT);
  let invalidTopCount=0;
  if(topSlugs.length){
    const indexed=await r.hmget(K.feedItems,...topSlugs);
    indexed.forEach((raw,index)=>{
      const item=normalizeFeedItem(parse(raw,null),{trustPersisted:true});
      if(!isCurrentFeedIndexItem(item||{},{slug:topSlugs[index]}))invalidTopCount+=1;
    });
  }
  const markerStale=Number(marker.version||0)!==FEED_INDEX_SCHEMA_VERSION
    ||String(marker.trendsUpdatedAt||'')!==String(trendsUpdatedAt||'');
  const empty=Number(latestCount||0)===0||Number(itemCount||0)===0;
  if(markerStale||invalidTopCount>0||empty){
    if(empty){
      const legacy=(await r.lrange(K.feed,0,999)).map(v=>normalizeFeedItem(parse(v),{trustPersisted:true})).filter(Boolean);
      for(const item of legacy){if(item?.slug)await writeFeedIndexes(r,{...item,feedIndexSchemaVersion:FEED_INDEX_SCHEMA_VERSION});}
    }
    const repaired=await repairPublishedFeedIndexesInternal(r,{topOnly:false,force:true});
    if(repaired.verified===0&&topSlugs.length)await repairPublishedFeedIndexesInternal(r,{topOnly:true,force:true});
  }
  const [nextLatest,nextItems]=await Promise.all([r.zcard(K.feedLatest),r.hlen(K.feedItems)]);
  return Math.min(Number(nextLatest||0),Number(nextItems||0));
}


async function loadPublishedFeedRowsFromContents(r,{topOnly=false,includeHidden=false}={}){
  const topRows=parse(await r.get(K.trends),[])||[];
  const topSlugs=(Array.isArray(topRows)?topRows:[]).map(row=>row?.slug).filter(Boolean);
  const indexedSlugs=topOnly?topSlugs:(await scanPersistedContentSlugs(r));
  const slugs=[...new Set([...(Array.isArray(indexedSlugs)?indexedSlugs:[]),...topSlugs])].filter(Boolean).slice(0,5000);
  if(!slugs.length)return[];
  const values=await r.mget(...slugs.map(contentKey));
  const rows=[];
  for(let index=0;index<slugs.length;index++){
    const content=parse(values?.[index],null);
    if(!content||String(content.status||'')!==CONTENT_STATUS.PUBLISHED)continue;
    const visibility=String(content.visibility||VISIBILITY.PUBLISHED);
    if(!includeHidden&&[VISIBILITY.HIDDEN_FEED,VISIBILITY.PRIVATE,VISIBILITY.TRASHED].includes(visibility))continue;
    const strictReady=isPublicContentReady({...content,status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED});
    const persistedReady=isPersistedPublishedContentForFeed({...content,visibility});
    if(!strictReady&&!persistedReady&&!includeHidden)continue;
    const feedItem=normalizeFeedItem(buildFeedItem(content,content.updatedAt||content.generatedAt||new Date().toISOString(),{preservePublished:persistedReady}),{trustPersisted:true});
    if(feedItem&&isVisibleFeedItem(feedItem,includeHidden))rows.push(feedItem);
  }
  return rows;
}

async function loadCurrentTopContentFeedRows(r,options={}){
  if(options.scope==='past')return[];
  const topRows=parse(await r.get(K.trends),[])||[];
  const selected=(Array.isArray(topRows)?topRows:[]).slice(0,PUBLIC_TOP_COUNT).filter(row=>row?.slug);
  if(!selected.length)return[];
  const values=await r.mget(...selected.map(row=>contentKey(row.slug)));
  const rows=[];
  for(let index=0;index<selected.length;index++){
    const trend=selected[index];
    const content=parse(values?.[index],null);
    const contentVisibility=String(content?.visibility||VISIBILITY.PUBLISHED);
    const contentBlocked=content&&[VISIBILITY.HIDDEN_FEED,VISIBILITY.PRIVATE,VISIBILITY.TRASHED].includes(contentVisibility);
    const contentPublished=!content||String(content?.status||CONTENT_STATUS.PUBLISHED)===CONTENT_STATUS.PUBLISHED;
    if(contentBlocked||!contentPublished)continue;
    const row=buildGuaranteedCurrentTopFeedItem(content||{},trend);
    if(row)rows.push(row);
  }
  return filterFeedRows(rows,options);
}

async function loadCurrentTopSnapshotFeedRows(r,options={}){
  if(options.scope==='past')return[];
  const topRows=parse(await r.get(K.trends),[])||[];
  const rows=[];
  for(const trend of Array.isArray(topRows)?topRows.slice(0,PUBLIC_TOP_COUNT):[]){
    if(!trend?.slug||trend.publicReady===false||trend.contentReady===false)continue;
    const title=String(trend.feedTitle||trend.displayTitle||trend.topTitle||trend.keyword||'').trim();
    const summary=guaranteedFeedSummary(trend,title)||compactGroundedFeedText(trend.previewSummary||trend.listSummary||trend.previewDetailSummary||trend.previewWhy||'');
    if(title.length<1)continue;
    rows.push(normalizeFeedItem({
      feedIndexSchemaVersion:FEED_INDEX_SCHEMA_VERSION,slug:trend.slug,keyword:trend.keyword||trend.topKeyword,
      displayTitle:trend.displayTitle||trend.topTitle||trend.keyword,feedTitle:title,detailTitle:trend.detailTitle||'',
      previewSummary:summary,summary,why:trend.previewWhy||'',category:trend.category||'general',
      image:trend.thumbnail||null,thumbnail:trend.thumbnail||null,imageMeta:trend.imageMeta||null,
      generatedAt:trend.generatedAt||trend.updatedAt||new Date().toISOString(),updatedAt:trend.updatedAt||trend.generatedAt||new Date().toISOString(),
      feedSeq:Number(trend.feedSeq||0),status:'published',visibility:'published',hasContent:true,publicReady:true,feedReady:true,
      qualityScore:Number(trend.qualityScore||0),verifiedFactCount:Number(trend.verifiedFactCount||0),verifiedEvidenceCount:Number(trend.verifiedEvidenceCount||0),
      recoveredFromTopSnapshot:true,
    },{trustPersisted:true}));
  }
  return filterFeedRows(rows,options);
}

function sortFeedRows(rows=[],sort='latest'){
  return [...rows].sort((a,b)=>{
    if(sort==='oldest')return new Date(a.updatedAt||a.generatedAt||0)-new Date(b.updatedAt||b.generatedAt||0);
    if(sort==='sequence')return Number(b.feedSeq||0)-Number(a.feedSeq||0);
    if(sort==='views')return Number(b.viewCount||0)-Number(a.viewCount||0)||new Date(b.updatedAt||0)-new Date(a.updatedAt||0);
    return new Date(b.updatedAt||b.generatedAt||0)-new Date(a.updatedAt||a.generatedAt||0);
  });
}

async function sourceOfTruthFeedFallback(r,options={}){
  let rows=await loadPublishedFeedRowsFromContents(r,{topOnly:options.scope==='top',includeHidden:Boolean(options.includeHidden)});
  rows=filterFeedRows(rows,options);
  const [topContentRows,archiveRows,topSnapshotRows,legacyRaw]=await Promise.all([
    loadCurrentTopContentFeedRows(r,options),
    options.scope==='top'?Promise.resolve([]):loadCumulativeArchiveRows(r,options),
    loadCurrentTopSnapshotFeedRows(r,options),
    r.lrange(K.feed,0,999).catch(()=>[]),
  ]);
  const legacyRows=filterFeedRows((Array.isArray(legacyRaw)?legacyRaw:[]).map(value=>normalizeFeedItem(parse(value,null),{trustPersisted:true})).filter(Boolean),options);
  const bySlug=new Map();
  // 현재 TOP 상세 원본을 최우선으로 사용하고, 삭제되지 않는 누적 보존소·콘텐츠 원본·TOP 스냅샷·레거시 피드를 차례로 보완합니다.
  [...topContentRows,...archiveRows,...rows,...topSnapshotRows,...legacyRows].forEach(item=>{if(item?.slug&&!bySlug.has(item.slug))bySlug.set(item.slug,item);});
  rows=filterFeedRows([...bySlug.values()],options);
  if(rows.length){
    const views=await r.mget(...rows.map(item=>viewKey(item.slug)));
    rows=rows.map((item,index)=>({...item,viewCount:Number(views?.[index]||0)}));
  }
  return sortFeedRows(rows,options.sort||'latest');
}

async function loadFeedItems(r,slugs=[]){
  if(!slugs.length)return [];
  const values=await r.hmget(K.feedItems,...slugs);
  const rows=[];
  slugs.forEach((slug,index)=>{const item=normalizeFeedItem(parse(values?.[index],null),{trustPersisted:true});if(item)rows.push(item);});
  if(rows.length){const views=await r.mget(...rows.map(item=>viewKey(item.slug)));return rows.map((item,index)=>({...item,viewCount:Number(views?.[index]||0)}));}
  return rows;
}

function filterFeedRows(rows,options={}){
  const includeHidden=Boolean(options.includeHidden);
  const topSlugs=options.topSlugs instanceof Set?options.topSlugs:new Set(options.topSlugs||[]);
  const query=String(options.search||'').trim().toLowerCase();
  return rows.filter(item=>{
    if(!isVisibleFeedItem(item,includeHidden))return false;
    const legacyUnverifiedBrief=Number(item.contentVersion||0)<100&&item.contentMode==='trend_brief'
      && Number(item.trustSummary?.evidenceSources||item.factSummary?.sourceCount||0)===0
      && !['A','B'].includes(String(item.rankingGrade||'').toUpperCase());
    if(!includeHidden&&legacyUnverifiedBrief)return false;
    if(options.category&&options.category!=='all'&&item.category!==options.category)return false;
    if(options.scope==='top'&&!topSlugs.has(item.slug))return false;
    if(options.scope==='past'&&topSlugs.has(item.slug))return false;
    if(query){const text=`${item.feedTitle||''} ${item.detailTitle||''} ${item.displayTitle||''} ${item.keyword||''} ${item.summary||''} ${item.why||''}`.toLowerCase();if(!text.includes(query))return false;}
    return true;
  });
}

export async function getFeedPosts(limit=50,offset=0,options={}){
  const target=Math.max(1,Number(limit||50)),start=Math.max(0,Number(offset||0));
  const r=getRedis();if(!r)return[];
  try{
    await ensureFeedIndexes(r);
    const search=Boolean(String(options.search||'').trim());
    const categoryNonLatest=Boolean(options.category&&options.category!=='all'&&['sequence','views'].includes(options.sort));
    const complex=search||options.scope==='top'||options.scope==='past'||Boolean(options.includeHidden)||categoryNonLatest;
    let rows=[];
    if(complex){
      const values=(await r.hvals(K.feedItems)).map(v=>normalizeFeedItem(parse(v),{trustPersisted:true})).filter(Boolean);
      rows=filterFeedRows(values,options);
      if(rows.length){const views=await r.mget(...rows.map(item=>viewKey(item.slug)));rows=rows.map((item,index)=>({...item,viewCount:Number(views?.[index]||0)}));}
      rows=sortFeedRows(rows,options.sort||'latest');
    }else{
      const category=options.category&&options.category!=='all'?options.category:null;
      let key=category?categoryFeedKey(category):K.feedLatest;
      let rev=true;
      if(options.sort==='sequence')key=K.feedSequence;
      if(options.sort==='views')key=K.feedViews;
      if(options.sort==='oldest')rev=false;
      const slugs=await r.zrange(key,start,start+target+30,{rev});
      rows=filterFeedRows(await loadFeedItems(r,slugs),options);
      // TOP 전용 조회만 인덱스 결과를 바로 반환합니다. 전체·과거 피드는
      // content:* 원본과 누적 인덱스를 반드시 병합해야 현재 TOP20에서 잘리지 않습니다.
      if(rows.length&&options.scope==='top')return rows.slice(0,target);
    }
    const currentTopExpected=options.scope!=='past'&&!String(options.search||'').trim()&&(!options.category||options.category==='all');
    if(!rows.length||currentTopExpected||options.scope!=='top'){
      const fallback=await sourceOfTruthFeedFallback(r,options);
      if(!rows.length)return fallback.slice(start,start+target);
      const merged=new Map();
      [...fallback,...rows].forEach(item=>{if(item?.slug&&!merged.has(item.slug))merged.set(item.slug,item);});
      rows=sortFeedRows([...merged.values()],options.sort||'latest');
    }
    return rows.slice(start,start+target);
  }catch(error){
    console.error('Redis getFeedPosts error:',error);
    try{return (await sourceOfTruthFeedFallback(r,options)).slice(start,start+target);}catch(fallbackError){console.error('Feed source fallback error:',fallbackError);return[];}
  }
}

export async function queryFeedPosts({limit=20,offset=0,category='all',scope='all',sort='latest',search='',topSlugs=[],includeHidden=false}={}){
  const r=getRedis();if(!r)return{items:[],total:0,recovered:false,errorCode:'REDIS_NOT_CONFIGURED'};
  const safeLimit=Math.max(1,Math.min(100,Number(limit||20)));
  const safeOffset=Math.max(0,Number(offset||0));
  const options={category,scope,sort,search,topSlugs,includeHidden};
  try{
    let all=await getFeedPosts(2000,0,options);
    let recovered=false;
    if(all.length===0&&!String(search||'').trim()){
      await repairPublishedFeedIndexesInternal(r,{topOnly:scope==='top',force:true,preservePublished:true});
      all=await getFeedPosts(2000,0,options);
      recovered=all.length>0;
    }

    // 현재 TOP은 공개 원본 그 자체를 최종 기준으로 항상 병합합니다.
    // 인덱스·contentIndex·구버전 준비 플래그가 어긋나도 TOP 상세가 열리면 피드 목록에도 반드시 나타나야 합니다.
    if(scope!=='past'){
      const [directTopRows,snapshotRows]=await Promise.all([
        loadCurrentTopContentFeedRows(r,options),
        loadCurrentTopSnapshotFeedRows(r,options),
      ]);
      const merged=new Map();
      [...directTopRows,...snapshotRows,...all].forEach(item=>{if(item?.slug&&!merged.has(item.slug))merged.set(item.slug,item);});
      const mergedRows=sortFeedRows(filterFeedRows([...merged.values()],options),sort||'latest');
      if(mergedRows.length!==all.length||directTopRows.length||snapshotRows.length)recovered=true;
      all=mergedRows;
    }

    if(all.length===0&&!String(search||'').trim()){
      all=await sourceOfTruthFeedFallback(r,options);
      recovered=all.length>0;
    }
    if(all.length===0&&!String(search||'').trim()&&scope!=='past'){
      all=await loadCurrentTopContentFeedRows(r,options);
      recovered=all.length>0;
    }

    let items=all.slice(safeOffset,safeOffset+safeLimit);
    // total은 있는데 현재 페이지가 비는 비정상 상태를 방어합니다. 첫 페이지에서는 반드시 실제 행을 반환합니다.
    if(all.length>0&&safeOffset===0&&items.length===0)items=all.slice(0,safeLimit);
    return{items,total:all.length,recovered,errorCode:recovered?'FEED_CURRENT_TOP_MERGED':''};
  }catch(error){
    console.error('Redis queryFeedPosts error:',error);
    try{
      const all=await sourceOfTruthFeedFallback(r,options);
      return{items:all.slice(safeOffset,safeOffset+safeLimit),total:all.length,recovered:all.length>0,errorCode:'FEED_INDEX_FALLBACK'};
    }catch{return{items:[],total:0,recovered:false,errorCode:'FEED_READ_FAILED'};}
  }
}

export async function getFeedCount(options={}){
  try{return (await getFeedPosts(2000,0,options||{})).length;}catch{return 0;}
}

export async function getCumulativeFeedStats(){
  try{
    const r=getRedis();
    if(!r)return{archiveCount:0,archiveIndexedCount:0,liveFeedCount:0,liveIndexedCount:0,contentIndexCount:0};
    const [archiveCount,archiveIndexedCount,liveFeedCount,liveIndexedCount,contentSlugs]=await Promise.all([
      r.hlen(K.feedArchiveItems),r.zcard(K.feedArchiveLatest),r.hlen(K.feedItems),r.zcard(K.feedLatest),r.smembers(K.contentIndex),
    ]);
    return{
      archiveCount:Number(archiveCount||0),archiveIndexedCount:Number(archiveIndexedCount||0),
      liveFeedCount:Number(liveFeedCount||0),liveIndexedCount:Number(liveIndexedCount||0),
      contentIndexCount:Array.isArray(contentSlugs)?contentSlugs.length:0,
      storagePolicy:'append-only-publication-archive-v8050',
    };
  }catch{return{archiveCount:0,archiveIndexedCount:0,liveFeedCount:0,liveIndexedCount:0,contentIndexCount:0,storagePolicy:'append-only-publication-archive-v8050'};}
}


export async function getTrendRefreshHealth() {
  try{return parse(await getRedis()?.get(K.trendRefreshHealth),{consecutiveLow:0})||{consecutiveLow:0};}catch{return{consecutiveLow:0};}
}

export async function setTrendRefreshHealth(value={}) {
  try{
    const r=getRedis();if(!r)return value;
    const row={...value,consecutiveLow:Number(value.consecutiveLow||0),updatedAt:new Date().toISOString()};
    await r.set(K.trendRefreshHealth,JSON.stringify(row),{ex:60*60*24*14});
    return row;
  }catch{return value;}
}

export async function saveTrendCandidateReport(report={}, kind='latest') {
  try {
    const r=getRedis();if(!r)return report;
    const key=kind==='preview'?K.trendCandidatesPreview:K.trendCandidatesLatest;
    await r.set(key,JSON.stringify(report),{ex:60*60*24*14});
  } catch {}
  return report;
}

export async function getTrendCandidateReport(kind='latest') {
  try {
    const r=getRedis();if(!r)return null;
    return parse(await r.get(kind==='preview'?K.trendCandidatesPreview:K.trendCandidatesLatest),null);
  } catch { return null; }
}

function normalizeTrendRuleKey(value='') {
  return String(value||'').toLowerCase().replace(/[^0-9a-z가-힣]/g,'').trim();
}

function normalizeTrendRules(value={}) {
  return {
    ...value,
    excludedKeywords:Array.isArray(value?.excludedKeywords)?value.excludedKeywords:[],
    manualApprovals:Array.isArray(value?.manualApprovals)?value.manualApprovals.filter(row=>row&&row.approved!==false):[],
  };
}

export async function getTrendRules() {
  try { return normalizeTrendRules(parse(await getRedis()?.get(K.trendRules),{excludedKeywords:[],manualApprovals:[]})||{}); }
  catch { return {excludedKeywords:[],manualApprovals:[]}; }
}

export async function updateTrendRule({keyword='',excluded=true}={}) {
  const value=String(keyword||'').replace(/\s+/g,' ').trim();
  if(!value)throw new Error('키워드가 필요합니다.');
  const before=await getTrendRules();
  const set=new Set(before.excludedKeywords||[]);
  if(excluded)set.add(value);else set.delete(value);
  const after={...before,excludedKeywords:[...set].slice(0,300),updatedAt:new Date().toISOString()};
  const r=getRedis();if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  await r.set(K.trendRules,JSON.stringify(after));
  await addAudit(excluded?'trend_candidate_excluded':'trend_candidate_allowed','',before,after,value,'admin');
  return after;
}

export async function updateTrendCandidateApproval({keyword='',eventKey='',approved=true,overrides={},note=''}={}) {
  const cleanKeyword=String(keyword||'').replace(/\s+/g,' ').trim();
  const cleanEventKey=String(eventKey||'').replace(/\s+/g,' ').trim();
  const key=normalizeTrendRuleKey(cleanEventKey||cleanKeyword);
  if(!key)throw new Error('승인할 후보 식별자가 필요합니다.');
  const before=await getTrendRules();
  const rows=(before.manualApprovals||[]).filter(row=>normalizeTrendRuleKey(row?.key||row?.eventKey||row?.keyword)!==key);
  if(approved){
    rows.unshift({
      key,keyword:cleanKeyword,eventKey:cleanEventKey,approved:true,
      overrides:{
        topKeyword:String(overrides?.topKeyword||'').replace(/\s+/g,' ').trim(),
        topTopic:String(overrides?.topTopic||'').replace(/\s+/g,' ').trim(),
        topTitle:String(overrides?.topTitle||'').replace(/\s+/g,' ').trim(),
        category:String(overrides?.category||'general').trim(),
        searchQuery:String(overrides?.searchQuery||'').replace(/\s+/g,' ').trim(),
      },
      note:String(note||'').replace(/\s+/g,' ').trim().slice(0,300),
      approvedAt:new Date().toISOString(),approvedBy:'admin',
    });
  }
  const after={...before,manualApprovals:rows.slice(0,300),updatedAt:new Date().toISOString()};
  const r=getRedis();if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  await r.set(K.trendRules,JSON.stringify(after));
  await addAudit(approved?'trend_candidate_approved':'trend_candidate_approval_revoked','',before,after,cleanKeyword||cleanEventKey,'admin');
  return after;
}

export async function saveTrends(trends) {
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않아 TOP을 저장할 수 없습니다.');
  if (!Array.isArray(trends) || trends.length !== PUBLIC_TOP_COUNT) { const error=new Error(`TOP 저장에는 정확히 ${PUBLIC_TOP_COUNT}개가 필요합니다. 현재 ${Array.isArray(trends)?trends.length:0}개입니다.`); error.code='SAVE_TRENDS_REQUIRES_TOP20'; throw error; }

  const current = parse(await r.get(K.trends), []) || [];
  const now = new Date().toISOString();
  const ranked = trends.map((item, index) => ({
    ...item,
    slug: item.slug || toSlug(item.displayTitle || item.keyword),
    rank: index + 1,
    updatedAt: now,
  })).filter(item => item.slug);
  if (ranked.length !== PUBLIC_TOP_COUNT || new Set(ranked.map(item=>item.slug)).size !== PUBLIC_TOP_COUNT) throw new Error('유효하고 중복되지 않은 TOP20이 아닙니다.');

  // 핵심 저장은 실패를 숨기지 않습니다. 목록과 갱신시각을 쓴 뒤 즉시 다시 읽어 검증합니다.
  await r.set(K.trends, JSON.stringify(ranked));
  await r.set(K.stableTrends, JSON.stringify(ranked));
  await r.set(K.trendsUpdatedAt, now);
  const [persistedRaw, persistedUpdatedAt] = await Promise.all([
    r.get(K.trends),
    r.get(K.trendsUpdatedAt),
  ]);
  const persistence = verifyPersistedTrendSet(ranked, parse(persistedRaw, []), now, persistedUpdatedAt);

  // 이전 순위와 TOP10 이력은 보조 데이터입니다. 실패해도 핵심 TOP 저장은 유지하되 경고를 남깁니다.
  try {
    if (current.length) {
      const previous = {};
      const normalizeRankKey = value => String(value || '').toLowerCase().replace(/[^0-9a-zㄱ-힣]/g, '');
      current.forEach(item => {
        const keys = [item?.trendKey, item?.rawKeyword, item?.eventKey, item?.keyword, item?.displayTitle, item?.searchQuery, item?.slug];
        keys.filter(Boolean).forEach(key => { previous[key] = item.rank; previous[normalizeRankKey(key)] = item.rank; });
      });
      await r.set(K.previousRanks, JSON.stringify(previous));
    }
    const top10Rows = {};
    ranked.slice(0, 10).forEach(item => {
      top10Rows[item.slug] = JSON.stringify({ slug:item.slug, title:item.displayTitle || item.keyword, keyword:item.keyword || item.displayTitle, firstEnteredAt:now, lastEnteredAt:now, lastRank:item.rank });
    });
    if (Object.keys(top10Rows).length) {
      const existing = await r.hmget(K.top10History, ...Object.keys(top10Rows));
      Object.keys(top10Rows).forEach((slug,index) => {
        const saved = parse(existing?.[index], null);
        if (saved) top10Rows[slug] = JSON.stringify({ ...saved, title: ranked.find(x=>x.slug===slug)?.displayTitle || saved.title, lastEnteredAt:now, lastRank:ranked.find(x=>x.slug===slug)?.rank || saved.lastRank });
      });
      await r.hset(K.top10History, top10Rows);
    }
  } catch (error) {
    console.error('saveTrends auxiliary history warning:', error);
  }
  return persistence;
}

export async function commitAtomicTopPublication(trends=[],contents=[]) {
  const r=getRedis();
  if(!r)throw new Error('Redis가 설정되지 않아 원자적 공개를 수행할 수 없습니다.');
  if(!Array.isArray(trends)||trends.length!==PUBLIC_TOP_COUNT){const error=new Error(`원자적 공개에는 정확히 ${PUBLIC_TOP_COUNT}개의 TOP이 필요합니다. 현재 ${Array.isArray(trends)?trends.length:0}개입니다.`);error.code='ATOMIC_PUBLICATION_REQUIRES_TOP20';throw error;}
  if(!Array.isArray(contents)||contents.length!==PUBLIC_TOP_COUNT){const error=new Error(`원자적 공개에는 정확히 ${PUBLIC_TOP_COUNT}개의 상세 콘텐츠가 필요합니다. 현재 ${Array.isArray(contents)?contents.length:0}개입니다.`);error.code='ATOMIC_PUBLICATION_REQUIRES_20_CONTENTS';throw error;}
  const contentMap=new Map((Array.isArray(contents)?contents:[]).map(item=>[item?.slug,item]).filter(([slug,item])=>slug&&item));
  const now=new Date().toISOString();
  const currentTop=parse(await r.get(K.trends),[])||[];
  const movementAwareTrends=applyRankMovements(trends,currentTop);
  const ranked=[];
  const storedContents=[];
  for(let index=0;index<movementAwareTrends.length;index++){
    const trend=movementAwareTrends[index];
    const slug=trend?.slug||toSlug(trend?.displayTitle||trend?.keyword||'');
    const content=contentMap.get(slug);
    if(!slug||!content||!isPublicContentReady(content)){
      const error=new Error(`TOP ${index+1}의 공개 콘텐츠 준비가 완료되지 않았습니다.`);
      error.code='ATOMIC_PUBLICATION_CONTENT_NOT_READY';
      error.slug=slug||'';
      throw error;
    }
    const existing=parse(await r.get(contentKey(slug)),null);
    const moderation=parse(await r.get(moderationKey(slug)),{})||{};
    const visibility=moderation.visibility||VISIBILITY.PUBLISHED;
    if([VISIBILITY.PRIVATE,VISIBILITY.TRASHED,VISIBILITY.HIDDEN_FEED,VISIBILITY.HIDDEN_TOP].includes(visibility)){
      const error=new Error(`관리자 공개 제한이 설정된 콘텐츠는 TOP에 공개할 수 없습니다: ${slug}`);
      error.code='ATOMIC_PUBLICATION_MODERATION_BLOCK';
      error.slug=slug;
      throw error;
    }
    const feedSeq=existing?.feedSeq||Number(await r.incr(K.feedSeq));
    const stored={...existing,...content,slug,feedSeq,status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED,publicationStaged:false,feedReady:true,updatedAt:now,createdAt:existing?.createdAt||content.createdAt||content.generatedAt||now};
    if(!feedDraftIsReady(stored)){
      const error=new Error(`TOP ${index+1}의 피드 제목·요약 준비가 완료되지 않았습니다.`);
      error.code='ATOMIC_PUBLICATION_FEED_NOT_READY';
      error.slug=slug;
      throw error;
    }
    storedContents.push(stored);
    ranked.push({...trend,slug,rank:index+1,visibility:VISIBILITY.PUBLISHED,mainVisible:true,publicReady:true,contentReady:true,updatedAt:now});
  }

  if(new Set(ranked.map(item=>item.slug)).size!==PUBLIC_TOP_COUNT){const error=new Error('중복 slug가 있어 TOP20 원자적 공개를 중단했습니다.');error.code='ATOMIC_PUBLICATION_DUPLICATE_SLUG';throw error;}

  if(currentTop.length>=PUBLIC_TOP_COUNT)await r.set(K.stableTrends,JSON.stringify(currentTop.slice(0,PUBLIC_TOP_COUNT)));

  const archiveBySlug=new Map();
  for(const stored of storedContents){
    const feedItem=buildFeedItem(stored,now);
    const existingArchive=parse(await r.hget(K.feedArchiveItems,stored.slug),{})||{};
    const archiveItem=buildCumulativeArchiveRecord(feedItem,existingArchive);
    const first=cumulativeArchiveTimestamp(archiveItem,existingArchive);
    archiveBySlug.set(stored.slug,{feedItem,archiveItem,first});
  }

  const tx=r.multi();
  for(const stored of storedContents){
    const {feedItem,archiveItem,first}=archiveBySlug.get(stored.slug);
    const viewScore=Number(await r.get(viewKey(stored.slug))||0);
    tx.set(contentKey(stored.slug),JSON.stringify(stored));
    tx.sadd(K.contentIndex,stored.slug);
    tx.set(statusKey(stored.slug),JSON.stringify({slug:stored.slug,status:CONTENT_STATUS.PUBLISHED,retryCount:0,lastError:null,publishedAt:stored.publishedAt||now,updatedAt:now}));
    tx.hset(K.feedItems,{[stored.slug]:JSON.stringify(feedItem)});
    tx.zadd(K.feedLatest,{score:new Date(feedItem.updatedAt||now).getTime(),member:stored.slug});
    tx.zadd(K.feedSequence,{score:Number(feedItem.feedSeq||0),member:stored.slug});
    tx.zadd(K.feedViews,{score:viewScore,member:stored.slug});
    tx.zadd(categoryFeedKey(feedItem.category),{score:new Date(feedItem.updatedAt||now).getTime(),member:stored.slug});
    tx.sadd(K.feedSlugs,stored.slug);
    tx.hset(K.feedArchiveItems,{[stored.slug]:JSON.stringify(archiveItem)});
    tx.hset(K.feedArchiveContents,{[stored.slug]:JSON.stringify({...stored,archivedFeedContent:true,archiveFirstPublishedAt:first.iso,archiveLastPublishedAt:archiveItem.archiveLastPublishedAt})});
    tx.zadd(K.feedArchiveLatest,{score:first.score,member:stored.slug});
    tx.sadd(K.feedArchiveSlugs,stored.slug);
    tx.del(publicationStageKey(stored.publicationStageId||stored.slug));
    if(stored.publicationStageId&&stored.publicationStageId!==stored.slug)tx.del(publicationStageKey(stored.slug));
  }
  tx.set(K.trends,JSON.stringify(ranked));
  tx.set(K.stableTrends,JSON.stringify(ranked));
  tx.set(K.trendsUpdatedAt,now);
  tx.set(K.feedIndexSchema,JSON.stringify({version:FEED_INDEX_SCHEMA_VERSION,trendsUpdatedAt:now,rebuiltAt:now,topOnly:false,cumulativeArchive:true,checked:PUBLIC_TOP_COUNT,verified:PUBLIC_TOP_COUNT}));
  await tx.exec();

  let feedPublishedCount=0;
  const missingFeedSlugs=[];
  for(const stored of storedContents){
    const state=await feedIndexState(r,buildFeedItem(stored,now));
    if(state.complete)feedPublishedCount+=1;
    else missingFeedSlugs.push(stored.slug);
  }
  let feedRepair={checked:0,repaired:0,skipped:0,missingContent:0,topOnly:true};
  if(missingFeedSlugs.length){
    feedRepair=await repairPublishedFeedIndexesInternal(r,{topOnly:true});
    feedPublishedCount=0;
    for(const stored of storedContents){
      const state=await feedIndexState(r,buildFeedItem(stored,now));
      if(state.complete)feedPublishedCount+=1;
    }
  }
  if(feedPublishedCount!==PUBLIC_TOP_COUNT){
    const error=new Error(`TOP20 공개 후 피드 인덱스가 ${feedPublishedCount}건만 확인됐습니다.`);
    error.code='ATOMIC_PUBLICATION_FEED_INCOMPLETE';
    error.details={feedPublishedCount,missingFeedSlugs,feedRepair};
    throw error;
  }

  const [persistedRaw,persistedUpdatedAt]=await Promise.all([r.get(K.trends),r.get(K.trendsUpdatedAt)]);
  const persistence=verifyPersistedTrendSet(ranked,parse(persistedRaw,[]),now,persistedUpdatedAt);
  try{await savePreviousRanks(ranked);}catch{}
  return {persistence,trends:ranked,contents:storedContents,feedPublishedCount,feedRepair};
}

function publicTrendView(item={}) {
  const {
    rankingGrade,rankingScore,rankingReasons,rankingPenalties,hardReasons,penalties,
    categoryConfidence,categoryReason,qualityScore,eventCoherence,sourceDomains,
    discoverySignals,researchDiagnostics,publicationReasons,refreshDiagnostics,
    ...safe
  }=item||{};
  return safe;
}

export async function getCachedTrends(options = {}) {
  try {
    const r = getRedis();
    if (!r) return [];
    const includeHidden = Boolean(options.includeHidden);
    const [latestRaw,stableRaw]=await Promise.all([r.get(K.trends),r.get(K.stableTrends)]);
    const latest=parse(latestRaw,[])||[];
    const stable=parse(stableRaw,[])||[];

    async function normalizeAndFilter(list=[]) {
      const normalized = list.map(item => ({ ...item, slug: item.slug || toSlug(item.displayTitle || item.keyword) }));
      const moderationValues = normalized.length ? await r.mget(...normalized.map(item => moderationKey(item.slug))) : [];
      return normalized.reduce((rows, item, index) => {
        const moderation = parse(moderationValues?.[index], {}) || {};
        const visibility = moderation.visibility || item.visibility || VISIBILITY.PUBLISHED;
        if (!includeHidden && [VISIBILITY.HIDDEN_TOP, VISIBILITY.PRIVATE, VISIBILITY.TRASHED].includes(visibility)) return rows;
        const candidate={...item,visibility};
        if(!includeHidden&&!isPublicTopCandidate(candidate))return rows;
        rows.push(candidate);
        return rows;
      }, []);
    }

    if(includeHidden){
      const adminRows=await normalizeAndFilter((latest.length?latest:stable).slice(0,PUBLIC_TOP_COUNT));
      return adminRows.map((item,index)=>({...item,rank:index+1}));
    }

    let selected=latest.length>=PUBLIC_TOP_COUNT?latest.slice(0,PUBLIC_TOP_COUNT):(stable.length>=PUBLIC_TOP_COUNT?stable.slice(0,PUBLIC_TOP_COUNT):latest.slice(0,PUBLIC_TOP_COUNT));
    let out=await normalizeAndFilter(selected);
    if(out.length!==PUBLIC_TOP_COUNT&&stable.length>=PUBLIC_TOP_COUNT&&selected!==stable){
      const stableOut=await normalizeAndFilter(stable.slice(0,PUBLIC_TOP_COUNT));
      if(stableOut.length>=PUBLIC_TOP_COUNT)out=stableOut;
    }
    return out.map((item,index)=>publicTrendView({...item,rank:index+1}));
  } catch { return []; }
}

export async function getTrendsUpdatedAt() {
  try { return (await getRedis()?.get(K.trendsUpdatedAt)) || null; } catch { return null; }
}

export async function savePreviousRanks(trends) {
  try {
    const ranks = {};
    const normalizeRankKey = value => String(value || '').toLowerCase().replace(/[^0-9a-zㄱ-힣]/g, '');
    (trends || []).forEach(t => {
      [t.trendKey, t.rawKeyword, t.eventKey, t.keyword, t.displayTitle, t.searchQuery, t.slug].filter(Boolean).forEach(key => { ranks[key] = t.rank; ranks[normalizeRankKey(key)] = t.rank; });
    });
    await getRedis()?.set(K.previousRanks, JSON.stringify(ranks));
  } catch {}
}

export async function getPreviousRanks() {
  try { return parse(await getRedis()?.get(K.previousRanks), {}) || {}; } catch { return {}; }
}

export async function updateVisibility(slug, visibility, detail = '') {
  if (!Object.values(VISIBILITY).includes(visibility)) throw new Error('잘못된 공개 상태입니다.');
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  const before = parse(await r.get(moderationKey(slug)), {}) || {};
  const after = { ...before, visibility, updatedAt: new Date().toISOString() };
  await r.set(moderationKey(slug), JSON.stringify(after));

  const content = parse(await r.get(contentKey(slug)), null);
  if (content) await r.set(contentKey(slug), JSON.stringify({ ...content, visibility, updatedAt: after.updatedAt }));
  const indexedFeed = parse(await r.hget(K.feedItems, slug), null);
  if (indexedFeed) {
    const nextFeed = { ...indexedFeed, visibility, updatedAt: after.updatedAt };
    await r.hset(K.feedItems,{[slug]:JSON.stringify(nextFeed)});
    if ([VISIBILITY.HIDDEN_FEED,VISIBILITY.PRIVATE,VISIBILITY.TRASHED].includes(visibility)) await removeFeedVisibilityIndexes(r, slug, indexedFeed.category);
    else await writeFeedIndexes(r, nextFeed);
  } else if(contentIsReady(content)&&content.status===CONTENT_STATUS.PUBLISHED&&! [VISIBILITY.HIDDEN_FEED,VISIBILITY.PRIVATE,VISIBILITY.TRASHED].includes(visibility)) {
    const feedItem=buildFeedItem({...content,visibility},after.updatedAt);
    await writeFeedIndexes(r,feedItem);
    await writeCumulativeFeedArchive(r,feedItem,{...content,visibility});
  }
  await updateCumulativeArchiveVisibility(r,slug,visibility,after.updatedAt);
  const rows = await r.lrange(K.feed, 0, 999);
  const idx = rows.findIndex(raw => parse(raw)?.slug === slug);
  if (idx >= 0) { const feed = parse(rows[idx]); await r.lset(K.feed, idx, JSON.stringify({ ...feed, visibility, updatedAt: after.updatedAt })); }
  await addAudit('visibility_change', slug, before.visibility || VISIBILITY.PUBLISHED, visibility, detail);
  return after;
}

export async function permanentlyDeleteContent(slug) {
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  const content = parse(await r.get(contentKey(slug)), null);
  const rows = await r.lrange(K.feed, 0, 999);
  const remaining = rows.map(v => parse(v)).filter(item => item && item.slug !== slug);
  await r.del(K.feed);
  if (remaining.length) await r.rpush(K.feed, ...remaining.map(JSON.stringify));
  await removeFeedIndexes(r, slug, content?.category || 'general');
  await removeCumulativeFeedArchive(r,slug);
  await Promise.all([
    r.del(contentKey(slug)), r.del(statusKey(slug)), r.del(moderationKey(slug)), r.del(reviewDraftKey(slug)), r.del(viewKey(slug)),
    r.srem(K.contentIndex, slug), r.srem(K.feedSlugs, slug),
  ]);
  await addAudit('permanent_delete', slug, content, null);
}

export async function resetFeed({ confirmation = '', createBackup = true } = {}) {
  if (confirmation !== '전체삭제') throw new Error('확인 문구가 일치하지 않습니다.');
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  const rows = await r.lrange(K.feed, 0, 999);
  const count = rows.length;
  if (createBackup && count) {
    const backupKey = `${NS}:backup:feed:${Date.now()}`;
    await r.set(backupKey, JSON.stringify(rows.map(v => parse(v)).filter(Boolean)), { ex: 60 * 60 * 24 * 7 });
  }
  await r.del(K.feed, K.feedSlugs, K.feedItems, K.feedLatest, K.feedSequence, K.feedViews, K.feedIndexSchema, K.feedArchiveItems, K.feedArchiveContents, K.feedArchiveLatest, K.feedArchiveSlugs, K.feedCumulativeMigration, K.contentScanMarker, ...['entertainment','sports','tech','ai','economy','travel','life','politics','general'].map(categoryFeedKey));
  await addAudit('reset_feed', '', { count }, { count: 0 }, '7일 백업 생성');
  return count;
}

export async function getImageCache(query) {
  try { return parse(await getRedis()?.get(imageCacheKey(query)), null); } catch { return null; }
}
export async function setImageCache(query, value, ttlSec = 60 * 60 * 24 * 7) {
  try { if (value) await getRedis()?.set(imageCacheKey(query), JSON.stringify(value), { ex: ttlSec }); } catch {}
  return value;
}


export async function getThumbnailPoolState() {
  try {
    const r=getRedis();
    if(!r)return {version:'v2-500-curated',targetSize:500,items:[],complete:false,updatedAt:null};
    const stored=parse(await r.get(K.thumbnailPool),null)||{};
    const items=Array.isArray(stored.items)?stored.items:[];
    return {...stored,version:'v2-500-curated',targetSize:500,items,complete:items.length>=500};
  } catch { return {version:'v2-500-curated',targetSize:500,items:[],complete:false,updatedAt:null}; }
}

export async function saveThumbnailPoolState(state={}) {
  const r=getRedis();if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  const items=Array.isArray(state.items)?state.items:[];
  const targetSize=Number(state.targetSize||500);
  const normalized={
    version:String(state.version||'v2-500-curated'),targetSize,items,
    complete:state.complete===true||items.length>=targetSize,
    createdAt:state.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
    failures:Array.isArray(state.failures)?state.failures:[],
  };
  await r.set(K.thumbnailPool,JSON.stringify(normalized));
  return normalized;
}

export async function updateThumbnailPoolItem(id,patch={}) {
  const state=await getThumbnailPoolState();
  const items=Array.isArray(state.items)?state.items:[];
  const index=items.findIndex(item=>item?.id===id);
  if(index<0)throw new Error('이미지 풀 항목을 찾을 수 없습니다.');
  const before=items[index];
  items[index]={...before,...patch,id:before.id,updatedAt:new Date().toISOString()};
  const saved=await saveThumbnailPoolState({...state,items});
  await addAudit('thumbnail_pool_item_update',id,before,items[index],'썸네일 이미지 풀 항목 수정');
  return {...saved,item:items[index]};
}

export async function getThumbnailUsage(limit=100) {
  try {
    const r=getRedis();if(!r)return[];
    const rows=parse(await r.get(K.thumbnailUsage),[]);
    return (Array.isArray(rows)?rows:[]).slice(0,Math.max(1,Number(limit||100)));
  } catch { return []; }
}

export async function recordThumbnailUsage(entry={}) {
  const r=getRedis();if(!r)return {recorded:false,reason:'redis_not_configured'};
  const slug=String(entry.slug||'').trim();const thumbnailImageId=String(entry.thumbnailImageId||'').trim();
  if(!slug||!thumbnailImageId)return {recorded:false,reason:'missing_identity'};
  const rows=parse(await r.get(K.thumbnailUsage),[]);const list=Array.isArray(rows)?rows:[];
  if(list.some(row=>row?.slug===slug&&row?.thumbnailImageId===thumbnailImageId))return {recorded:false,reason:'already_recorded'};
  const next=[{slug,thumbnailImageId,selectedAt:entry.selectedAt||new Date().toISOString(),selectionType:entry.selectionType||'curated-pool'},...list].slice(0,200);
  await r.set(K.thumbnailUsage,JSON.stringify(next));
  return {recorded:true,count:next.length};
}

export async function getExternalCache(kind, key) {
  try { const r=getRedis(); if(!r||!key)return null; return parse(await r.get(externalCacheKey(kind,key)),null); } catch { return null; }
}
export async function setExternalCache(kind, key, value, ttlSec = 600) {
  try { const r=getRedis(); if(!r||!key||value==null)return value; await r.set(externalCacheKey(kind,key),JSON.stringify(value),{ex:Math.max(60,Number(ttlSec||600))}); } catch {}
  return value;
}

export async function saveSNSSettings(settings) {
  try { await getRedis()?.set(K.sns, JSON.stringify(settings)); } catch {}
}
export async function getSNSSettings() {
  try { return parse(await getRedis()?.get(K.sns), { telegramAuto: false }) || { telegramAuto: false }; } catch { return { telegramAuto: false }; }
}

export async function incrementView(slug, sessionId = '') {
  try {
    const r = getRedis(); if (!r) return 0;
    const safeSession = String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    if (safeSession) {
      const accepted = await r.set(viewSessionKey(slug, safeSession), '1', { nx: true, ex: 60 * 30 });
      if (accepted !== 'OK') return Number(await r.get(viewKey(slug)) || 0);
    }
    const count = Number(await r.incr(viewKey(slug)) || 0);
    await r.zadd(K.feedViews, { score: count, member: slug });
    return count;
  } catch { return 0; }
}
export async function getViewCount(slug) {
  try { return Number(await getRedis()?.get(viewKey(slug)) || 0); } catch { return 0; }
}

export async function recordEvent(type, slug = '') {
  try {
    const r = getRedis(); if (!r) return;
    const date = new Date().toISOString().slice(0, 10);
    const key = eventKey(date);
    await r.hincrby(key, type, 1);
    if (slug) await r.hincrby(key, `${type}:${slug}`, 1);
    await r.expire(key, 60 * 60 * 24 * 90);
  } catch {}
}

export async function getEventStats(days = 7) {
  try {
    const r = getRedis(); if (!r) return [];
    const rows = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      rows.push({ date, ...((await r.hgetall(eventKey(date))) || {}) });
    }
    return rows;
  } catch { return []; }
}

export async function recordTokenUsage(usage) {
  try {
    if (!usage) return;
    const r = getRedis(); if (!r) return;
    const date = new Date().toISOString().slice(0, 10);
    await r.incrby(tokenKey('input', date), usage.input || 0);
    await r.incrby(tokenKey('output', date), usage.output || 0);
    await r.expire(tokenKey('input', date), 60 * 60 * 24 * 90);
    await r.expire(tokenKey('output', date), 60 * 60 * 24 * 90);
  } catch {}
}

export async function getTokenUsage(days = 7) {
  try {
    const r = getRedis(); if (!r) return [];
    const dates = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    const values = await r.mget(...dates.flatMap(date => [tokenKey('input', date), tokenKey('output', date)]));
    return dates.map((date, index) => ({ date, input: Number(values?.[index * 2] || 0), output: Number(values?.[index * 2 + 1] || 0) }));
  } catch { return []; }
}



export async function claimActiveTrendRefresh(runId, ttlSec = 7200) {
  const r = getRedis();
  if (!r || !runId) return { claimed:false, activeRunId:'', error:'REDIS_NOT_CONFIGURED' };
  const current = String(await r.get(K.activeTrendRefresh) || '');
  if (current === runId) {
    await r.expire(K.activeTrendRefresh, Math.max(300, Number(ttlSec || 7200)));
    return { claimed:true, activeRunId:runId, resumed:true };
  }
  if (current) return { claimed:false, activeRunId:current };
  const result = await r.set(K.activeTrendRefresh, runId, { nx:true, ex:Math.max(300, Number(ttlSec || 7200)) });
  return { claimed:result === 'OK', activeRunId:result === 'OK' ? runId : String(await r.get(K.activeTrendRefresh) || '') };
}

export async function heartbeatActiveTrendRefresh(runId, ttlSec = 7200) {
  const r = getRedis();
  if (!r || !runId) return false;
  const current = String(await r.get(K.activeTrendRefresh) || '');
  if (current !== runId) return false;
  await r.expire(K.activeTrendRefresh, Math.max(300, Number(ttlSec || 7200)));
  return true;
}

export async function releaseActiveTrendRefresh(runId) {
  const r = getRedis();
  if (!r || !runId) return false;
  const current = String(await r.get(K.activeTrendRefresh) || '');
  if (current !== runId) return false;
  await r.del(K.activeTrendRefresh);
  return true;
}



export async function getActiveTrendRefreshRunId() {
  try {
    const r=getRedis();
    if(!r)return '';
    return String(await r.get(K.activeTrendRefresh)||'');
  } catch { return ''; }
}

export async function requestTrendRefreshStop(runId='', reason='관리자 요청으로 중단') {
  const r=getRedis();
  if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  const active=String(await r.get(K.activeTrendRefresh)||'');
  const target=String(runId||active||'').trim();
  if(!target){const error=new Error('현재 실행 중인 TOP 갱신 작업이 없습니다.');error.code='NO_ACTIVE_TREND_RUN';throw error;}
  const run=await getCronRun(target);
  if(!run){const error=new Error('중단할 TOP 갱신 실행 정보를 찾을 수 없습니다.');error.code='TREND_RUN_NOT_FOUND';throw error;}
  const terminal=new Set(['completed','completed_with_errors','failed','cancelled','stopped_timeout']);
  if(terminal.has(String(run.status||'')))return {runId:target,status:run.status,alreadyTerminal:true};
  const now=new Date().toISOString();
  const message=String(reason||'관리자 요청으로 중단').slice(0,240);
  await patchCronRun(target,{
    status:'stop_requested',stopRequested:'true',stopReason:message,stopRequestedAt:now,heartbeatAt:now,
  });
  const tasks=await getCronRunTasks(target);
  let stoppedTasks=0;
  for(const task of tasks){
    if(['generated','reused','failed','stopped'].includes(String(task?.status||'')))continue;
    await updateCronRunTask(target,String(task?.candidateId||task?.slug||''),{
      status:'stopped',error:message,errorCode:'trend_refresh_cancelled',finishedAt:now,
    });
    stoppedTasks+=1;
  }
  await patchCronRun(target,{
    status:'cancelled',stopRequested:'true',stopReason:message,stopRequestedAt:now,stoppedAt:now,finishedAt:now,
    refreshCode:'trend_refresh_cancelled',error:message,heartbeatAt:now,manualRetryAllowed:'true',
  });
  if(active===target)await r.del(K.activeTrendRefresh);
  return {runId:target,status:'cancelled',stopRequestedAt:now,stoppedAt:now,stoppedTasks,activeLockReleased:active===target};
}

export async function clearTrendRefreshStop(runId='') {
  if(!runId)return null;
  return patchCronRun(runId,{stopRequested:'false',stopReason:'',stopRequestedAt:'',stoppedAt:''});
}

export async function saveTrendRunCandidates(runId, candidates = []) {
  const r = getRedis();
  if (!r || !runId) throw new Error('Redis가 설정되지 않았습니다.');
  const rows = Array.isArray(candidates) ? candidates.filter(item => item?.slug && item?.keyword) : [];
  await r.set(cronRunCandidatesKey(runId), JSON.stringify(rows), { ex:60 * 60 * 24 * 2 });
  return rows.length;
}

export async function getTrendRunCandidates(runId) {
  try {
    const r = getRedis();
    if (!r || !runId) return [];
    return parse(await r.get(cronRunCandidatesKey(runId)), []) || [];
  } catch { return []; }
}

export async function clearTrendRunWorkspace(runId) {
  try {
    const r = getRedis();
    if (!r || !runId) return;
    await r.del(cronRunCandidatesKey(runId),cronRunContentKey(runId));
  } catch {}
}

export async function acquireLock(name = 'cron', ttlSec = 300) {
  const r = getRedis();
  if (!r) return null;
  try { return (await r.set(lockKey(name), Date.now(), { nx: true, ex: ttlSec })) === 'OK'; }
  catch { return null; }
}
export async function releaseLock(name = 'cron') { try { await getRedis()?.del(lockKey(name)); } catch {} }



function cleanHashPatch(patch = {}) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined && value !== null)
  );
}

function normalizeCronRun(row = {}) {
  const numberFields = ['total', 'publishable', 'queued', 'processing', 'completed', 'generated', 'reused', 'pending', 'review', 'failed', 'retryWait', 'skipped', 'stopped', 'previousTotal', 'entered', 'dropped', 'moved', 'changed', 'baseGenerated', 'baseReused', 'baseReview', 'baseFailed', 'stepCount', 'attemptedCandidates', 'processedCandidates', 'batchCursor', 'lastCompletedCursor', 'retryCursor', 'retryProcessed', 'retryQueued', 'feedReady', 'feedPublished', 'stepBudget', 'stalledStepCount', 'progressExtensions', 'queueGeneration', 'earlyCompletionCutoffRank', 'skippedNotNeeded'];
  const result = { ...row };
  for (const field of numberFields) result[field] = Number(result[field] || 0);
  if (typeof result.contentMessageIds === 'string') {
    result.contentMessageIds = result.contentMessageIds ? result.contentMessageIds.split(',').filter(Boolean) : [];
  }
  for (const field of ['stageMeta','refreshDetails']) {
    if (typeof result[field] === 'string' && result[field]) {
      try { result[field] = JSON.parse(result[field]); } catch {}
    }
  }
  return result;
}

export async function createCronRun({ runId, trigger = 'external_cron', status = 'queued' } = {}) {
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  if (!runId) throw new Error('runId가 필요합니다.');
  const now = new Date().toISOString();
  const row = {
    runId,
    trigger,
    status,
    startedAt: now,
    updatedAt: now,
    total: 0,
    publishable: 0,
    queued: 0,
    processing: 0,
    completed: 0,
    generated: 0,
    reused: 0,
    pending: 0,
    review: 0,
    failed: 0,
    retryWait: 0,
    skipped: 0,
    stopped: 0,
    attemptedCandidates: 0,
    processedCandidates: 0,
    batchCursor: 0,
    lastCompletedCursor: 0,
    retryCursor: 0,
    retryProcessed: 0,
    retryQueued: 0,
    manualRetryAllowed: 'false',
    stepCount: 0,
    stepBudget: 0,
    stalledStepCount: 0,
    progressExtensions: 0,
    queueGeneration: 0,
    lastProgressSignature: '',
    stopRequested: 'false',
    ...currentTrendEngineMetadata(),
  };
  await r.hset(cronRunKey(runId), row);
  await r.expire(cronRunKey(runId), 60 * 60 * 24 * 30);
  await r.lpush(K.cronRuns, runId);
  await r.ltrim(K.cronRuns, 0, 49);
  return row;
}

export async function patchCronRun(runId, patch = {}) {
  const r = getRedis();
  if (!r || !runId) return null;
  const next = cleanHashPatch({ ...patch, updatedAt: new Date().toISOString() });
  if (Object.keys(next).length) await r.hset(cronRunKey(runId), next);
  await r.expire(cronRunKey(runId), 60 * 60 * 24 * 30);
  return getCronRun(runId);
}

export async function getCronRun(runId) {
  try {
    const r = getRedis();
    if (!r || !runId) return null;
    const row = await r.hgetall(cronRunKey(runId));
    if (!row || Object.keys(row).length === 0) return null;
    return normalizeCronRun(row);
  } catch { return null; }
}

export async function getCronRuns(limit = 10) {
  try {
    const r = getRedis();
    if (!r) return [];
    const ids = await r.lrange(K.cronRuns, 0, Math.max(0, Number(limit || 10) - 1));
    const rows = await Promise.all(ids.map(id => getCronRun(id)));
    const now=Date.now();
    const terminal=new Set(['completed','completed_with_errors','failed','cancelled','stopped_timeout']);
    return rows.filter(Boolean).map(run=>{
      const started=new Date(run.startedAt||run.queuedAt||run.updatedAt||0).getTime();
      const updated=new Date(run.updatedAt||run.startedAt||0).getTime();
      const ageMinutes=started>0?Math.max(0,Math.round((now-started)/60000)):0;
      const idleMinutes=updated>0?Math.max(0,Math.round((now-updated)/60000)):0;
      const qstashDeliveryStale=run.status==='queued'&&!run.callbackStartedAt&&ageMinutes>=10;
      const executionStale=!terminal.has(run.status)&&run.status!=='queued'&&idleMinutes>=10;
      return {...run,ageMinutes,idleMinutes,qstashDeliveryStale,executionStale};
    });
  } catch { return []; }
}


export async function clearGenerationHistory() {
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  const ids = await r.lrange(K.cronRuns, 0, 99);
  const keys = [];
  for (const id of ids) {
    if (!id) continue;
    keys.push(cronRunKey(id), cronRunTasksKey(id), cronRunCandidatesKey(id), cronRunContentKey(id));
  }
  if (keys.length) await r.del(...keys);
  await r.del(K.cronRuns, K.activeTrendRefresh);
  await addAudit('clear_generation_history', '', null, { clearedRuns: ids.length }, '생성 상태 기록 초기화');
  return { clearedRuns: ids.length };
}

export async function initializeCronRunTasks(runId, trends = []) {
  const r = getRedis();
  if (!r || !runId) return;
  const now = new Date().toISOString();
  await r.del(cronRunTasksKey(runId));
  const rows = {};
  for (const trend of trends) {
    if (!trend?.slug) continue;
    const candidateId=String(trend.candidateId||trend.slug);
    rows[candidateId] = JSON.stringify({
      candidateId,
      slug: trend.slug,
      publicationStageId:trend.publicationStageId||trend.slug,
      title: trend.displayTitle || trend.keyword,
      status: 'queued',
      updatedAt: now,
      attempts: 0,
    });
  }
  if (Object.keys(rows).length) await r.hset(cronRunTasksKey(runId), rows);
  await r.expire(cronRunTasksKey(runId), 60 * 60 * 24 * 30);
  await patchCronRun(runId, {
    queued: Object.keys(rows).length,
    processing: 0,
    completed: 0,
    generated: 0,
    reused: 0,
    pending: 0,
    review: 0,
    failed: 0,
    retryWait: 0,
    skipped: 0,
    stopped: 0,
    attemptedCandidates: 0,
    processedCandidates: 0,
    batchCursor: 0,
    lastCompletedCursor: 0,
    retryCursor: 0,
    retryProcessed: 0,
    retryQueued: 0,
    manualRetryAllowed: 'false',
  });
}

export async function updateCronRunTask(runId, taskId, patch = {}) {
  const r=getRedis();
  if(!r||!runId||!taskId)return null;
  const key=cronRunTasksKey(runId);
  const current=parse(await r.hget(key,taskId),{})||{};
  const candidateId=String(patch.candidateId||current.candidateId||taskId);
  const task={...current,...patch,candidateId,slug:patch.slug||current.slug||taskId,updatedAt:new Date().toISOString()};
  await r.hset(key,{[candidateId]:JSON.stringify(task)});
  await r.expire(key,60*60*24*30);

  const countFields=new Set(['queued','processing','generated','reused','pending','review','failed','retry_wait','skipped','stopped']);
  if(current.status!==task.status){
    const statusField=value=>value==='retry_wait'?'retryWait':value;
    if(countFields.has(current.status))await r.hincrby(cronRunKey(runId),statusField(current.status),-1);
    if(countFields.has(task.status))await r.hincrby(cronRunKey(runId),statusField(task.status),1);
  }
  const run=await getCronRun(runId)||{};
  const completed=Number(run.generated||0)+Number(run.reused||0)+Number(run.pending||0)+Number(run.review||0)+Number(run.failed||0)+Number(run.skipped||0)+Number(run.stopped||0);
  const total=Number(run.total||await r.hlen(key)||0);
  const terminal=total>0&&completed>=total;
  if (String(run.workflowType || '') === 'top_refresh_v2') {
    await patchCronRun(runId, {
      completed,
      ...(terminal ? { status:'candidate_processing_complete', candidateProcessingFinishedAt:new Date().toISOString() } : {}),
    });
  } else {
    await patchCronRun(runId,{completed,status:terminal?(Number(run.failed||0)>0?'completed_with_errors':'completed'):'processing',...(terminal?{finishedAt:new Date().toISOString()}:{})});
  }
  return task;
}

export async function getCronRunTasks(runId) {
  try {
    const r = getRedis();
    if (!r || !runId) return [];
    return (await r.hvals(cronRunTasksKey(runId))).map(value => parse(value, null)).filter(Boolean);
  } catch { return []; }
}


export async function getTop10History(limit = 200) {
  try {
    const r = getRedis();
    if (!r) return [];
    const values = await r.hvals(K.top10History);
    return values.map(v => parse(v, null)).filter(Boolean)
      .sort((a,b)=>new Date(b.lastEnteredAt||0)-new Date(a.lastEnteredAt||0)).slice(0,limit);
  } catch { return []; }
}

export async function getAdminRunSnapshot(limit = 10) {
  const runs = await getCronRuns(limit);
  const enriched = await Promise.all(runs.map(async run => ({ ...run, tasks: await getCronRunTasks(run.runId) })));
  return enriched;
}

export async function rebuildMissingTopFeeds({force=true}={}) {
  const trends = await getCachedTrends({ includeHidden:true });
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  const topSlugs=trends.slice(0,PUBLIC_TOP_COUNT).map(item=>item.slug).filter(Boolean);
  const archiveMigration=await ensureCumulativeFeedArchive(r,{force:true,limit:5000});
  const discovered=await scanPersistedContentSlugs(r,{force:true,limit:5000});
  const slugs=[...new Set([...discovered,...topSlugs])];
  const values=slugs.length?await r.mget(...slugs.map(contentKey)):[];
  let created = 0, needsContent = 0, skipped = 0, hidden = 0;
  const missing = [];
  for (let index=0;index<slugs.length;index++) {
    const slug=slugs[index];
    const content=parse(values?.[index],null);
    if(!content){if(topSlugs.includes(slug)){needsContent+=1;const trend=trends.find(item=>item.slug===slug);if(trend)missing.push(trend);}continue;}
    const visibility=String(content.visibility||VISIBILITY.PUBLISHED);
    if([VISIBILITY.HIDDEN_FEED,VISIBILITY.PRIVATE,VISIBILITY.TRASHED].includes(visibility)){hidden+=1;continue;}
    const persistedReady=isPersistedPublishedContentForFeed(content||{});
    const publishable=String(content.status||'')===CONTENT_STATUS.PUBLISHED&&(isPublicContentReady({...content,status:CONTENT_STATUS.PUBLISHED,visibility:VISIBILITY.PUBLISHED})||persistedReady);
    if(!publishable){if(topSlugs.includes(slug)){needsContent+=1;const trend=trends.find(item=>item.slug===slug);if(trend)missing.push(trend);}continue;}
    const feedItem=buildFeedItem(content,content.updatedAt||content.generatedAt||new Date().toISOString(),{preservePublished:persistedReady});
    const state=await feedIndexState(r,feedItem);
    if(state.complete&&!force){skipped+=1;continue;}
    if(state.storedItem?.category&&state.storedItem.category!==feedItem.category)await r.zrem(categoryFeedKey(state.storedItem.category),slug);
    await writeFeedIndexes(r,feedItem);
    await writeCumulativeFeedArchive(r,feedItem,content);
    const verified=await feedIndexState(r,feedItem);
    if(!verified.complete)throw new Error(`피드 인덱스 재구성 후 검증 실패: ${slug} (${verified.reasons.join(', ')})`);
    created += 1;
  }
  const visibleRows=await getFeedPosts(5000,0,{includeHidden:false});
  const visibleTop=visibleRows.filter(item=>topSlugs.includes(item.slug));
  const archiveCount=await r.hlen(K.feedArchiveItems).catch(()=>0);
  const result={ total:slugs.length, discovered:discovered.length, created, needsContent, skipped, hidden, missing, visibleCount:visibleRows.length, visibleTopCount:visibleTop.length, archiveCount:Number(archiveCount||0), archiveMigration, force:Boolean(force), cumulative:true };
  if(topSlugs.length&&visibleTop.length<Math.max(0,topSlugs.length-needsContent)){const error=new Error(`누적 피드 재구성 후 현재 TOP이 ${visibleTop.length}/${topSlugs.length-needsContent}건만 표시됩니다.`);error.code='FEED_REBUILD_VISIBLE_COUNT_MISMATCH';error.details=result;throw error;}
  await addAudit('rebuild_missing_feeds', '', null, result, '누적 공개 콘텐츠와 현재 TOP 피드 인덱스 전체 복구');
  return result;
}

export async function exportBackup() {
  return {
    version: '8.0.55',
    exportedAt: new Date().toISOString(),
    trends: await getCachedTrends({ includeHidden: true }),
    feed: await getFeedPosts(1000, 0, { includeHidden: true }),
    contents: await getAllContents(1000),
    thumbnailPool: await getThumbnailPoolState(),
    thumbnailUsage: await getThumbnailUsage(200),
    audit: await getAuditLogs(500),
  };
}

export async function updatePublishedThumbnailFields(slug,imageMeta={},action='thumbnail_backfill'){
  const r=getRedis();if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  const imageUrl=String(imageMeta?.imageUrl||'').trim();
  const thumbUrl=String(imageMeta?.thumbUrl||imageUrl).trim();
  if(!slug||!imageUrl)throw new Error('적용할 썸네일 정보가 없습니다.');
  const patch={
    image:imageUrl,thumbnail:thumbUrl,imageMeta,imageSource:'unsplash',thumbnailSource:'Unsplash',
    thumbnailImageId:imageMeta.thumbnailImageId||null,thumbnailCategory:imageMeta.thumbnailCategory||null,
    thumbnailMood:imageMeta.thumbnailMood||null,thumbnailSelectedAt:imageMeta.thumbnailSelectedAt||new Date().toISOString(),
    thumbnailSelectionType:imageMeta.thumbnailSelectionType||'curated-pool',
  };
  const now=new Date().toISOString();
  const beforeContent=parse(await r.get(contentKey(slug)),null);
  let afterContent=null;
  if(beforeContent){afterContent={...beforeContent,...patch,updatedAt:now};await r.set(contentKey(slug),JSON.stringify(afterContent));}
  const beforeFeed=parse(await r.hget(K.feedItems,slug),null);
  if(beforeFeed){
    const afterFeed={...beforeFeed,...patch,updatedAt:now,sourceUpdatedAt:afterContent?.updatedAt||beforeFeed.sourceUpdatedAt||now};
    await r.hset(K.feedItems,{[slug]:JSON.stringify(afterFeed)});
  }
  const beforeArchive=parse(await r.hget(K.feedArchiveItems,slug),null);
  if(beforeArchive)await r.hset(K.feedArchiveItems,{[slug]:JSON.stringify({...beforeArchive,...patch,updatedAt:now})});
  const beforeArchiveContent=parse(await r.hget(K.feedArchiveContents,slug),null);
  if(beforeArchiveContent)await r.hset(K.feedArchiveContents,{[slug]:JSON.stringify({...beforeArchiveContent,...patch,updatedAt:now})});
  for(const key of [K.trends,K.stableTrends]){
    const rows=parse(await r.get(key),[])||[];
    if(Array.isArray(rows)&&rows.some(item=>item?.slug===slug)){
      await r.set(key,JSON.stringify(rows.map(item=>item?.slug===slug?{...item,...patch,updatedAt:now}:item)));
    }
  }
  const legacy=await r.lrange(K.feed,0,999);
  const legacyIndex=legacy.findIndex(raw=>parse(raw)?.slug===slug);
  if(legacyIndex>=0){const row=parse(legacy[legacyIndex],{});await r.lset(K.feed,legacyIndex,JSON.stringify({...row,...patch,updatedAt:now}));}
  await addAudit(action,slug,beforeContent||beforeFeed,{...(afterContent||beforeFeed||{}),...patch},'사전 이미지 풀 썸네일 적용','system');
  return{slug,contentUpdated:Boolean(beforeContent),feedUpdated:Boolean(beforeFeed),imageMeta};
}

export async function updateContentFields(slug, patch = {}, action = 'update_content') {
  const r=getRedis();if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  const before=parse(await r.get(contentKey(slug)),null);if(!before)throw new Error('콘텐츠를 찾을 수 없습니다.');
  const mergedCard=patch.card?{...(before.card||{}),...patch.card}:before.card;
  const after={...before,...patch,card:mergedCard,slug,updatedAt:new Date().toISOString()};
  await r.set(contentKey(slug),JSON.stringify(after));
  const feedItem=buildFeedItem(after,after.updatedAt);
  await r.hset(K.feedItems,{[slug]:JSON.stringify(feedItem)});
  const canPublish=isPublicContentReady(after)&&after.status===CONTENT_STATUS.PUBLISHED
    &&![VISIBILITY.HIDDEN_FEED,VISIBILITY.PRIVATE,VISIBILITY.TRASHED].includes(after.visibility);
  if(canPublish){await writeFeedIndexes(r,feedItem);await writeCumulativeFeedArchive(r,feedItem,after);}
  else await removeFeedVisibilityIndexes(r,slug,before.category||after.category||'general');
  if(before.category&&before.category!==after.category)await r.zrem(categoryFeedKey(before.category),slug);
  const rows=await r.lrange(K.feed,0,999);const idx=rows.findIndex(raw=>parse(raw)?.slug===slug);
  if(idx>=0)await r.lset(K.feed,idx,JSON.stringify(feedItem));
  await addAudit(action,slug,before,after);return after;
}
export async function getReviewDrafts(limit=200){
  try{
    const r=getRedis();if(!r)return[];
    const slugs=(await r.smembers(K.contentIndex)).slice(0,limit);
    if(!slugs.length)return[];
    const values=await r.mget(...slugs.map(reviewDraftKey));
    return values.map(v=>parse(v,null)).filter(Boolean).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
  }catch{return[];}
}

export async function saveSlugRedirect(fromSlug,toSlug){
  const r=getRedis();if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  if(!fromSlug||!toSlug||fromSlug===toSlug)throw new Error('리다이렉트 slug가 올바르지 않습니다.');
  await r.set(redirectKey(fromSlug),toSlug);
  await addAudit('slug_redirect',fromSlug,null,{toSlug},'301 리다이렉트 등록');
  return{fromSlug,toSlug};
}
export async function getSlugRedirect(slug){try{return await getRedis()?.get(redirectKey(slug))||null;}catch{return null;}}

export async function migrateContentSlug(fromSlug, targetSlug) {
  const r=getRedis();if(!r)throw new Error('Redis가 설정되지 않았습니다.');
  const to=toSlug(targetSlug);
  if(!fromSlug||!to||fromSlug===to)throw new Error('새 slug가 올바르지 않습니다.');
  const [before,target,status,moderation,draft,views]=await Promise.all([
    r.get(contentKey(fromSlug)),r.get(contentKey(to)),r.get(statusKey(fromSlug)),r.get(moderationKey(fromSlug)),r.get(reviewDraftKey(fromSlug)),r.get(viewKey(fromSlug)),
  ]);
  const content=parse(before,null);if(!content)throw new Error('이관할 콘텐츠를 찾을 수 없습니다.');
  if(target)throw new Error('새 slug에 이미 콘텐츠가 존재합니다.');
  const now=new Date().toISOString();
  const migrated={...content,slug:to,previousSlugs:[...new Set([...(content.previousSlugs||[]),fromSlug])],updatedAt:now};
  await r.set(contentKey(to),JSON.stringify(migrated));
  await r.sadd(K.contentIndex,to);await r.srem(K.contentIndex,fromSlug);
  if(status)await r.set(statusKey(to),typeof status==='string'?status:JSON.stringify(status));
  if(moderation)await r.set(moderationKey(to),typeof moderation==='string'?moderation:JSON.stringify(moderation));
  if(draft){const parsedDraft=parse(draft,null);await r.set(reviewDraftKey(to),JSON.stringify({...parsedDraft,slug:to,updatedAt:now}),{ex:60*60*24*30});}
  if(views!=null)await r.set(viewKey(to),Number(views||0));
  const indexed=parse(await r.hget(K.feedItems,fromSlug),null);
  if(indexed){await removeFeedIndexes(r,fromSlug,indexed.category||content.category);await writeFeedIndexes(r,{...indexed,slug:to,viewCount:Number(views||0),updatedAt:now});}
  const archivedItem=parse(await r.hget(K.feedArchiveItems,fromSlug),null);
  const archivedContent=parse(await r.hget(K.feedArchiveContents,fromSlug),null);
  if(archivedItem){
    const migratedArchive={...archivedItem,slug:to,previousSlugs:[...new Set([...(archivedItem.previousSlugs||[]),fromSlug])],updatedAt:now};
    await r.hset(K.feedArchiveItems,{[to]:JSON.stringify(migratedArchive)});
    const first=cumulativeArchiveTimestamp(migratedArchive,archivedItem);
    await r.zadd(K.feedArchiveLatest,{score:first.score,member:to});
    await r.sadd(K.feedArchiveSlugs,to);
  }
  if(archivedContent)await r.hset(K.feedArchiveContents,{[to]:JSON.stringify({...archivedContent,slug:to,previousSlugs:[...new Set([...(archivedContent.previousSlugs||[]),fromSlug])],updatedAt:now})});
  if(archivedItem||archivedContent)await removeCumulativeFeedArchive(r,fromSlug);
  const legacy=await r.lrange(K.feed,0,999);const index=legacy.findIndex(raw=>parse(raw)?.slug===fromSlug);
  if(index>=0){const row=parse(legacy[index],{});await r.lset(K.feed,index,JSON.stringify({...row,slug:to,updatedAt:now}));}
  const trends=parse(await r.get(K.trends),[])||[];
  if(trends.some(item=>item.slug===fromSlug))await r.set(K.trends,JSON.stringify(trends.map(item=>item.slug===fromSlug?{...item,slug:to,updatedAt:now}:item)));
  const history=parse(await r.hget(K.top10History,fromSlug),null);
  if(history){await r.hset(K.top10History,{[to]:JSON.stringify({...history,slug:to})});await r.hdel(K.top10History,fromSlug);}
  await r.set(redirectKey(fromSlug),to);
  await Promise.all([r.del(contentKey(fromSlug)),r.del(statusKey(fromSlug)),r.del(moderationKey(fromSlug)),r.del(reviewDraftKey(fromSlug)),r.del(viewKey(fromSlug))]);
  await addAudit('slug_migrate',fromSlug,content,migrated,`slug 이관 및 301 등록: ${fromSlug} → ${to}`);
  return{fromSlug,toSlug:to,content:migrated};
}

export async function updateTrendFields(slug, patch = {}, action = 'update_trend') {
  const r = getRedis();
  if (!r) throw new Error('Redis가 설정되지 않았습니다.');
  const trends = parse(await r.get(K.trends), []) || [];
  const index = trends.findIndex(item => (item.slug || toSlug(item.displayTitle || item.keyword)) === slug);
  if (index < 0) throw new Error('TOP 항목을 찾을 수 없습니다.');
  const before = trends[index];
  trends[index] = { ...before, ...patch, updatedAt: new Date().toISOString() };
  await r.set(K.trends, JSON.stringify(trends));
  await addAudit(action, slug, before, trends[index]);
  return trends[index];
}
