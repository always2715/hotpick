import { getCachedContent, regenerateInstagramCards, previewTrends } from '../../lib/api';
import {
  updateVisibility, updateContentFields, updateTrendFields, permanentlyDeleteContent,
  resetFeed, getCachedTrends, getContent, addAudit, rebuildMissingTopFeeds,
  approveReviewDraft, rejectReviewDraft, saveSlugRedirect, migrateContentSlug, updateTrendRule, updateTrendCandidateApproval, clearGenerationHistory,
  getCronRunTasks, getTrendRunCandidates, getCronRun, patchCronRun, updateCronRunTask, requestTrendRefreshStop, clearTrendRefreshStop,
} from '../../lib/kv';
import { CATEGORIES } from '../../lib/categories';
import { requireAdmin } from '../../lib/adminAuth';
import { enqueueTrendRefresh, enqueueTrendRefreshStep, enqueueMissingContentJobs, enqueueSelectedContentJobs, selectTopContentCandidates, createTrendRefreshRun } from '../../lib/jobs';
import { executeTrendRefreshRun, MAX_CANDIDATE_ATTEMPTS } from '../../lib/trendRefreshJob';
import { PUBLIC_TOP_COUNT, TOP_GENERATION_POOL_COUNT } from '../../lib/topConfig';
import { assessTrendRunCompatibility, CURRENT_TREND_ENGINE_VERSION } from '../../lib/trendEnginePolicy';
import { bootstrapThumbnailPool, updateThumbnailPoolAdminItem, manualThumbnailMeta } from '../../lib/thumbnailPoolService.js';

export const config = { maxDuration: 300 };

const CONFIRM_REQUIRED_ACTIONS = new Set([
  'visibility','approve_review','reject_review','slug_redirect','migrate_slug','delete','reset_feed',
  'refresh_trends','refresh_trends_direct','resume_trend_run','stop_trend_run','stop_active_trend_run','preview_trends','regenerate','retry_selected','regenerate_top_contents','rebuild_missing_feeds','regenerate_instagram','exclude_trend','allow_trend','approve_trend_candidate','revoke_trend_candidate_approval','clear_generation_history','bootstrap_thumbnail_pool','update_thumbnail_pool_item','set_thumbnail_image',
]);

function cleanTitle(value, min = 2, max = 80) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (title.length < min) throw new Error('제목이 너무 짧습니다.');
  return title.slice(0, max);
}


function cleanCandidateApproval(values={}) {
  const topKeyword=cleanTitle(values?.topKeyword,1,30);
  const topTopic=cleanTitle(values?.topTopic,2,40);
  const generic=new Set(['현재 상황','공식 발표','관련 소식','최근 이슈','새로운 소식','최신 소식','화제','관심 증가']);
  if(generic.has(topTopic))throw new Error('관리자 승인 후보에는 구체적인 사건 유형을 입력해야 합니다.');
  const category=String(values?.category||'general');
  if(!CATEGORIES[category])throw new Error('잘못된 카테고리입니다.');
  if(topTopic==='시장·가격 변동'&&!['economy','tech'].includes(category))throw new Error('시장·가격 변동은 경제 또는 기술 카테고리에서만 승인할 수 있습니다.');
  const topTitle=`${topKeyword} · ${topTopic}`.replace(/\s+/g,' ').trim().slice(0,60);
  return {topKeyword,topTopic,topTitle,category,searchQuery:cleanTitle(values?.searchQuery||`${topKeyword} ${topTopic}`,2,80)};
}

