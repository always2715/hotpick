import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import { CATEGORIES } from '../lib/categories';
import {
  getCachedTrends, getFeedPosts, getAllContents, getAuditLogs, getTokenUsage,
  getEventStats, getAdminRunSnapshot, getTop10History, getReviewDrafts,
  getTrendCandidateReport, getTrendRules, getTrendsUpdatedAt, getTrendRefreshHealth, getActiveTrendRefreshRunId,
} from '../lib/kv';
import { isAdminRequest } from '../lib/adminAuth';
import { optimizeImageUrl, isUnsplashImageUrl } from '../lib/images';
import { ensurePromoCard, buildInstagramCaption } from '../lib/instagram';
import { PUBLIC_TOP_COUNT, TOP_GENERATION_POOL_COUNT } from '../lib/topConfig';
import { getThumbnailPoolAdminState } from '../lib/thumbnailPoolService.js';

const VISIBILITY_OPTIONS=[['published','공개'],['hidden_top','TOP만 숨김'],['hidden_feed','피드만 숨김'],['private','전체 비공개'],['trashed','휴지통']];
const TERMINAL=new Set(['completed','completed_with_errors','failed','cancelled','stopped_timeout']);
const TASK_OPEN=new Set(['queued','processing','retry_wait','failed']);
const CURRENT_CONTENT_VERSION=135;