async function resolveTrend(slug) {
  const trends = await getCachedTrends({ includeHidden: true });
  let trend = trends.find(item => item.slug === slug);
  if (trend) return { ...trend, topEligible: true };
  const existing = await getContent(slug, { includePrivate: true });
  if (!existing) return null;
  return {
    slug, keyword: existing.keyword || existing.displayTitle, displayTitle: existing.displayTitle || existing.keyword,
    topKeyword: existing.topKeyword, topTopic: existing.topTopic, topTitle: existing.topTitle,
    searchQuery: existing.searchQuery || existing.displayTitle || existing.keyword, category: existing.category,
    categoryConfidence: existing.categoryConfidence, categoryReason: existing.categoryReason,
    qualityScore: existing.qualityScore, rankingGrade: existing.rankingGrade, rankingScore: existing.rankingScore, contentTier: existing.contentTier, rank: existing.rank,
    imageMeta: existing.imageMeta || null, eventKey: existing.eventKey, topEligible: Number(existing.rank||0)>=1&&Number(existing.rank||0)<=PUBLIC_TOP_COUNT&&['full','standard','brief'].includes(String(existing.contentTier||'')),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  const { action, slug, value, values, confirmation, slugs, detail, confirmed } = req.body || {};
  try {
    if (CONFIRM_REQUIRED_ACTIONS.has(action) && confirmed !== true) {
      return res.status(409).json({ error: '관리자 확인 화면에서 최종 실행을 눌러야 합니다.', confirmationRequired: true });
    }
    if (action === 'visibility') return res.json({ success:true, result:await updateVisibility(slug, value, '관리자 화면 변경') });
    if (action === 'category') {
      if (!CATEGORIES[value]) return res.status(400).json({ error:'잘못된 카테고리입니다.' });
      let content=null,trend=null;
      try { content=await updateContentFields(slug,{category:value,categoryLabel:CATEGORIES[value].label,categoryConfidence:1,categoryReason:'관리자 수동 지정'},'category_change'); } catch {}
      try { trend=await updateTrendFields(slug,{category:value,categoryConfidence:1,categoryReason:'관리자 수동 지정'},'category_change'); } catch {}
      return res.json({success:true,content,trend});
    }
    if (action === 'titles') {
      const patch = {
        ...(values?.topKeyword != null ? { topKeyword:cleanTitle(values.topKeyword,1,30) } : {}),
        ...(values?.topTopic != null ? { topTopic:cleanTitle(values.topTopic,1,40) } : {}),
        ...(values?.topTitle != null ? { topTitle:cleanTitle(values.topTitle,2,60), displayTitle:cleanTitle(values.topTitle,2,60) } : {}),
        ...(values?.feedTitle != null ? { feedTitle:cleanTitle(values.feedTitle,18,32), card:{ feedTitle:cleanTitle(values.feedTitle,18,32) } } : {}),
        ...(values?.detailTitle != null ? { detailTitle:cleanTitle(values.detailTitle,28,50), card:{ ...(values?.feedTitle != null ? {feedTitle:cleanTitle(values.feedTitle,18,32)} : {}), detailTitle:cleanTitle(values.detailTitle,28,50) } } : {}),
        ...(values?.instagramTitle != null ? { instagramTitle:cleanTitle(values.instagramTitle,4,56) } : {}),
      };
      let content=null,trend=null;
      try { content=await updateContentFields(slug,patch,'titles_change'); } catch {}
      const trendPatch={};
      ['topKeyword','topTopic','topTitle','displayTitle'].forEach(key=>{if(patch[key]!=null)trendPatch[key]=patch[key];});
      if(Object.keys(trendPatch).length)try{trend=await updateTrendFields(slug,trendPatch,'titles_change');}catch{}
      return res.json({success:true,content,trend});
    }
    if (action === 'title') {
      const title=cleanTitle(value,2,60);
      let content=null,trend=null;
      try{content=await updateContentFields(slug,{topTitle:title,displayTitle:title},'title_change');}catch{}
      try{trend=await updateTrendFields(slug,{topTitle:title,displayTitle:title},'title_change');}catch{}
      return res.json({success:true,content,trend});
    }
    if (action === 'approve_review') {
      const content=await approveReviewDraft(slug);
      // 검토 승인은 피드 공개로 끝내지 않고 다음 TOP 조사 시드에도 등록합니다.
      await updateTrendCandidateApproval({
        keyword:String(content?.keyword||content?.topKeyword||content?.displayTitle||slug),
        eventKey:String(content?.eventKey||''),approved:true,
        overrides:{topKeyword:content?.topKeyword||content?.keyword||'',topTopic:content?.topTopic||'',topTitle:content?.topTitle||content?.displayTitle||'',category:content?.category||'general',searchQuery:content?.searchQuery||content?.keyword||''},
        note:'검토 대기 승인 콘텐츠 자동 TOP 재심사',
      });
      let queued=null,queueError='';
      try{queued=await enqueueTrendRefresh({trigger:'admin_review_approval'});}catch(error){queueError=String(error?.message||'검토 승인 후 TOP 갱신 등록 실패');}
      return res.status(queued?202:200).json({success:true,content,queued,runId:queued?.runId||'',queueError});
    }
    if (action === 'reject_review') return res.json({success:true,result:await rejectReviewDraft(slug,String(detail||''))});
    if (action === 'slug_redirect') return res.json({success:true,result:await saveSlugRedirect(slug,String(value||'').trim())});
    if (action === 'migrate_slug') return res.json({success:true,result:await migrateContentSlug(slug,String(value||'').trim())});
    if (action === 'delete') {
      if (confirmation !== '영구삭제') return res.status(400).json({ error:'확인 문구가 일치하지 않습니다.' });
      await permanentlyDeleteContent(slug); return res.json({success:true});
    }
    if (action === 'reset_feed') return res.json({success:true,count:await resetFeed({confirmation,createBackup:true})});
    if (action === 'refresh_trends') {
      // 기본 경로는 QStash입니다. 관리자 화면에서 runId와 메시지 ID를 즉시 확인할 수 있습니다.
      const queued=await enqueueTrendRefresh({trigger:'admin'});
      return res.status(202).json({success:true,accepted:true,runId:queued.runId,qstashMessageId:queued.messageId});
    }
    if (action === 'refresh_trends_direct') {
      // 시작 단계만 관리자 요청에서 수행하고, 오래 걸리는 후보 조사는 QStash 소배치로 이어갑니다.
      const {runId}=await createTrendRefreshRun({trigger:'admin_direct'});
      const result=await executeTrendRefreshRun(runId,{actor:'admin',trigger:'admin_direct'});
      return res.status(202).json({success:true,accepted:true,runId,result});
    }
    if (action === 'stop_trend_run') {
      const runId=String(values?.runId||value||'').trim();
      const result=await requestTrendRefreshStop(runId,String(detail||'관리자 화면에서 중단'));
      await addAudit('trend_refresh_stop_requested','',null,result,'TOP 갱신 중단 요청','admin');
      return res.json({success:true,result});
    }
    if (action === 'stop_active_trend_run') {
      const runId=String(values?.runId||value||'').trim();
      const result=await requestTrendRefreshStop(runId,String(detail||'관리자 화면에서 현재 TOP 작업 즉시 중단'));
      await addAudit('trend_refresh_stopped','',null,result,'현재 TOP 갱신 즉시 중단','admin','stopped','');
      return res.json({success:true,result});
    }
    if (action === 'resume_trend_run') {
      const runId=String(values?.runId||value||'').trim();
      if(!runId)return res.status(400).json({error:'재개할 runId가 필요합니다.'});
      const [run,candidates,tasks]=await Promise.all([getCronRun(runId),getTrendRunCandidates(runId),getCronRunTasks(runId)]);
      if(!candidates.length)return res.status(409).json({error:'이 실행의 저장된 후보 목록이 없습니다. 새 TOP 갱신을 실행하세요.'});
      const compatibility=assessTrendRunCompatibility(run||{});
      if(!compatibility.compatible){
        return res.status(409).json({error:`이 실행은 ${compatibility.engineVersion||'이전'} 엔진 기준이라 현재 TOP25 생성·TOP20 공개 정책으로 재개할 수 없습니다.`,topCountMigrationRequired:true,currentEngineVersion:CURRENT_TREND_ENGINE_VERSION,...compatibility});
      }
      const needsIdentityMigration=candidates.some(candidate=>!candidate?.candidateId||!candidate?.publicationStageId);
      const needsFixedTop20Migration=candidates.length!==TOP_GENERATION_POOL_COUNT||candidates.some(candidate=>candidate?.fixedTop25Pool!==true);
      if(needsFixedTop20Migration){
        return res.status(409).json({error:`이 실행은 ${candidates.length}개 후보 기준 작업이라 25개 생성 후보 중 성공한 상위 20개 공개 정책으로 안전하게 재개할 수 없습니다. 기존 작업을 중단하고 새 TOP 갱신을 시작하세요.`,topCountMigrationRequired:true,currentCandidateCount:candidates.length,targetTopCount:PUBLIC_TOP_COUNT,generationPoolCount:TOP_GENERATION_POOL_COUNT});
      }
      const ready=tasks.filter(task=>['generated','reused'].includes(task.status)).length;
      let phase='start';
      let cursor=0;
      let retryableCount=0;
      if(!needsIdentityMigration&&!needsFixedTop20Migration){
        for(const task of tasks){
          if(['generated','reused'].includes(String(task?.status||'')))continue;
          if(Number(task?.attempts||0)>=MAX_CANDIDATE_ATTEMPTS)continue;
          const taskId=String(task?.candidateId||task?.slug||'');
          if(!taskId)continue;
          await updateCronRunTask(runId,taskId,{
            status:'retry_wait',
            error:task?.error||'관리자가 추가 검색을 다시 요청했습니다.',
            errorCode:task?.errorCode||'ADMIN_EXPLICIT_RETRY',
            nextAction:'manual_explicit_retry',
            finishedAt:'',
          });
          retryableCount+=1;
        }
        phase=retryableCount>0?'retry':'finalize';
      }
      await clearTrendRefreshStop(runId);
      await patchCronRun(runId,{
        status:'resume_queued',error:'',refreshCode:'',resumedAt:new Date().toISOString(),finishedAt:'',
        manualRetryAllowed:'true',retryCursor:0,retryProcessed:0,retryQueued:retryableCount,
        stepCount:0,lastPhase:'admin_resume',
        resumeNeedsIdentityMigration:needsIdentityMigration?'true':'false',
        resumeNeedsFixedTop20Migration:needsFixedTop20Migration?'true':'false',
      });
      const queued=await enqueueTrendRefreshStep({runId,trigger:'admin_resume',phase,cursor});
      await addAudit('trend_refresh_resumed','',null,{runId,phase,cursor,readyCount:ready,retryableCount,needsIdentityMigration,needsFixedTop20Migration,messageId:queued.messageId||''},'중단된 TOP 배치 실행 명시적 재개','admin');
      return res.status(202).json({success:true,accepted:true,runId,phase,cursor,readyCount:ready,retryableCount,needsIdentityMigration,needsFixedTop20Migration,qstashMessageId:queued.messageId||''});
    }
    if (action === 'preview_trends') {
      const result=await previewTrends();
      await addAudit('trend_preview','',null,{count:result.trends?.length||0,diagnostics:result.report?.diagnostics||{}},'TOP 미리 계산','admin');
      return res.json({success:true,result});
    }
    if (action === 'exclude_trend') return res.json({success:true,rules:await updateTrendRule({keyword:value,excluded:true})});
    if (action === 'allow_trend') return res.json({success:true,rules:await updateTrendRule({keyword:value,excluded:false})});
    if (action === 'approve_trend_candidate') {
      const overrides=cleanCandidateApproval(values||{});
      const rules=await updateTrendCandidateApproval({keyword:String(values?.keyword||value||''),eventKey:String(values?.eventKey||''),approved:true,overrides,note:String(detail||'')});
      let queued=null,queueError='';
      try{queued=await enqueueTrendRefresh({trigger:'admin_approval'});}catch(error){queueError=String(error?.message||'승인 후 TOP 갱신 등록 실패');}
      return res.status(queued?202:200).json({success:true,rules,queued,runId:queued?.runId||'',qstashMessageId:queued?.messageId||'',queueError,approvalSaved:true});
    }
    if (action === 'revoke_trend_candidate_approval') {
      const rules=await updateTrendCandidateApproval({keyword:String(values?.keyword||value||''),eventKey:String(values?.eventKey||''),approved:false});
      return res.json({success:true,rules});
    }
    if (action === 'regenerate') {
      const trend=await resolveTrend(slug);
      if(!trend)return res.status(404).json({error:'콘텐츠를 찾을 수 없습니다.'});
      const content=await getCachedContent(slug,trend.keyword,trend.imageMeta||null,trend,{force:true});
      await addAudit('regenerate',slug,null,{status:content.status,hasContent:content.hasContent??content.hasNews,hasNews:content.hasNews,qualityScore:content.qualityScore});
      return res.json({success:true,content});
    }
    if (action === 'retry_selected') {
      const selected=[...new Set((Array.isArray(slugs)?slugs:[]).map(String).filter(Boolean))].slice(0,PUBLIC_TOP_COUNT);
      if(!selected.length)return res.status(400).json({error:'재시도할 항목을 선택하세요.'});
      const resolved=(await Promise.all(selected.map(resolveTrend))).filter(Boolean);
      const queued=await enqueueSelectedContentJobs(resolved,{trigger:'admin_selected_retry'});
      return res.status(202).json({success:true,queued});
    }
    if (action === 'regenerate_top_contents') {
      const trends=selectTopContentCandidates(await getCachedTrends({includeHidden:true}),{limit:PUBLIC_TOP_COUNT});
      if(!trends.length)return res.status(400).json({error:'재생성할 현재 공개 TOP1~20 콘텐츠가 없습니다.'});
      const queued=await enqueueSelectedContentJobs(trends,{trigger:'admin_top_regenerate'});
      return res.status(202).json({success:true,queued,count:trends.length});
    }
    if (action === 'clear_generation_history') return res.json({success:true,result:await clearGenerationHistory()});
    if (action === 'rebuild_missing_feeds') {
      const result=await rebuildMissingTopFeeds({force:true});
      let queued=null;if(result.missing?.length)queued=await enqueueMissingContentJobs(result.missing,{trigger:'admin_missing_feed'});
      return res.status(queued?202:200).json({success:true,result,queued});
    }
    if (action === 'regenerate_instagram') return res.json({success:true,content:await regenerateInstagramCards(slug)});

    if (action === 'bootstrap_thumbnail_pool') {
      const result=await bootstrapThumbnailPool({force:Boolean(values?.force)});
      await addAudit('bootstrap_thumbnail_pool','',null,{count:result?.items?.length||0,version:result?.version||null,failures:result?.failures||[]},'Unsplash 사전 썸네일 이미지 풀 구축');
      return res.json({success:true,result});
    }
    if (action === 'update_thumbnail_pool_item') {
      const imageId=String(values?.imageId||value||'').trim();
      if(!imageId)throw new Error('수정할 이미지 ID가 없습니다.');
      return res.json({success:true,result:await updateThumbnailPoolAdminItem(imageId,values?.patch||{})});
    }
    if (action === 'set_thumbnail_image') {
      const imageId=String(values?.imageId||value||'').trim();
      const targetSlug=String(slug||values?.slug||'').trim();
      if(!targetSlug||!imageId)throw new Error('콘텐츠와 이미지 ID를 확인하세요.');
      const imageMeta=await manualThumbnailMeta(imageId);
      const patch={
        image:imageMeta.imageUrl,thumbnail:imageMeta.thumbUrl||imageMeta.imageUrl,imageMeta,imageSource:'unsplash',thumbnailSource:'Unsplash',
        thumbnailImageId:imageMeta.thumbnailImageId,thumbnailCategory:imageMeta.thumbnailCategory,thumbnailMood:imageMeta.thumbnailMood,
        thumbnailSelectedAt:imageMeta.thumbnailSelectedAt,thumbnailSelectionType:'manual',
      };
      let content=null,trend=null;
      try{content=await updateContentFields(targetSlug,patch,'manual_thumbnail_update');}catch(error){if(!/찾을 수 없습니다/.test(String(error?.message||'')))throw error;}
      try{trend=await updateTrendFields(targetSlug,patch,'manual_thumbnail_update');}catch(error){if(!/찾을 수 없습니다/.test(String(error?.message||'')))throw error;}
      if(!content&&!trend)throw new Error('이미지를 적용할 콘텐츠 또는 TOP 항목을 찾을 수 없습니다.');
      return res.json({success:true,result:{content,trend,imageMeta}});
    }
    return res.status(400).json({error:'지원하지 않는 작업입니다.'});
  } catch (error) {
    await addAudit(action||'admin_action',slug||'',null,null,'','admin','failed',error.message||'작업 실패');
    return res.status(500).json({success:false,error:error.message||'작업 실패'});
  }
}