export default function Admin(props){
  const {tokenUsage=[],events=[],top10History=[]}=props;
  const [feed,setFeed]=useState(props.feed||[]);
  const [trendsUpdatedAt,setTrendsUpdatedAt]=useState(props.trendsUpdatedAt||null);
  const [refreshHealth,setRefreshHealth]=useState(props.refreshHealth||null);
  const [runtime,setRuntime]=useState(props.runtime||null);
  const [activeRunId,setActiveRunId]=useState(props.activeRunId||'');
  const [trends,setTrends]=useState(props.trends||[]);
  const [contents,setContents]=useState(props.contents||[]);
  const [reviewDrafts,setReviewDrafts]=useState(props.reviewDrafts||[]);
  const [audit,setAudit]=useState(props.audit||[]);
  const [candidateReport,setCandidateReport]=useState(props.candidateReport||null);
  const [previewReport,setPreviewReport]=useState(props.previewReport||null);
  const [trendRules,setTrendRules]=useState(props.trendRules||{excludedKeywords:[]});
  const [runs,setRuns]=useState(props.cronRuns||[]);
  const [tab,setTab]=useState('overview');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirmDialog,setConfirmDialog]=useState(null);
  const [confirmText,setConfirmText]=useState('');
  const [resetText,setResetText]=useState('');
  const [keyword,setKeyword]=useState('');
  const [selectedTasks,setSelectedTasks]=useState(new Set());
  const [selectedPost,setSelectedPost]=useState(null);
  const [cardIndex,setCardIndex]=useState(0);
  const [instagramSearch,setInstagramSearch]=useState('');
  const [instagramPage,setInstagramPage]=useState(1);
  const [thumbnailPool,setThumbnailPool]=useState(props.thumbnailPool||{items:[],usage:[],targetSize:500});
  const [imageCategory,setImageCategory]=useState('all');
  const [thumbnailTargetSlug,setThumbnailTargetSlug]=useState('');
  const INSTAGRAM_PAGE_SIZE=10;
  const cardRef=useRef(null),allCardRefs=useRef([]);

  const instagramItems=useMemo(()=>{
    const map=new Map();
    [...feed,...contents].forEach(item=>{if(item?.slug)map.set(item.slug,{...map.get(item.slug),...item});});
    (top10History||[]).forEach(item=>{if(item?.slug)map.set(item.slug,{...item,...map.get(item.slug),top10EnteredAt:item.lastEnteredAt});});
    (trends||[]).slice(0,PUBLIC_TOP_COUNT).forEach(item=>{if(item?.slug)map.set(item.slug,{...map.get(item.slug),...item,currentRank:item.rank});});
    return [...map.values()].filter(x=>x.visibility!=='trashed'&&(x.currentRank||(x.visibility!=='private'&&(x.hasContent??x.hasNews)))).map(x=>({
      ...x,instagramCards:ensurePromoCard(x.instagramCards||[],x),instagramCaption:x.instagramCaption||buildInstagramCaption(x),instagramReady:Boolean((x.hasContent??x.hasNews)&&x.contentMode!=='trend_brief'&&x.status==='published'),
    })).sort((a,b)=>(Number(a.currentRank||99)-Number(b.currentRank||99))||new Date(b.top10EnteredAt||b.updatedAt||0)-new Date(a.top10EnteredAt||a.updatedAt||0));
  },[contents,feed,top10History,trends]);
  const filteredInstagramItems=useMemo(()=>{
    const query=instagramSearch.trim().toLowerCase();
    if(!query)return instagramItems;
    return instagramItems.filter(item=>`${item.feedTitle||''} ${item.displayTitle||''} ${item.keyword||''} ${item.slug||''}`.toLowerCase().includes(query));
  },[instagramItems,instagramSearch]);
  const instagramPageCount=Math.max(1,Math.ceil(filteredInstagramItems.length/INSTAGRAM_PAGE_SIZE));
  const pagedInstagramItems=filteredInstagramItems.slice((instagramPage-1)*INSTAGRAM_PAGE_SIZE,instagramPage*INSTAGRAM_PAGE_SIZE);
  useEffect(()=>{if(instagramPage>instagramPageCount)setInstagramPage(instagramPageCount);},[instagramPage,instagramPageCount]);

  async function refreshRuns(includeTasks=false){
    try{const r=await fetch(`/api/admin/status${includeTasks?'?includeTasks=1':''}`,{cache:'no-store'});if(r.status===401){location.href='/admin-login';return;}const d=await r.json();if(r.ok){setRuns(d.runs||[]);setRefreshHealth(d.refreshHealth||null);setTrendsUpdatedAt(d.trendsUpdatedAt||null);setActiveRunId(d.activeRunId||'');setRuntime(d.runtime||null);}}catch{}
  }
  async function refreshData(){
    try{
      const [c,a,r,t,f,i]=await Promise.all([fetch('/api/admin/contents?limit=1000',{cache:'no-store'}),fetch('/api/admin/audit?limit=100',{cache:'no-store'}),fetch('/api/admin/candidates',{cache:'no-store'}),fetch('/api/admin/trends',{cache:'no-store'}),fetch('/api/feed?page=1&limit=40&scope=all&sort=latest',{cache:'no-store'}),fetch('/api/admin/thumbnail-pool',{cache:'no-store'})]);
      if(c.status===401||a.status===401||r.status===401||t.status===401||i.status===401){location.href='/admin-login';return;}
      const [cd,ad,rd,td,fd,id]=await Promise.all([c.json(),a.json(),r.json(),t.json(),f.json(),i.json()]);
      if(c.ok){setContents(cd.contents||[]);setReviewDrafts(cd.reviewDrafts||[]);}if(a.ok)setAudit(ad.audit||[]);if(r.ok){setCandidateReport(rd.latest||null);setPreviewReport(rd.preview||null);setTrendRules(rd.rules||{excludedKeywords:[]});}if(t.ok)setTrends(td.trends||[]);if(f.ok)setFeed(fd.items||[]);if(i.ok)setThumbnailPool(id||{items:[],usage:[],targetSize:500});
    }catch{}
  }
  useEffect(()=>{refreshRuns(false);},[]);
  useEffect(()=>{
    const active=runs.some(run=>!TERMINAL.has(run.status));
    if(!active)return;
    const id=setInterval(async()=>{await refreshRuns(tab==='failures');},3000);
    return()=>clearInterval(id);
  },[runs,tab]);
  useEffect(()=>{if(runs.length&&runs.every(run=>TERMINAL.has(run.status)))refreshData();},[runs.map(run=>run.status).join('|')]);
  useEffect(()=>{
    if(!confirmDialog)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const onKeyDown=event=>{if(event.key==='Escape'&&!busy){setConfirmDialog(null);setConfirmText('');}};
    document.addEventListener('keydown',onKeyDown);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',onKeyDown);};
  },[confirmDialog,busy]);

  function requestConfirmation(options){
    if(busy)return;
    setConfirmText('');
    setConfirmDialog(options);
  }
  async function executeConfirmed(){
    if(!confirmDialog||busy)return;
    const dialog=confirmDialog;
    if(dialog.requireText&&confirmText!==dialog.requireText)return;
    setConfirmDialog(null);
    setConfirmText('');
    await dialog.execute();
  }
  function confirmAdminAction(body,success,{title='작업을 실행할까요?',description='',impact='',confirmLabel='실행',tone='warning',reload=false,requireText='',onSuccess}={}){
    requestConfirmation({title,description,impact,confirmLabel,tone,requireText,execute:async()=>{
      const result=await action({...body,confirmed:true},success,reload);
      if(result&&onSuccess)onSuccess(result);
    }});
  }

  async function action(body,success='완료되었습니다.',reload=false){
    setBusy(true);setMessage('처리 중…');
    try{
      const r=await fetch('/api/admin-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();if(r.status===401){location.href='/admin-login';return null;}if(!r.ok)throw new Error(d.error||'작업 실패');
      if(d.result?.partial)setMessage(`⚠️ TOP 저장은 완료됐지만 콘텐츠 큐 등록에 실패했습니다: ${d.result.queueError||'QStash 설정을 확인하세요.'}`);else if(d.queueError)setMessage(`⚠️ 저장은 완료됐지만 자동 갱신 등록에 실패했습니다: ${d.queueError}`);else setMessage(`✅ ${success}${d.runId?` · 실행 ID ${d.runId}`:''}`);
      const runId=d.runId||d.queued?.runId;if(runId)setRuns(cur=>[{runId,trigger:'admin',status:'queued',startedAt:new Date().toISOString()},...cur]);
      if(reload)setTimeout(()=>location.reload(),500);else setTimeout(()=>Promise.all([refreshRuns(),refreshData()]),500);
      return d;
    }catch(error){setMessage(`❌ ${error.message}`);return null;}finally{setBusy(false);}
  }
  async function executeManualGeneration(targetKeyword){
    setBusy(true);setMessage('검증형 콘텐츠 생성 중…');
    try{const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:targetKeyword,force:true,confirmed:true})});const d=await r.json();if(!r.ok)throw new Error(d.error||'생성 실패');setMessage(d.content?.status==='published'?'✅ 검증 후 공개했습니다.':'⚠️ 검토 대기 또는 자료 대기 상태입니다.');setKeyword('');await refreshData();}catch(e){setMessage(`❌ ${e.message}`);}finally{setBusy(false);}
  }
  function generateManual(){
    const targetKeyword=keyword.trim();if(!targetKeyword)return;
    requestConfirmation({title:'수동 콘텐츠를 생성할까요?',description:`“${targetKeyword}” 키워드로 검증형 콘텐츠 생성을 시작합니다.`,impact:'외부 출처 조회와 AI 토큰 사용이 발생하며, 검증 결과에 따라 즉시 공개되거나 검토 대기로 저장됩니다.',confirmLabel:'생성 실행',tone:'warning',execute:()=>executeManualGeneration(targetKeyword)});
  }
  async function backup(){const r=await fetch('/api/backup');if(!r.ok){setMessage('❌ 백업 오류');return;}const b=await r.blob(),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`stellate-v8.0.45-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);}
  async function logout(){await fetch('/api/admin/logout',{method:'POST'});location.href='/admin-login';}
  async function ensureHtml2Canvas(){if(window.html2canvas)return;await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=ok;s.onerror=no;document.head.appendChild(s);});}
  async function trackUnsplashDownload(){const location=selectedPost?.imageMeta?.downloadLocation;if(!location)return;await fetch('/api/unsplash-download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({downloadLocation:location})}).catch(()=>{});}
  async function saveCardNode(node,index){await trackUnsplashDownload();const canvas=await window.html2canvas(node,{useCORS:true,scale:2,backgroundColor:null});const a=document.createElement('a');a.download=`stellate_${selectedPost.slug}_${index+1}.png`;a.href=canvas.toDataURL('image/png');a.click();fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'card_download',slug:selectedPost.slug})}).catch(()=>{});}
  async function downloadCard(){if(!cardRef.current||!selectedPost)return;setBusy(true);try{await ensureHtml2Canvas();await saveCardNode(cardRef.current,cardIndex);setMessage('✅ 현재 카드를 저장했습니다.');}catch{setMessage('❌ 저장 실패');}finally{setBusy(false);}}
  async function downloadAllCards(){if(!selectedPost)return;setBusy(true);try{await ensureHtml2Canvas();for(let i=0;i<selectedPost.instagramCards.length;i++){if(allCardRefs.current[i])await saveCardNode(allCardRefs.current[i],i);}setMessage(`✅ ${selectedPost.instagramCards.length}장을 저장했습니다.`);}catch{setMessage('❌ 저장 실패');}finally{setBusy(false);}}
  function regenerateInstagram(){if(!selectedPost)return;confirmAdminAction({action:'regenerate_instagram',slug:selectedPost.slug},'인스타 카드를 검증 후 재생성했습니다.',{title:'인스타 카드를 재생성할까요?',description:selectedPost.feedTitle||selectedPost.displayTitle||selectedPost.keyword,impact:'기존 카드가 새 결과로 교체되며 AI 토큰이 사용됩니다.',confirmLabel:'카드 재생성',tone:'warning',onSuccess:d=>{if(d?.content){setSelectedPost(d.content);setCardIndex(0);}}});}
  async function copyCaption(){await navigator.clipboard.writeText(selectedPost?.instagramCaption||'');setMessage('✅ 인스타 본문을 복사했습니다.');}

  const currentContents=contents.filter(x=>Number(x.contentVersion||0)===CURRENT_CONTENT_VERSION);
  const failed=currentContents.filter(x=>x.status==='failed'||x.aiError);
  const pending=currentContents.filter(x=>['pending','generating','review_required'].includes(x.status));
  const latestRun=runs[0]||null;
  const activeRun=runs.find(run=>run.runId===activeRunId)||runs.find(run=>!TERMINAL.has(String(run.status||'')))||null;
  const runTasks=(latestRun?.tasks||[]).filter(task=>TASK_OPEN.has(task.status)).map(task=>({...task,runId:latestRun.runId,trigger:latestRun.trigger}));
  const taskRows=[...new Map([...runTasks,...pending,...failed].map(x=>[x.slug,x])).values()];
  const totalEvents=useMemo(()=>events.reduce((sum,row)=>sum+Number(row.detail_view||0),0),[events]);
  const thumbnailItems=Array.isArray(thumbnailPool?.items)?thumbnailPool.items:[];
  const thumbnailCategories=[...new Set(thumbnailItems.map(item=>item.category).filter(Boolean))];
  const filteredThumbnailItems=imageCategory==='all'?thumbnailItems:thumbnailItems.filter(item=>item.category===imageCategory);
  const thumbnailTargets=[...new Map([...trends,...feed,...contents].filter(item=>item?.slug).map(item=>[item.slug,item])).values()].filter(item=>item.visibility!=='trashed');
  const tabs=[['overview','현황'],['candidates','TOP 후보 심사'],['review','검토 대기'],['top','TOP 관리'],['feed','피드 관리'],['failures','생성 상태'],['images','썸네일 이미지'],['instagram','인스타'],['audit','변경 이력'],['settings','설정']];

  return <><Head><title>관리자 — STELLATE v8.0.45</title></Head><Header/><main className="admin-shell">
    <section className="admin-heading"><div><p className="eyebrow">STELLATE v8.0.45</p><h1>검증형 운영 관리자</h1></div><button className="admin-logout" onClick={logout}>로그아웃</button></section>
    {message&&<div className="admin-message">{message}</div>}
    {props.initialLoadError&&<div className="admin-message">⚠️ 일부 관리자 데이터를 불러오지 못했습니다. 화면은 안전 모드로 열렸으며 새로고침하거나 실행 환경을 확인해 주세요.</div>}
    {(!trendsUpdatedAt||Date.now()-new Date(trendsUpdatedAt).getTime()>4*60*60*1000)&&<div className="admin-message">⚠️ 마지막 성공 TOP 갱신이 4시간을 초과했습니다. {trendsUpdatedAt?`마지막 성공: ${new Date(trendsUpdatedAt).toLocaleString('ko-KR')}`:'성공 갱신 기록 없음'} · 아래 실행 상태에서 QStash 콜백 미수신 여부를 확인하거나 ‘TOP 즉시 실행’을 사용하세요.</div>}
    {runs.some(run=>run.qstashDeliveryStale)&&<div className="admin-message">❌ QStash에 등록됐지만 10분 이상 콜백이 시작되지 않은 작업이 있습니다. QStash 전달 설정 또는 SITE_URL을 확인하세요.</div>}
    {runs.some(run=>run.executionStale)&&<div className="admin-message">❌ TOP 배치 실행이 10분 이상 갱신되지 않은 작업이 있습니다. 마지막 배치 메시지와 실행 재시도 상태를 확인하세요.</div>}
    {refreshHealth?.healthy===false&&<div className="admin-message">⚠️ 최근 신규 TOP 세트가 안전 기준을 통과하지 못해 기존 공개 TOP을 유지했습니다. {(refreshHealth.reasons||[]).join(' · ')}</div>}
    <nav className="admin-tabs">{tabs.map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}{key==='review'&&reviewDrafts.length?` ${reviewDrafts.length}`:''}</button>)}</nav>

    {tab==='overview'&&<div className="admin-grid">
      <Stat label="공개 TOP" value={trends.filter(t=>t.visibility==='published').length}/><Stat label="누적 피드" value={feed.length}/><Stat label="전체 콘텐츠" value={contents.length}/><Stat label="검토 대기" value={reviewDrafts.length}/><Stat label="오류/대기" value={pending.length+failed.length}/><Stat label="7일 상세 조회" value={totalEvents}/>
      <section className="admin-panel wide"><h2>갱신 실행 환경</h2><div className="candidate-summary"><span>Redis {runtime?.redisConfigured?'정상':'미설정'}</span><span>QStash {runtime?.qstashConfigured?'정상':'미설정'}</span><span>CRON_SECRET {runtime?.cronSecretConfigured?'정상':'미설정'}</span><span>Naver {runtime?.naverConfigured?'정상':'미설정'}</span><span>Anthropic {runtime?.anthropicConfigured?'정상':'미설정'}</span><span>크론 방식 {runtime?.cronMode==='external'?'외부 크론':'확인 중'}</span></div><p className="muted">SITE_URL: {runtime?.siteUrl||'확인 중'} · 외부 크론 호출: {runtime?.cronEndpoint||'/api/cron'}</p></section>
      <section className="admin-panel wide"><h2>빠른 작업</h2><p className="action-safety-note">비용 발생·대량 변경 작업은 확인 화면에서 내용을 검토한 뒤 실행됩니다.</p><div className="admin-actions"><button disabled={busy} onClick={()=>confirmAdminAction({action:'preview_trends'},'TOP 미리 계산을 완료했습니다.',{title:'TOP 후보를 미리 계산할까요?',description:'v8.0.20 관심도 기준으로 상위 생성 후보 25개를 미리 계산하지만 실제 공개 TOP20·피드·콘텐츠는 변경하지 않습니다.',impact:'검색·뉴스 API 호출은 발생하지만 콘텐츠 AI 생성은 실행하지 않습니다.',confirmLabel:'미리 계산 실행',tone:'warning',reload:true})}>TOP 미리 계산</button><button disabled={busy} onClick={()=>confirmAdminAction({action:'refresh_trends'},'TOP 원자적 갱신 작업을 등록했습니다.',{title:'검증된 TOP을 실제 적용할까요?',description:'관심도 상대순위 상위 25개를 생성 후보로 고정한 뒤, 상세·피드·제목 생성에 성공한 후보를 원래 순위대로 정렬해 성공 후보 상위 20개를 동시에 공개합니다.',impact:'외부 API와 AI 호출이 발생합니다. 25개 후보는 모두 조사하며 실패 항목이 있으면 다음 순위의 성공 후보가 승격됩니다. 성공 항목이 20개 이상일 때만 TOP·피드·상세를 교체합니다.',confirmLabel:'TOP 실제 적용',tone:'warning'})}>TOP 실제 적용</button><button disabled={busy} onClick={()=>confirmAdminAction({action:'refresh_trends_direct'},'TOP 후보 수집을 시작하고 QStash 소배치 처리를 등록했습니다.',{title:'TOP 갱신을 즉시 시작할까요?',description:'관심도 기준 상위 25개를 생성 후보로 확정하고, 후보별 상세 조사를 QStash에서 1개씩 처리한 뒤 성공한 상위 20개만 공개합니다.',impact:'화면을 닫아도 배치가 계속되며 각 단계의 진행 위치가 Redis에 저장됩니다.',confirmLabel:'TOP 즉시 시작',tone:'warning'})}>TOP 즉시 시작</button>{activeRun&&<button className="danger-action" aria-label="현재 TOP 작업 즉시 중단" disabled={busy} onClick={()=>confirmAdminAction({action:'stop_active_trend_run',values:{runId:activeRun.runId},detail:'관리자 빠른 작업에서 현재 실행 즉시 중단'},'현재 TOP 갱신을 중단했습니다.',{title:'현재 TOP 작업을 즉시 중단할까요?',description:`${activeRun.runId} · 1차 처리 ${activeRun.attemptedCandidates||0}/${activeRun.total||PUBLIC_TOP_COUNT} · 준비 ${Number(activeRun.generated||0)+Number(activeRun.reused||0)}/${activeRun.total||PUBLIC_TOP_COUNT}`,impact:'실행 상태를 즉시 취소로 전환하고 대기·처리·추가검색 항목을 중단합니다. 이미 실행 중인 외부 호출은 반환 직후 폐기되며 다음 QStash 배치와 최종 공개는 차단됩니다. 기존 공개 TOP은 유지됩니다.',confirmLabel:'현재 TOP 즉시 중단',tone:'danger',reload:true})}>현재 TOP 작업 중단 (즉시)</button>}<button disabled={busy} onClick={()=>confirmAdminAction({action:'rebuild_missing_feeds'},'누적 피드 전체 복구를 완료했습니다.',{title:'누적 공개 피드 전체를 다시 만들까요?',description:'현재 TOP20뿐 아니라 Redis에 남아 있는 과거 공개 content 원본까지 검색해 누적 피드 목록·최신순·게시번호·조회수·카테고리 인덱스를 다시 만듭니다. 현재 TOP 중 상세 콘텐츠가 없는 항목만 생성 큐에 등록합니다.',impact:'누적 피드를 현재 TOP20으로 잘라내지 않습니다. 기존 공개 상세 원본이 남아 있으면 AI 호출 없이 과거 피드를 복구하며, 현재 TOP 상세가 없는 경우에만 외부 API와 AI 호출이 발생할 수 있습니다.',confirmLabel:'누적 피드 복구 실행',tone:'warning'})}>누적 피드 전체 재구성</button><button onClick={backup}>JSON 백업</button></div><div className="manual-row"><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="수동 키워드"/><button onClick={generateManual} disabled={busy||!keyword.trim()}>검증 콘텐츠 생성</button></div></section>
      <section className="admin-panel wide"><h2>최근 갱신 작업</h2>{!runs.length?<p className="muted">실행 이력이 없습니다.</p>:runs.slice(0,8).map(run=><RunRow key={run.runId} run={run} busy={busy} confirmAdminAction={confirmAdminAction}/>)}</section>
    </div>}

    {tab==='candidates'&&<section className="admin-panel"><div className="panel-title-row"><div><h2>TOP 후보 심사</h2><p className="muted">초기 후보는 멀티소스 조사 대상으로 선별하며, 최종 공개는 상세·Fact Ledger·출처 검증 후 결정됩니다.</p></div><button disabled={busy} onClick={()=>confirmAdminAction({action:'preview_trends'},'TOP 미리 계산을 완료했습니다.',{title:'TOP 후보를 다시 계산할까요?',description:'실제 TOP은 변경하지 않고 최신 후보·탈락 사유·예상 순위를 계산합니다.',impact:'뉴스·검색 API 호출만 발생합니다.',confirmLabel:'미리 계산',tone:'warning',reload:true})}>미리 계산</button></div>{previewReport&&<CandidateReport title="최근 미리 계산" report={previewReport} busy={busy} confirmAdminAction={confirmAdminAction} trendRules={trendRules}/>} {candidateReport&&<CandidateReport title="현재 적용 결과" report={candidateReport} busy={busy} confirmAdminAction={confirmAdminAction} trendRules={trendRules}/>} {!previewReport&&!candidateReport&&<p className="muted">아직 후보 계산 이력이 없습니다.</p>}</section>}
    {tab==='review'&&<section className="admin-panel"><h2>검토 대기 초안 <small>{reviewDrafts.length}개</small></h2><p className="muted">이 목록은 상세·피드 초안입니다. 승인하면 피드와 상세가 공개되며, TOP 후보에서 관리자 승인된 항목은 승인 직후 TOP 갱신도 자동 등록됩니다.</p>{!reviewDrafts.length?<p className="muted">자동 검증에서 차단된 초안이 없습니다.</p>:reviewDrafts.map(draft=><ReviewRow key={draft.slug} draft={draft} busy={busy} action={action} confirmAdminAction={confirmAdminAction}/>)}</section>}
    {tab==='top'&&<section className="admin-panel"><div className="panel-title-row"><div><h2>TOP 관리 <small>{trends.length}개</small></h2><p className="muted">검증된 TOP 20개 재계산과 TOP별 리서치·콘텐츠 재생성을 실행할 수 있습니다.</p></div><div className="admin-actions"><button disabled={busy} onClick={()=>confirmAdminAction({action:'refresh_trends'},'TOP 원자적 갱신 작업을 등록했습니다.',{title:'TOP 순위를 다시 계산하고 적용할까요?',description:'최신 후보를 다시 검증해 실제 TOP을 갱신합니다.',impact:'검증 콘텐츠까지 준비된 항목만 원자적으로 공개되며 비정상 급감 시 기존 TOP을 유지합니다.',confirmLabel:'TOP 재계산 실행',tone:'warning'})}>TOP 순위 재생성</button><button disabled={busy} onClick={()=>confirmAdminAction({action:'refresh_trends_direct'},'TOP 후보 수집을 시작하고 QStash 소배치 처리를 등록했습니다.',{title:'TOP 갱신을 즉시 시작할까요?',description:'후보 수집을 즉시 실행한 뒤 상세 조사를 QStash 소배치로 이어갑니다.',impact:'외부 API와 AI 호출이 발생하며 진행 위치는 실행 상태에 계속 기록됩니다.',confirmLabel:'즉시 시작',tone:'warning'})}>TOP 즉시 시작</button><button disabled={busy} onClick={()=>confirmAdminAction({action:'regenerate_top_contents'},'TOP 콘텐츠 전체 재생성 작업을 등록했습니다.',{title:'TOP1~20 콘텐츠를 전부 재생성할까요?',description:'현재 공개 TOP을 모두 AI 리서치 큐에 다시 등록합니다. 공식자료·신뢰도 높은 뉴스·구조화 데이터가 충분한 항목만 상세·Q&A·인스타를 새로 생성합니다. 부족한 항목은 공개본을 교체하지 않습니다.',impact:'공개 TOP마다 공식자료·뉴스·YouTube 검색이 실행될 수 있으며 AI 토큰과 외부 API 호출이 사용됩니다.',confirmLabel:'TOP 콘텐츠 재생성',tone:'warning'})}>TOP 피드 전체 재생성</button></div></div>{trends.map(item=><ManageRow key={item.slug} item={item} type="top" busy={busy} action={action} confirmAdminAction={confirmAdminAction}/>)}</section>}
    {tab==='feed'&&<section className="admin-panel"><h2>피드 관리 <small>{feed.length}개</small></h2>{feed.map(item=><ManageRow key={item.slug} item={item} type="feed" busy={busy} action={action} confirmAdminAction={confirmAdminAction}/>)}</section>}

    {tab==='failures'&&<section className="admin-panel"><div className="panel-title-row"><h2>콘텐츠 생성 상태</h2><div className="admin-actions"><button disabled={!selectedTasks.size||busy} onClick={()=>confirmAdminAction({action:'retry_selected',slugs:[...selectedTasks]},`${selectedTasks.size}개 항목을 재시도 큐에 등록했습니다.`,{title:`선택한 ${selectedTasks.size}개 항목을 재시도할까요?`,description:'선택 항목을 QStash 생성 큐에 다시 등록합니다.',impact:'항목별 외부 API와 AI 토큰 사용이 발생할 수 있습니다.',confirmLabel:'선택 재시도 실행',tone:'warning'})}>선택 재시도</button><button disabled={busy} onClick={()=>confirmAdminAction({action:'clear_generation_history'},'이전 생성 상태 기록을 정리했습니다.',{title:'이전 생성 상태 기록을 정리할까요?',description:'과거 QStash 실행·작업 상태 기록만 삭제합니다. TOP·피드·콘텐츠는 삭제하지 않습니다.',impact:'source_fetch_failed 등 과거 실패 기록이 생성 상태 화면에서 제거됩니다.',confirmLabel:'상태 기록 정리',tone:'warning',reload:true})}>이전 상태 기록 정리</button></div></div>{!taskRows.length?<p className="muted">현재 대기·검토·실패 항목이 없습니다.</p>:taskRows.map((item,index)=><div className="status-row" key={`${item.slug}-${index}`}><label className="task-check"><input type="checkbox" checked={selectedTasks.has(item.slug)} onChange={e=>setSelectedTasks(current=>{const next=new Set(current);e.target.checked?next.add(item.slug):next.delete(item.slug);return next;})}/></label><div><strong>{item.title||item.displayTitle||item.keyword||item.slug}</strong><p>{statusLabel(item.status)} · {item.error||item.aiError||item.lastError||(item.publicationReasons||[]).join(' / ')||'처리 중'} · 재시도 {item.attempts||item.retryCount||0}회</p></div><button disabled={busy} onClick={()=>confirmAdminAction({action:'regenerate',slug:item.slug},'재생성을 실행했습니다.',{title:'이 콘텐츠를 재생성할까요?',description:item.title||item.displayTitle||item.keyword||item.slug,impact:'기존 공개본은 검증 결과에 따라 유지되거나 새 검토 초안이 생성되며 AI 토큰이 사용됩니다.',confirmLabel:'재생성 실행',tone:'warning'})}>개별 재생성</button></div>)}</section>}

    {tab==='images'&&<section className="admin-panel thumbnail-admin"><div className="panel-title-row"><div><h2>썸네일 이미지 풀 <small>{thumbnailItems.length}/{thumbnailPool?.targetSize||500}개</small></h2><p className="muted">TOP 순위 계산과 완전히 분리된 Unsplash 사전 풀입니다. TOP 작업 시작 전 자동 점검·보충하고, 현재 TOP의 누락 썸네일도 자동 적용합니다. 기존 Unsplash·수동 이미지는 유지됩니다.</p></div><div className="admin-actions"><button disabled={busy} onClick={()=>confirmAdminAction({action:'bootstrap_thumbnail_pool',values:{force:false}},thumbnailItems.length?'이미지 풀을 보충하고 현재 TOP 누락 썸네일을 적용했습니다.':'이미지 풀을 구축하고 현재 TOP 누락 썸네일을 적용했습니다.',{title:thumbnailItems.length?'Unsplash 이미지 풀을 500개까지 보충할까요?':'Unsplash 이미지 풀 500개를 구축할까요?',description:'10개 카테고리별 50개씩 총 500개 이미지를 조회·자동 검수해 Redis에 저장하고 현재 TOP의 누락 썸네일을 채웁니다.',impact:'콘텐츠별 실시간 검색은 하지 않습니다. 기존 Unsplash·수동 이미지는 유지하고 이미지가 없는 현재 TOP만 채웁니다. UNSPLASH_ACCESS_KEY가 필요합니다.',confirmLabel:thumbnailItems.length?'500개까지 보충':'500개 풀 구축',tone:'warning'})}>{thumbnailItems.length?'500개까지 보충':'500개 풀 구축'}</button></div></div><div className="thumbnail-toolbar"><label>카테고리<select value={imageCategory} onChange={event=>setImageCategory(event.target.value)}><option value="all">전체</option>{thumbnailCategories.map(category=><option key={category} value={category}>{thumbnailItems.find(item=>item.category===category)?.categoryLabel||category}</option>)}</select></label><label>수동 적용 콘텐츠<select value={thumbnailTargetSlug} onChange={event=>setThumbnailTargetSlug(event.target.value)}><option value="">선택 안 함</option>{thumbnailTargets.map(item=><option key={item.slug} value={item.slug}>{item.rank?`TOP ${item.rank} · `:''}{item.feedTitle||item.topTitle||item.displayTitle||item.keyword||item.slug}</option>)}</select></label></div>{!thumbnailItems.length?<p className="muted">아직 사용 가능한 이미지 풀이 없습니다. TOP 작업 시작 시 자동 구축을 시도하며, 바로 적용하려면 위 버튼을 실행하세요. UNSPLASH_ACCESS_KEY가 없으면 구축할 수 없습니다.</p>:<div className="thumbnail-pool-grid">{filteredThumbnailItems.map(item=><ThumbnailPoolCard key={item.id} item={item} busy={busy} targetSlug={thumbnailTargetSlug} confirmAdminAction={confirmAdminAction}/>)}</div>}</section>}

    {tab==='instagram'&&<section className="admin-panel instagram-admin"><div className="panel-title-row"><div><h2>인스타 카드 <small>{filteredInstagramItems.length}개</small></h2><p className="muted">검색 후 페이지별 10개씩 선택할 수 있습니다. 선택한 카드 미리보기는 목록 위에 고정됩니다.</p></div><input className="instagram-search" value={instagramSearch} onChange={e=>{setInstagramSearch(e.target.value);setInstagramPage(1);}} placeholder="제목·키워드 검색"/></div>{selectedPost&&<div className="instagram-work instagram-work-top"><InstagramCard refProp={cardRef} post={selectedPost} card={selectedPost.instagramCards?.[cardIndex]} index={cardIndex} total={selectedPost.instagramCards?.length||0}/><div className="card-controls"><button disabled={cardIndex===0} onClick={()=>setCardIndex(i=>i-1)}>이전</button><span>{cardIndex+1}/{selectedPost.instagramCards?.length||0}</span><button disabled={cardIndex>=(selectedPost.instagramCards?.length||1)-1} onClick={()=>setCardIndex(i=>i+1)}>다음</button>{selectedPost.instagramReady?<button onClick={regenerateInstagram}>카드 검증 재생성</button>:<button disabled={busy} onClick={()=>confirmAdminAction({action:'regenerate',slug:selectedPost.slug},'콘텐츠 생성을 실행했습니다.',{title:'인스타용 원본 콘텐츠를 생성할까요?',description:selectedPost.feedTitle||selectedPost.displayTitle||selectedPost.keyword,impact:'콘텐츠와 인스타 카드 생성 과정에서 외부 API와 AI 토큰이 사용됩니다.',confirmLabel:'콘텐츠 생성 실행',tone:'warning'})}>콘텐츠 생성</button>}<button onClick={downloadCard}>현재 카드 저장</button><button onClick={downloadAllCards}>전체 저장</button></div><div className="instagram-caption-box"><h3>인스타 게시물 본문</h3><textarea readOnly value={selectedPost.instagramCaption||''}/><button onClick={copyCaption}>본문 복사</button></div><div className="instagram-export-stack" aria-hidden="true">{(selectedPost.instagramCards||[]).map((card,index)=><InstagramCard key={index} refProp={node=>allCardRefs.current[index]=node} post={selectedPost} card={card} index={index} total={selectedPost.instagramCards.length}/>)}</div></div>}<div className="instagram-picker">{pagedInstagramItems.map(item=><button key={item.slug} className={selectedPost?.slug===item.slug?'active':''} onClick={()=>{setSelectedPost(item);setCardIndex(0);window.scrollTo({top:0,behavior:'smooth'});}}>{item.currentRank?`TOP ${item.currentRank} · `:item.feedSeq?`#${item.feedSeq} · `:''}{item.feedTitle||item.displayTitle||item.keyword}<em>{item.instagramReady?'검증 완료':'공개 콘텐츠 대기'}</em></button>)}</div>{!pagedInstagramItems.length&&<p className="muted">검색 결과가 없습니다.</p>}<div className="pagination instagram-pagination"><button disabled={instagramPage<=1} onClick={()=>setInstagramPage(p=>Math.max(1,p-1))}>이전</button><span>{instagramPage}/{instagramPageCount}</span><button disabled={instagramPage>=instagramPageCount} onClick={()=>setInstagramPage(p=>Math.min(instagramPageCount,p+1))}>다음</button></div></section>}

    {tab==='audit'&&<section className="admin-panel"><h2>관리자 변경 이력</h2>{!audit.length?<p className="muted">기록된 변경 이력이 없습니다.</p>:audit.map((row,index)=><AuditRow key={index} row={row}/>)}</section>}
    {tab==='settings'&&<div className="admin-grid"><section className="admin-panel wide"><h2>콘텐츠 출처 정책</h2><p className="muted">뉴스·YouTube는 연관 링크와 교차 확인용입니다. 공개 TOP은 엄격 검증 사건만 사용하며, AI 조사 계획과 공식자료·공공데이터를 바탕으로 상세·Q&A·인스타를 생성합니다. 자료가 부족할 때만 짧은 브리핑으로 전환합니다.</p><code>CONTENT_SOURCE_POLICY=verified</code><code>OFFICIAL_CONTENT_SOURCE_DOMAINS=...</code><code>AUTHORIZED_CONTENT_SOURCE_DOMAINS=...</code><code>AI_DAILY_INPUT_TOKEN_LIMIT=500000</code><code>AI_DAILY_OUTPUT_TOKEN_LIMIT=120000</code></section><section className="admin-panel wide danger-panel"><h2>피드 전체 초기화</h2><p className="muted">먼저 ‘전체삭제’를 입력하고, 이어지는 최종 확인 화면에서 다시 실행해야 합니다.</p><div className="manual-row"><input value={resetText} onChange={e=>setResetText(e.target.value)} placeholder="전체삭제"/><button disabled={resetText!=='전체삭제'||busy} onClick={()=>confirmAdminAction({action:'reset_feed',confirmation:resetText},'피드를 초기화했습니다.',{title:'전체 피드를 초기화할까요?',description:'현재 피드 인덱스와 공개 목록을 초기화합니다. 실행 전에 자동 백업이 생성됩니다.',impact:'대량 데이터 변경 작업이며 되돌리려면 백업 복원이 필요합니다.',confirmLabel:'전체 피드 초기화',tone:'danger',reload:true,requireText:'전체삭제'})}>전체 피드 초기화</button></div></section><section className="admin-panel wide"><h2>토큰 사용량</h2>{tokenUsage.map(row=><div className="usage-row" key={row.date}><span>{row.date}</span><span>입력 {row.input.toLocaleString()}</span><span>출력 {row.output.toLocaleString()}</span></div>)}</section></div>}
  </main><ConfirmationDialog dialog={confirmDialog} confirmText={confirmText} setConfirmText={setConfirmText} busy={busy} onCancel={()=>{if(!busy){setConfirmDialog(null);setConfirmText('');}}} onConfirm={executeConfirmed}/></>;
}


function formatAdminNumber(value){
  const number=Number(value||0);
  return Number.isFinite(number)?number.toLocaleString('ko-KR'):String(value??'-');
}
function formatAdminDate(value){
  if(!value)return '-';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleString('ko-KR');
}
function safeAdminJson(value){
  if(value==null)return '-';
  try{return JSON.stringify(value,null,2);}catch{return String(value);}
}
function Stat({label,value}){
  return <section className="stat-card"><span>{label}</span><strong>{formatAdminNumber(value)}</strong></section>;
}
function ManageRow({item,type,busy,action,confirmAdminAction}){
  const [editing,setEditing]=useState(false);
  const [titles,setTitles]=useState({
    topKeyword:item?.topKeyword||item?.keyword||'',topTopic:item?.topTopic||'',topTitle:item?.topTitle||item?.displayTitle||'',
    feedTitle:item?.feedTitle||item?.card?.feedTitle||'',detailTitle:item?.detailTitle||item?.card?.detailTitle||'',instagramTitle:item?.instagramTitle||'',
  });
  const title=item?.topTitle||item?.feedTitle||item?.displayTitle||item?.keyword||item?.slug||'제목 없음';
  const visibility=item?.visibility||'published';
  const category=item?.category||'general';
  const saveTitles=async()=>{
    const values=Object.fromEntries(Object.entries(titles).filter(([,value])=>String(value||'').trim()));
    const result=await action({action:'titles',slug:item.slug,values},'제목을 저장했습니다.');
    if(result)setEditing(false);
  };
  const changeVisibility=value=>confirmAdminAction(
    {action:'visibility',slug:item.slug,value},'공개 범위를 변경했습니다.',
    {title:'공개 범위를 변경할까요?',description:`${title} → ${VISIBILITY_OPTIONS.find(([key])=>key===value)?.[1]||value}`,impact:'TOP 또는 피드 노출 상태가 즉시 변경될 수 있습니다.',confirmLabel:'변경 실행',tone:value==='trashed'||value==='private'?'danger':'warning'}
  );
  return <article className="manage-row">
    <div className="manage-main">
      <div className="manage-title"><strong>{title}</strong>{type==='top'&&<span>TOP {item?.rank||'-'}</span>}</div>
      <div className="manage-meta"><span>{item?.slug||'-'}</span><span>{CATEGORIES[category]?.label||category}</span><span>{statusLabel(item?.status||'published')}</span><span>{formatAdminDate(item?.updatedAt||item?.generatedAt)}</span></div>
    </div>
    <div className="manage-controls">
      <select aria-label="카테고리" value={category} disabled={busy} onChange={event=>action({action:'category',slug:item.slug,value:event.target.value},'카테고리를 변경했습니다.')}>
        {Object.entries(CATEGORIES).map(([key,row])=><option key={key} value={key}>{row.label}</option>)}
      </select>
      <select aria-label="공개 범위" value={visibility} disabled={busy} onChange={event=>changeVisibility(event.target.value)}>
        {VISIBILITY_OPTIONS.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select>
      <button disabled={busy} onClick={()=>setEditing(value=>!value)}>{editing?'편집 닫기':'제목 편집'}</button>
      <a className="admin-inline-link" href={`/feed/${item.slug}`} target="_blank" rel="noreferrer">상세 보기</a>
      <button disabled={busy} onClick={()=>confirmAdminAction({action:'regenerate',slug:item.slug},'콘텐츠 재생성을 실행했습니다.',{title:'이 콘텐츠를 재생성할까요?',description:title,impact:'외부 API와 AI 토큰이 사용되며 검증 결과에 따라 공개본이 유지될 수 있습니다.',confirmLabel:'재생성 실행',tone:'warning'})}>재생성</button>
      <button className="danger" disabled={busy} onClick={()=>confirmAdminAction({action:'delete',slug:item.slug,confirmation:'영구삭제'},'콘텐츠를 영구 삭제했습니다.',{title:'이 콘텐츠를 영구 삭제할까요?',description:title,impact:'콘텐츠·피드 인덱스·관련 상태가 삭제됩니다. 실행 전 백업을 권장합니다.',confirmLabel:'영구 삭제',tone:'danger',requireText:'영구삭제',reload:true})}>영구 삭제</button>
    </div>
    {editing&&<div className="title-editor">
      <label>TOP 키워드<input value={titles.topKeyword} onChange={event=>setTitles({...titles,topKeyword:event.target.value})}/></label>
      <label>TOP 간단제목<input value={titles.topTopic} onChange={event=>setTitles({...titles,topTopic:event.target.value})}/></label>
      <label>TOP 제목<input value={titles.topTitle} onChange={event=>setTitles({...titles,topTitle:event.target.value})}/></label>
      <label>피드 제목<input value={titles.feedTitle} onChange={event=>setTitles({...titles,feedTitle:event.target.value})}/></label>
      <label>상세 제목<input value={titles.detailTitle} onChange={event=>setTitles({...titles,detailTitle:event.target.value})}/></label>
      <label>인스타 제목<input value={titles.instagramTitle} onChange={event=>setTitles({...titles,instagramTitle:event.target.value})}/></label>
      <button disabled={busy} onClick={saveTitles}>제목 저장</button>
    </div>}
  </article>;
}
function ThumbnailPoolCard({item,busy,targetSlug,confirmAdminAction}){
  const imageUrl=isUnsplashImageUrl(item?.thumbUrl||item?.imageUrl||'')?optimizeImageUrl(item.thumbUrl||item.imageUrl,420,76):'';
  const editMood=()=>{const value=prompt('내부 분위기 제목을 입력하세요.',item.moodTitle||'');if(value!=null&&value.trim())confirmAdminAction({action:'update_thumbnail_pool_item',values:{imageId:item.id,patch:{moodTitle:value.trim()}}},'분위기 제목을 수정했습니다.',{title:'분위기 제목을 수정할까요?',description:`${item.id} · ${value.trim()}`,impact:'관리자 분류와 자동 선택 점수에만 사용되며 공개 기사 제목에는 표시되지 않습니다.',confirmLabel:'수정',tone:'warning'});};
  const editTags=()=>{const value=prompt('분위기 태그를 쉼표로 구분해 입력하세요.',(item.moods||[]).join(', '));if(value!=null)confirmAdminAction({action:'update_thumbnail_pool_item',values:{imageId:item.id,patch:{moods:value.split(',').map(v=>v.trim()).filter(Boolean)}}},'분위기 태그를 수정했습니다.',{title:'분위기 태그를 수정할까요?',description:item.moodTitle||item.id,impact:'이후 신규 콘텐츠의 이미지 적합도 계산에 반영됩니다.',confirmLabel:'수정',tone:'warning'});};
  return <article className={`thumbnail-pool-card ${item.enabled===false?'is-disabled':''}`}>
    <div className="thumbnail-pool-preview">{imageUrl?<img src={imageUrl} alt={item.altDescription||item.moodTitle||''} loading="lazy"/>:<span>이미지 없음</span>}<em>{item.id}</em></div>
    <div className="thumbnail-pool-copy"><strong>{item.moodTitle||item.id}</strong><small>{item.categoryLabel||item.category} · {item.tone||'neutral'} · 사용 {Number(item.usageCount||0)}회</small><p>{[...(item.moods||[]),...(item.subjects||[])].slice(0,7).join(' · ')}</p><small>마지막 사용 {formatAdminDate(item.lastUsedAt)} · {item.reviewStatus||'미검수'}</small></div>
    <div className="thumbnail-pool-actions"><button disabled={busy} onClick={editMood}>제목 수정</button><button disabled={busy} onClick={editTags}>태그 수정</button><button disabled={busy} onClick={()=>confirmAdminAction({action:'update_thumbnail_pool_item',values:{imageId:item.id,patch:{enabled:item.enabled===false}}},item.enabled===false?'이미지를 활성화했습니다.':'이미지를 비활성화했습니다.',{title:item.enabled===false?'이 이미지를 다시 사용할까요?':'이 이미지의 신규 자동 배정을 중지할까요?',description:item.moodTitle||item.id,impact:'기존 콘텐츠에 이미 고정된 이미지는 즉시 변경하지 않습니다.',confirmLabel:item.enabled===false?'활성화':'비활성화',tone:item.enabled===false?'warning':'danger'})}>{item.enabled===false?'활성화':'비활성화'}</button><button disabled={busy||!targetSlug||item.enabled===false} onClick={()=>confirmAdminAction({action:'set_thumbnail_image',slug:targetSlug,values:{imageId:item.id}},'선택 콘텐츠에 수동 이미지를 고정했습니다.',{title:'선택한 콘텐츠에 이 이미지를 고정할까요?',description:`${targetSlug} · ${item.moodTitle||item.id}`,impact:'이후 TOP 순위 변경이나 콘텐츠 재생성으로 자동 변경되지 않습니다.',confirmLabel:'수동 고정',tone:'warning'})}>선택 콘텐츠에 지정</button></div>
  </article>;
}

function AuditRow({row}){
  const hasDiff=row?.before!=null||row?.after!=null||row?.error;
  return <article className="audit-row audit-row-rich">
    <span>{formatAdminDate(row?.createdAt)}</span>
    <div><strong>{auditLabel(row?.action)}</strong><small>{row?.actor||'admin'} · {row?.result||'success'}</small></div>
    <div><span>{row?.detail||row?.slug||'-'}</span>{row?.slug&&row?.detail&&<small>{row.slug}</small>}{hasDiff&&<details><summary>변경 내용</summary><div className="audit-diff"><pre>{safeAdminJson(row.before)}</pre><pre>{safeAdminJson(row.after)}</pre></div>{row?.error&&<p className="cron-error">{row.error}</p>}</details>}</div>
  </article>;
}
function InstagramCard({refProp,post,card,index=0,total=0}){
  const safeCard=card||{type:'cover',headline:post?.instagramTitle||post?.feedTitle||post?.displayTitle||post?.keyword||'STELLATE',body:post?.summary||''};
  const type=String(safeCard.type||'feed_section');
  const promo=type==='promo';
  const rawImageUrl=post?.imageMeta?.thumbUrl||post?.thumbnail||post?.image||'';
  const imageUrl=!promo&&isUnsplashImageUrl(rawImageUrl)?optimizeImageUrl(rawImageUrl,1080):'';
  const sourceNames=Array.isArray(safeCard.sourceNames)?safeCard.sourceNames.filter(Boolean):[];
  const foot=[safeCard.photoCredit,sourceNames.length?`출처 ${sourceNames.join(' · ')}`:'',`${index+1}/${total||1}`].filter(Boolean).join(' · ');
  const className=['instagram-card','editorial-card',promo?'promo-card editorial-promo is-light':`editorial-${type} is-dark`].join(' ');
  return <article ref={refProp} className={className}>
    {imageUrl&&<img src={imageUrl} alt="" crossOrigin="anonymous"/>}
    <div className="instagram-overlay"/>
    <div className="instagram-brand"><strong>STELLATE</strong><em>{promo?'stellate.co.kr':String(post?.categoryLabel||CATEGORIES[post?.category]?.label||'TREND').toUpperCase()}</em></div>
    <div className="instagram-copy"><small>{promo?'STELLATE':safeCard.label||safeCard.type||'STORY'}</small><h2>{safeCard.headline||safeCard.title||'지금 뜨는 이야기'}</h2><p>{safeCard.body||safeCard.summary||''}</p>{promo&&<a>stellate.co.kr</a>}</div>
    <div className="instagram-foot">{foot||'STELLATE · 지금 뜨는 이야기를 한눈에'}</div>
  </article>;
}

function candidateRuleKey(value=''){return String(value||'').toLowerCase().replace(/[^0-9a-zㄱ-힣]/g,'');}
function NaverDiscoverySummary({diagnostics}){
  if(!diagnostics)return null;
  const feeds=Array.isArray(diagnostics.feeds)?diagnostics.feeds:[];
  const failures=feeds.filter(row=>!row.ok);
  return <div className={`naver-discovery-detail ${failures.length?'has-error':''}`}>
    <div className="candidate-summary source-summary">
      <span>네이버 요청 {diagnostics.requestedFeeds||0}</span>
      <span>성공 {diagnostics.successfulFeeds||0}</span>
      <span>실패 {diagnostics.failedFeeds||0}</span>
      <span>원본 기사 {diagnostics.rawItems||0}</span>
      <span>36시간 통과 {diagnostics.recentItems||0}</span>
      <span>후보 변환 {diagnostics.keywordItems||0}</span>
      <span>중복 제거 후 {diagnostics.dedupedCandidates||0}</span>
    </div>
    {failures.length>0&&<div className="candidate-warnings">{failures.map(row=><p key={row.key}>⚠ 네이버 {row.query}: {row.error||`HTTP ${row.status||0}`} · 시도 {row.attempts||0}회</p>)}</div>}
    {!failures.length&&diagnostics.successfulFeeds>0&&<p className="muted">네이버 뉴스 API 분야별 호출이 정상 완료됐습니다.</p>}
  </div>;
}

function CandidateReport({title,report,busy,confirmAdminAction,trendRules}){
  const excluded=new Set(trendRules?.excludedKeywords||[]),baseRows=report?.candidates||[];
  const approvalKeys=new Set((trendRules?.manualApprovals||[]).flatMap(item=>[item?.key,item?.eventKey,item?.keyword]).map(candidateRuleKey).filter(Boolean));
  const rows=baseRows.map(row=>({...row,manualApproved:row.manualApproved===true||[row.eventKey,row.keyword,row.rawKeyword].map(candidateRuleKey).some(key=>approvalKeys.has(key))}));
  const researchCount=rows.filter(row=>row.mainVisible||row.manualApproved).length;
  return <div className="candidate-report"><div className="candidate-report-head"><h3>{title}</h3><span>{report?.createdAt?new Date(report.createdAt).toLocaleString('ko-KR'):''}</span></div><div className="candidate-summary"><span>발견 후보 {rows.length}개</span><span>선정 후보 {researchCount}개</span><span>생성 후보 25개 고정</span><span>성공 후보 상위 20개 공개</span></div><div className="candidate-summary source-summary"><span>Google Trends {report?.diagnostics?.googleCandidates||0}</span><span>Google 뉴스 {report?.diagnostics?.googleNewsCandidates||0}</span><span>네이버 뉴스 {report?.diagnostics?.naverNewsCandidates||0}</span><span>병합 후보 {report?.diagnostics?.mergedCandidates||rows.length}</span></div><NaverDiscoverySummary diagnostics={report?.diagnostics?.naverDiscovery}/>{report?.diagnostics?.balancedDiscoveryCounts&&<div className="candidate-summary source-summary"><span>병합 투입 Trends {report.diagnostics.balancedDiscoveryCounts.googleTrends||0}</span><span>병합 투입 Google 뉴스 {report.diagnostics.balancedDiscoveryCounts.googleNews||0}</span><span>병합 투입 네이버 뉴스 {report.diagnostics.balancedDiscoveryCounts.naverNews||0}</span></div>}<p className="muted">Google Trends, Google 뉴스, 네이버 뉴스, 관리자 승인 후보와 최근 TOP을 합쳐 관심도 상대순위를 계산합니다. 상대순위 상위 25개를 생성 후보로 고정하고 모두 조사합니다. 검증에 성공한 후보를 원래 순위대로 정렬해 상위 20개만 공개하며, 실패 후보가 있으면 다음 순위 성공 후보가 자동 승격됩니다.</p>{report?.refreshFailed&&<div className="candidate-warnings"><p>⚠ 최근 실제 적용은 실패했습니다. 아래 추가 검색·기술 오류 사유와 실행 상태를 확인하세요.</p></div>}{report?.diagnostics?.warnings?.length>0&&<div className="candidate-warnings">{report.diagnostics.warnings.map((warning,index)=><p key={index}>⚠ {warning}</p>)}</div>}{report?.contentStaging&&<div className="candidate-summary"><span>생성 후보 {report.contentStaging.candidateCount||0}/25</span><span>처리 완료 {report.contentStaging.processedCount||0}</span><span>상세 준비 {report.contentStaging.readyCount||0}/25</span><span>피드 준비 {report.contentStaging.feedReadyCount||0}/25</span><span>공개 목표 20</span><span>기존 재사용 {report.contentStaging.carryoverReadyCount||0}</span><span>재작성 필요 {report.contentStaging.rejectedCount||0}</span><span>실패 시 다음 순위 자동 승격</span></div>}{report?.comparison&&<div className="candidate-summary"><span>예상 {report.comparison.nextCount||0}개</span><span>신규 {report.comparison.entered?.length||0}</span><span>탈락 {report.comparison.dropped?.length||0}</span><span>이동 {report.comparison.moved?.length||0}</span></div>}<div className="candidate-table">{rows.map((row,index)=><CandidateRow key={`${row.keyword}-${index}`} row={row} excluded={excluded.has(row.keyword)||row.excludedByAdmin} busy={busy} confirmAdminAction={confirmAdminAction}/>)}</div></div>;
}

function CandidateRow({row,excluded,busy,confirmAdminAction}){
  const components=row.components||{};
  const reasons=row.mainVisible||row.manualApproved
    ? ['멀티소스 조사 대상입니다. 제목·카테고리·출처는 조사 결과로 다시 판정합니다.']
    : [...(row.researchEntryRejectionReasons||[]),...(row.publicTopRejectionReasons||[]),...(row.titleValidationReasons||[])];
  const [open,setOpen]=useState(false);
  const [values,setValues]=useState({
    keyword:row.keyword||'',eventKey:row.eventKey||'',topKeyword:row.topKeyword||row.keyword||'',
    topTopic:row.topTopic||'',category:row.category||'general',searchQuery:row.searchQuery||`${row.topKeyword||row.keyword||''} ${row.topTopic||''}`.trim(),note:'',
  });
  const manualApproved=row.manualApproved===true;
  const statusLabel=manualApproved?'관리자 승인·조사 대상':row.mainVisible?'조사 대상':'초기 제외';
  return <article className={`candidate-row grade-pending ${row.mainVisible?'is-selected':'is-rejected'} ${manualApproved?'is-manual-approved':''}`}>
    <div className="candidate-rank"><strong>{row.candidateRank||'-'}</strong><span>{manualApproved?'승인':row.mainVisible?'조사':'제외'}</span></div>
    <div className="candidate-main">
      <div className="candidate-title"><strong>{row.displayTitle||row.keyword}</strong><em>초기신호 {row.rankingScore||0}</em><b>{statusLabel}</b></div>
      <div className="candidate-metrics"><span>검색 {components.search||0}</span><span>뉴스속도 {components.newsVelocity||0}</span><span>사건일관성 {row.eventCoherence||0}</span><span>제목근거 {row.topTopicSupport||0}</span><span>독립출처 {row.independentSources||0}</span><span>공식 {row.officialSources||0}</span></div>
      {reasons.length>0&&<p>{[...new Set(reasons)].join(' · ')}</p>}
      <small>{(row.sourceDomains||[]).join(', ')||'확인된 도메인 없음'}</small>
      {open&&<div className="title-editor candidate-approval-editor">
        <label><span>TOP 주체</span><input value={values.topKeyword} onChange={e=>setValues(current=>({...current,topKeyword:e.target.value}))}/></label>
        <label><span>구체 사건 유형</span><input value={values.topTopic} onChange={e=>setValues(current=>({...current,topTopic:e.target.value}))} placeholder="예: 경기 활약, 시청률 변화, 서비스 장애"/></label>
        <label><span>카테고리</span><select value={values.category} onChange={e=>setValues(current=>({...current,category:e.target.value}))}>{Object.entries(CATEGORIES).map(([key,cat])=><option key={key} value={key}>{cat.label}</option>)}</select></label>
        <label><span>조사 검색어</span><input value={values.searchQuery} onChange={e=>setValues(current=>({...current,searchQuery:e.target.value}))}/></label>
        <label><span>승인 메모</span><input value={values.note} onChange={e=>setValues(current=>({...current,note:e.target.value}))} placeholder="선택 사항"/></label>
        <div className="admin-actions"><button disabled={busy} onClick={()=>confirmAdminAction({action:'approve_trend_candidate',values,detail:values.note},'후보 승인 저장과 TOP 갱신 등록을 완료했습니다.',{title:'이 자동 탈락 후보를 승인할까요?',description:`${values.topKeyword} · ${values.topTopic}`,impact:'승인 후보는 Google Trends에서 사라져도 조사 시드로 유지되며, 저장 직후 TOP 갱신이 자동 등록됩니다. 검증 사실·출처·저작권 기준은 그대로 적용됩니다.',confirmLabel:'후보 승인',tone:'warning',reload:true})}>승인 저장</button><button onClick={()=>setOpen(false)}>닫기</button></div>
      </div>}
    </div>
    <div className="manage-controls">
      {manualApproved
        ? <button disabled={busy} onClick={()=>confirmAdminAction({action:'revoke_trend_candidate_approval',values:{keyword:row.keyword,eventKey:row.eventKey}},'관리자 후보 승인을 취소했습니다.',{title:'관리자 승인을 취소할까요?',description:row.displayTitle||row.keyword,impact:'다음 TOP 갱신부터 다시 자동 검증 기준을 적용합니다.',confirmLabel:'승인 취소',tone:'danger',reload:true})}>승인 취소</button>
        : <button disabled={busy} onClick={()=>setOpen(value=>!value)}>검토·승인</button>}
      <button disabled={busy} onClick={()=>confirmAdminAction({action:excluded?'allow_trend':'exclude_trend',value:row.keyword},excluded?'후보 제외를 해제했습니다.':'이 후보를 향후 TOP에서 제외했습니다.',{title:excluded?'후보 제외를 해제할까요?':'이 후보를 TOP에서 제외할까요?',description:row.keyword,impact:'다음 TOP 계산부터 반영됩니다. 현재 순위는 실제 적용을 다시 실행해야 변경됩니다.',confirmLabel:excluded?'제외 해제':'후보 제외',tone:excluded?'warning':'danger',reload:true})}>{excluded?'제외 해제':'향후 제외'}</button>
    </div>
  </article>;
}

function ReviewRow({draft,busy,action,confirmAdminAction}){
  const reasons=draft.publicationReasons||draft.publicationDecision?.reasons||[];
  const facts=draft.factLedger?.facts||[],sources=draft.factLedger?.sources||[],conflicts=draft.factLedger?.conflicts||[];
  return <article className="review-row"><div className="review-head"><div><strong>{draft.detailTitle||draft.feedTitle||draft.displayTitle||draft.keyword}</strong><p>{draft.slug}</p></div><span className="review-score">종합 {draft.qualityScore||0}</span></div><div className="quality-grid"><span>출처 {draft.sourceQualityScore||0}</span><span>본문 {draft.contentQualityScore||0}</span><span>근거 {draft.groundingScore||0}</span><span>저작권 {draft.copyrightScore||0}</span></div>{reasons.length>0&&<ul className="review-reasons">{reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}<details><summary>근거·출처 확인</summary><div className="review-evidence"><h3>검증 사실 {facts.length}개</h3><ol>{facts.map(f=><li key={f.id}><b>{f.id}</b> {f.text} <small>{(f.sourceIds||[]).join(', ')}</small></li>)}</ol><h3>사용 출처 {sources.length}개</h3><ul>{sources.map(src=><li key={src.id}><b>{src.id}</b> {src.source} · {src.sourceType} · <a href={src.url} target="_blank" rel="noreferrer">원문</a></li>)}</ul>{conflicts.length>0&&<><h3>충돌 감지</h3><ul className="review-reasons">{conflicts.map((row,index)=><li key={index}>{row.reason} ({(row.factIds||[]).join(' / ')})</li>)}</ul></>}</div></details><details><summary>초안 확인</summary><h3>{draft.card?.summary}</h3><pre className="draft-preview">{draft.blog}</pre></details><div className="review-actions"><button disabled={busy} onClick={()=>confirmAdminAction({action:'approve_review',slug:draft.slug},'검토 초안을 공개했습니다.',{title:'이 초안을 공개할까요?',description:draft.detailTitle||draft.feedTitle||draft.displayTitle||draft.keyword,impact:'승인 즉시 피드와 상세페이지에 공개됩니다.',confirmLabel:'승인·공개',tone:'warning'})}>승인·공개</button><button className="danger" disabled={busy} onClick={()=>{const detail=prompt('반려 사유를 입력하세요.','품질 기준 미달');if(detail!=null)confirmAdminAction({action:'reject_review',slug:draft.slug,detail},'검토 초안을 반려했습니다.',{title:'이 초안을 반려할까요?',description:detail||'반려 사유 없음',impact:'검토 대기 초안이 반려 상태로 이동합니다.',confirmLabel:'반려 실행',tone:'danger'});}}>반려</button><button disabled={busy} onClick={()=>confirmAdminAction({action:'regenerate',slug:draft.slug},'새 초안을 생성했습니다.',{title:'이 초안을 다시 생성할까요?',description:draft.detailTitle||draft.feedTitle||draft.displayTitle||draft.keyword,impact:'AI 토큰이 사용되며 현재 초안과 다른 결과가 생성될 수 있습니다.',confirmLabel:'재생성 실행',tone:'warning'})}>재생성</button></div></article>;
}
function ConfirmationDialog({dialog,confirmText,setConfirmText,busy,onCancel,onConfirm}){
  if(!dialog)return null;
  const textRequired=Boolean(dialog.requireText),ready=!textRequired||confirmText===dialog.requireText;
  return <div className="confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onCancel();}}><section className={`confirm-dialog ${dialog.tone==='danger'?'is-danger':'is-warning'}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><div className="confirm-icon" aria-hidden="true">{dialog.tone==='danger'?'!':'?'}</div><div className="confirm-copy"><span className="confirm-kicker">실행 전 확인</span><h2 id="confirm-title">{dialog.title}</h2>{dialog.description&&<p id="confirm-description">{dialog.description}</p>}{dialog.impact&&<div className="confirm-impact"><strong>영향</strong><span>{dialog.impact}</span></div>}{textRequired&&<label className="confirm-text-field"><span>계속하려면 <b>{dialog.requireText}</b>를 입력하세요.</span><input autoFocus value={confirmText} onChange={event=>setConfirmText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&ready&&!busy)onConfirm();}} placeholder={dialog.requireText}/></label>}<div className="confirm-actions"><button className="confirm-cancel" disabled={busy} onClick={onCancel}>취소</button><button className={dialog.tone==='danger'?'confirm-danger':'confirm-primary'} disabled={busy||!ready} onClick={onConfirm}>{busy?'처리 중…':dialog.confirmLabel||'실행'}</button></div></div></section></div>;
}
function RunRow({run,busy,confirmAdminAction}){
  const total=Number(run.total||run.queued||0),done=Number(run.completed||0),attempted=Math.max(Number(run.attemptedCandidates||0),Number(run.lastCompletedCursor||0)),ready=Number(run.generated||0)+Number(run.reused||0),progressBase=Math.max(done,attempted),pct=total?Math.min(100,Math.round(progressBase/total*100)):0;
  const hasRefreshResult=Boolean(run.refreshResult||run.refreshCode);
  const stopped=['cancelled','stopped_timeout'].includes(String(run.status||''));
  const retryableFailure=['failed','completed_with_errors'].includes(String(run.status||''));
  const resumable=(run.executionStale||stopped||retryableFailure)&&String(run.workflowType||'')==='top_refresh_v2';
  const stoppable=!TERMINAL.has(String(run.status||''));
  return <div className="status-row cron-run-row"><div className="run-main"><strong><span className={`trigger-badge ${String(run.trigger||'').startsWith('admin')?'manual':'auto'}`}>{String(run.trigger||'').startsWith('admin')?'수동':'자동'}</span> {cronStatusLabel(run.status)}</strong>{run.qstashDeliveryStale&&<p className="cron-error">QStash 등록 후 10분 동안 콜백이 시작되지 않았습니다.</p>}{run.executionStale&&<p className="cron-error">배치 실행 상태가 10분 이상 갱신되지 않았습니다.</p>}{hasRefreshResult&&<p className="refresh-result">{run.refreshResult==='verified_unchanged'?'TOP 실제 갱신 완료 · 검증 사건이 이전과 동일합니다.':run.refreshResult==='updated'?`TOP 실제 변경 · 신규 ${run.entered||0} · 이탈 ${run.dropped||0} · 순위변경 ${run.moved||0}`:`갱신 코드 ${run.refreshCode||run.refreshResult}`}{String(run.saveVerified)==='true'&&' · Redis 저장 확인'}</p>}<p>TOP 키워드 {total} · 1차 처리 {Math.min(attempted,total)}/{total||0} · 콘텐츠 준비 {ready} · 재시도 대기 {run.retryWait||0} · 실패 {run.failed||0} · 중단 {run.stopped||0}</p><div className="run-progress"><i style={{width:`${pct}%`}}/></div><small>최종 완료 {done}/{total||0}{run.batchCursor!=null?` · 1차 키워드 위치 ${Math.min(Number(run.batchCursor||0),total)}/${total}`:''}{run.retryProcessed?` · 추가 검색 처리 ${run.retryProcessed}`:''}{run.stepCount?` · 실행 단계 ${run.stepCount}`:''}{run.ageMinutes?` · 시작 후 ${run.ageMinutes}분`:''}</small>{run.error&&<p className="cron-error">{run.refreshCode&&<b>[{run.refreshCode}] </b>}{run.error}</p>}<div className="admin-actions">{stoppable&&<button disabled={busy} onClick={()=>confirmAdminAction({action:'stop_trend_run',values:{runId:run.runId},detail:'관리자 화면에서 즉시 중단'},'TOP 갱신 중단 요청을 저장했습니다.',{title:'이 TOP 갱신을 중단할까요?',description:`1차 처리 ${attempted}/${total} · 준비 ${ready}/${total}`,impact:'현재 처리 중인 소배치가 끝난 뒤 다음 QStash 배치와 원자적 공개를 중단합니다. 기존 공개 TOP은 유지됩니다.',confirmLabel:'TOP 갱신 중단',tone:'danger',reload:true})}>작업 중단</button>}{resumable&&<button disabled={busy} onClick={()=>confirmAdminAction({action:'resume_trend_run',values:{runId:run.runId}},'중단된 TOP 배치 실행을 재개했습니다.',{title:'이 TOP 갱신을 마지막 위치부터 재개할까요?',description:`1차 처리 ${attempted}/${total} · 준비 ${ready}/${total}`,impact:'이미 완료된 키워드는 다시 처리하지 않고 저장된 미완료 키워드만 명시적으로 재개합니다.',confirmLabel:'배치 실행 재개',tone:'warning'})}>중단 지점부터 재개</button>}</div></div><code>{run.engineVersion?`v${run.engineVersion} · `:''}{run.runId}</code></div>;
}

function cronStatusLabel(value){return({queued:'QStash 전달 대기',callback_started:'콜백 시작',collecting_candidates:'후보 수집 중',batch_queued:'다음 키워드 배치 대기',start_retry_wait:'후보 수집 재시도 대기',batch_retry_wait:'키워드 배치 재시도 대기',retry_queued:'추가 검색 소배치 대기',processing_retry_batch:'추가 검색 소배치 처리 중',retry_retry_wait:'추가 검색 단계 재시도 대기',finalize_retry_wait:'최종 저장 재시도 대기',processing_batch:'키워드 조사 배치 처리 중',researching_candidates:'키워드 정체·관련 내용 조사 중',candidate_processing_complete:'키워드 조사 완료',resume_queued:'중단 배치 재개 대기',finalize_queued:'최종 공개 준비 대기',validating_publication:'20개 저장 확인 중',stop_requested:'중단 요청 처리 중',cancelled:'관리자 중단 완료',stopped_timeout:'안전 한도 자동 중단',completed:'원자적 공개 완료',completed_with_errors:'일부 기술 오류',failed:'기술 실패'})[value]||value||'확인 중';}
function statusLabel(value){return({queued:'대기열',processing:'처리 중',generated:'생성 완료',reused:'재사용',pending:'자료 보완',retry_wait:'추가 검색 대기',review:'일반 콘텐츠 검토 대기',review_required:'일반 콘텐츠 검토 대기',failed:'기술 실패',stopped:'작업 중단',generating:'생성 중',published:'공개',approved:'승인',private:'비공개'})[value]||value;}
function auditLabel(value){return({trend_refresh_stop_requested:'TOP 갱신 중단 요청',trend_refresh_stopped:'TOP 갱신 중단 완료',admin_login:'관리자 로그인',admin_logout:'관리자 로그아웃',trend_refresh_queued:'TOP 갱신 등록',trend_preview:'TOP 미리 계산',trend_candidate_excluded:'TOP 후보 제외',trend_candidate_allowed:'TOP 후보 제외 해제',trend_candidate_approved:'TOP 후보 관리자 승인',trend_candidate_approval_revoked:'TOP 후보 승인 취소',trend_refresh_started:'TOP 갱신 시작',trend_refresh_completed:'TOP 갱신 완료',trend_refresh_failed:'TOP 갱신 실패',trend_refresh_resumed:'TOP 배치 실행 재개',content_generation_completed:'콘텐츠 생성 완료',content_generation_failed:'콘텐츠 생성 실패',content_review_required:'콘텐츠 검토 대기',review_draft_saved:'검토 초안 저장',review_draft_approved:'검토 승인',review_draft_rejected:'검토 반려',regenerate_instagram:'인스타 카드 재생성',rebuild_missing_feeds:'누적 피드 전체 복구',titles_change:'제목 변경',category_change:'카테고리 변경',reset_feed:'피드 초기화',regenerate:'콘텐츠 재생성',slug_redirect:'slug 리다이렉트',slug_migrate:'slug 이관',clear_generation_history:'생성 상태 기록 정리'})[value]||value;}

export async function getServerSideProps({req,res}){
  if(!isAdminRequest(req))return{redirect:{destination:'/admin-login',permanent:false}};
  const safe=async(factory,fallback,ms=7000)=>{
    let timer;
    try{
      return await Promise.race([
        Promise.resolve().then(factory),
        new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);}),
      ]);
    }catch{return fallback;}finally{if(timer)clearTimeout(timer);}
  };
  try{
    const [trends,feed,contents,reviewDrafts,audit,tokenUsage,events,cronRuns,top10History,candidateReport,previewReport,trendRules,trendsUpdatedAt,refreshHealth,activeRunId,thumbnailPool]=await Promise.all([
      safe(()=>getCachedTrends({includeHidden:true}),[]),safe(()=>getFeedPosts(1000,0,{includeHidden:true}),[]),safe(()=>getAllContents(1000),[]),safe(()=>getReviewDrafts(1000),[]),safe(()=>getAuditLogs(100),[]),safe(()=>getTokenUsage(7),[]),safe(()=>getEventStats(7),[]),safe(()=>getAdminRunSnapshot(10),[]),safe(()=>getTop10History(200),[]),safe(()=>getTrendCandidateReport('latest'),null),safe(()=>getTrendCandidateReport('preview'),null),safe(()=>getTrendRules(),{excludedKeywords:[]}),safe(()=>getTrendsUpdatedAt(),null),safe(()=>getTrendRefreshHealth(),null),safe(()=>getActiveTrendRefreshRunId(),''),safe(()=>getThumbnailPoolAdminState(),{items:[],usage:[],targetSize:500}),
    ]);
    res.setHeader('Cache-Control','private, no-store');
    const currentReviewDrafts=(Array.isArray(reviewDrafts)?reviewDrafts:[]).filter(item=>Number(item?.contentVersion||0)===CURRENT_CONTENT_VERSION);
    const currentContents=(Array.isArray(contents)?contents:[]).filter(item=>Number(item?.contentVersion||0)===CURRENT_CONTENT_VERSION||item?.status==='published');
    return{props:JSON.parse(JSON.stringify({trends:Array.isArray(trends)?trends:[],feed:Array.isArray(feed)?feed:[],contents:currentContents,reviewDrafts:currentReviewDrafts,audit:Array.isArray(audit)?audit:[],tokenUsage:Array.isArray(tokenUsage)?tokenUsage:[],events:Array.isArray(events)?events:[],cronRuns:Array.isArray(cronRuns)?cronRuns:[],top10History:Array.isArray(top10History)?top10History:[],candidateReport:candidateReport||null,previewReport:previewReport||null,trendRules:trendRules||{excludedKeywords:[]},trendsUpdatedAt:trendsUpdatedAt||null,refreshHealth:refreshHealth||null,activeRunId:activeRunId||'',thumbnailPool:thumbnailPool||{items:[],usage:[],targetSize:500},initialLoadError:false}))};
  }catch(error){
    res.setHeader('Cache-Control','private, no-store');
    return{props:{trends:[],feed:[],contents:[],reviewDrafts:[],audit:[],tokenUsage:[],events:[],cronRuns:[],top10History:[],candidateReport:null,previewReport:null,trendRules:{excludedKeywords:[]},trendsUpdatedAt:null,refreshHealth:null,activeRunId:'',thumbnailPool:{items:[],usage:[],targetSize:500},initialLoadError:true}};
  }
}
