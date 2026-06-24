import Head from 'next/head';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import Header from '../../components/Header';
import MonetizationSlot from '../../components/MonetizationSlot';
import { CATEGORIES } from '../../lib/categories';
import { getContent, getCachedTrends, getContentStatus, getViewCount, getSlugRedirect, queryFeedPosts } from '../../lib/kv';
import { optimizeImageUrl, isUnsplashImageUrl } from '../../lib/images';

function parseBlog(text='') {
  const sections=[];
  let current={title:'',paragraphs:[]};
  for(const raw of String(text).split('\n')){
    const line=raw.trim();
    if(!line)continue;
    if(line.startsWith('## ')){
      if(current.title||current.paragraphs.length)sections.push(current);
      current={title:line.replace(/^##\s+/,''),paragraphs:[]};
    }else current.paragraphs.push(line.replace(/^[-*]\s+/,'• '));
  }
  if(current.title||current.paragraphs.length)sections.push(current);
  return sections;
}

function SectionBlock({section}){
  return <div className="article-section">{section.title&&<h2>{section.title}</h2>}{section.paragraphs.map((paragraph,index)=>paragraph.startsWith('• ')?<p className="bullet-line" key={index}>{paragraph}</p>:<p key={index}>{paragraph}</p>)}</div>;
}

function StatusPage({content,trend}){
  const title=content?.detailTitle||content?.displayTitle||trend?.displayTitle||trend?.keyword||'콘텐츠';
  return <><Head><title>{title} — STELLATE</title></Head><Header/><main className="page-shell"><section className="status-card"><div className="status-spinner">✦</div><p className="eyebrow">CONTENT CHECK</p><h1>검증된 내용을 준비하고 있어요</h1><h2>{title}</h2><p>확인 가능한 자료를 다시 점검한 뒤 공개합니다. 준비되지 않은 설명은 먼저 노출하지 않습니다.</p><Link href="/" className="primary-link">주요 이슈로 돌아가기</Link></section></main></>;
}


function sourceKey(item={}){
  let url=String(item?.link||item?.url||'').trim();
  try{const parsed=new URL(url);['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','ref'].forEach(key=>parsed.searchParams.delete(key));parsed.hash='';url=parsed.toString().replace(/\/$/,'');}catch{}
  const title=String(item?.title||item?.label||'').trim().toLowerCase();
  const source=String(item?.source||item?.domain||'').trim().toLowerCase();
  return url||`${source}|${title}`;
}

function dedupeSources(items=[]){
  const seen=new Set();
  const result=[];
  for(const item of Array.isArray(items)?items:[]){
    const key=sourceKey(item);
    if(!key||seen.has(key))continue;
    seen.add(key);result.push(item);
  }
  return result;
}

function sourceTypeLabel(type=''){
  if(type==='official')return '공식 자료';
  if(type==='authorized')return '공식·사용 허용 자료';
  if(type==='trusted_news')return '신뢰도 높은 뉴스';
  if(type==='independent')return '독립 검증 자료';
  return '확인 자료';
}

export default function KeywordPage({content,trend,related,previous,next,initialViews}){
  const [views,setViews]=useState(initialViews||0);
  const [shareMessage,setShareMessage]=useState('');
  const sections=useMemo(()=>parseBlog(content?.blog||''),[content?.blog]);
  const mainSections=sections;
  const contentReady=Boolean(content?.hasContent??content?.hasNews);

  useEffect(()=>{
    if(!content?.slug||!contentReady)return;
    let sessionId='';
    try{sessionId=sessionStorage.getItem('stellate-view-session')||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem('stellate-view-session',sessionId);}catch{}
    fetch('/api/view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:content.slug,sessionId})}).then(r=>r.json()).then(data=>setViews(data.views||views)).catch(()=>{});
    try{const key=`stellate-detail-event:${content.slug}`;if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,'1');fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'feed_detail_view',slug:content.slug})}).catch(()=>{});}}catch{}
  },[content?.slug,contentReady]);

  if(!contentReady||content?.status!=='published')return <StatusPage content={content} trend={trend}/>;

  const title=content.detailTitle||content.card?.detailTitle||content.card?.feedTitle||content.displayTitle||content.keyword;
  const category=CATEGORIES[content.category]||CATEGORIES.general;
  const points=Array.isArray(content.card?.points)?content.card.points.slice(0,5):[];
  const summary=content.card?.lead||content.card?.summary||'';
  const summaryContext=content.card?.context||content.card?.why||'';
  const qa=(Array.isArray(content.qa)?content.qa:[]).filter(row=>row?.q&&row?.a).slice(0,3);
  const videos=(Array.isArray(content.relatedVideos)?content.relatedVideos:Array.isArray(content.videos)?content.videos:[]).filter(video=>video?.title&&(video?.id||video?.url)).slice(0,2);
  const relatedNews=dedupeSources(Array.isArray(content.relatedNews)?content.relatedNews:[]).slice(0,3);
  const relatedLinks=new Set(relatedNews.map(sourceKey));
  const evidence=dedupeSources(Array.isArray(content.evidenceSources)?content.evidenceSources:Array.isArray(content.sourceItems)?content.sourceItems:[])
    .filter(item=>!relatedLinks.has(sourceKey(item)));
  const officialSourceCount=evidence.filter(item=>item.sourceType==='official'||item.sourceType==='authorized').length;
  const verifiedSourceCount=Number(content.factSummary?.sourceCount||content.trustSummary?.evidenceSources||evidence.length||0);
  const verifiedFactCount=Number(content.factSummary?.factCount||content.verifiedFactCount||0);
  const adEligible=content.adEligible!==false;
  const middleIndex=Math.max(0,Math.floor(mainSections.length/2)-1);

  async function share(){
    const payload={title,text:content.card?.summary||title,url:window.location.href};
    try{if(navigator.share)await navigator.share(payload);else{await navigator.clipboard.writeText(window.location.href);setShareMessage('링크를 복사했습니다.');}fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'share',slug:content.slug})}).catch(()=>{});}catch{}
  }

  return <>
    <Head><title>{title} — STELLATE</title><meta name="description" content={content.card?.summary||''}/><link rel="canonical" href={`https://stellate.co.kr/feed/${content.slug}`}/>{content.image&&<meta property="og:image" content={content.image}/>}</Head>
    <Header/>
    <main className="article-shell">
      <article>
        <header className="article-hero" style={{background:content.image?'#111':category.heroBg}}>
          {isUnsplashImageUrl(content.image)&&<img src={optimizeImageUrl(content.image,1400,80)} alt="" className="article-hero-image" loading="eager"/>}<div className="article-hero-overlay"/>
          <div className="article-hero-content"><div className="article-badges"><span>{category.label}</span>{trend?.rank&&<span>TOP {trend.rank}</span>}{evidence.length>0&&Number(content.groundingScore||0)>=90&&<span>근거 연결 {content.groundingScore}</span>}</div><h1>{title}</h1><div className="article-meta"><span>{new Date(content.generatedAt).toLocaleString('ko-KR')}</span><span>조회 {views.toLocaleString()}</span></div></div>
        </header>

        <section className="quick-summary editorial-summary-card">
          <p className="eyebrow">핵심 요약</p>
          <h2>{summary}</h2>
          {summaryContext&&summaryContext!==summary&&<p className="summary-context">{summaryContext}</p>}
          {points.length>0&&<ul>{points.map((point,index)=><li key={index}><span>{index+1}</span><p>{point}</p></li>)}</ul>}
        </section>

        <div className="evidence-summary" aria-label="콘텐츠 검증 정보">
          <span>검증 출처 {verifiedSourceCount || evidence.length}개</span>
          {officialSourceCount>0&&<span>공식·공인 자료 {officialSourceCount}개</span>}
          {verifiedFactCount>0&&<span>확인 사실 {verifiedFactCount}개</span>}
          {relatedNews.length>0&&<span>연관 뉴스 {relatedNews.length}개</span>}
          {videos.length>0&&<span>관련 영상 {videos.length}개</span>}
        </div>

        {adEligible&&<MonetizationSlot slot={process.env.NEXT_PUBLIC_ADSENSE_DETAIL_SLOT} label="이 주제와 함께 많이 보는 콘텐츠" items={related} className="article-ad-slot"/>}

        <section className="article-body">{mainSections.map((section,index)=><Fragment key={`${section.title}-${index}`}><SectionBlock section={section}/>{adEligible&&mainSections.length>2&&index===middleIndex&&<MonetizationSlot slot={process.env.NEXT_PUBLIC_ADSENSE_DETAIL_SLOT} label="STELLATE에서 더 보기" items={related} compact className="article-inline-ad"/>}</Fragment>)}</section>

        {qa.length>0&&<section className="qa-section"><p className="eyebrow">자주 묻는 내용</p>{qa.map((row,index)=><details key={index} open={index===0}><summary>{row.q}</summary><p>{row.a}</p></details>)}</section>}

        {relatedNews.length>0&&<section className="sources-section related-news-section"><p className="eyebrow">연관 뉴스</p>{relatedNews.map((item,index)=><a key={index} href={item.link||item.url} target="_blank" rel="noopener noreferrer" onClick={()=>fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'related_news_click',slug:content.slug})}).catch(()=>{})}><strong>{item.displayTitle||item.title||item.label||`${content.topKeyword||content.keyword} 관련 보도`}</strong><span>{item.source}{(item.date||item.publishedAt)?` · ${item.date||new Date(item.publishedAt).toLocaleDateString('ko-KR')}`:''} · 기사 보기</span></a>)}</section>}

        {videos.length>0&&<section className="youtube-section"><p className="eyebrow">관련 영상</p><div className="youtube-grid">{videos.map(video=><a key={video.id} className="youtube-card" href={video.url||`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" onClick={()=>fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'youtube_click',slug:content.slug})}).catch(()=>{})}><div className="youtube-thumb youtube-thumb-safe"><span aria-hidden="true">▶</span></div><div className="youtube-copy"><strong>{video.title}</strong><span>{video.channel||'YouTube'}{video.publishedAt?` · ${new Date(video.publishedAt).toLocaleDateString('ko-KR')}`:''}</span></div></a>)}</div></section>}


        {evidence.length>0&&<section className="sources-section compact-sources"><p className="eyebrow">자료 출처</p>{evidence.slice(0,8).map((item,index)=><a key={index} href={item.link||item.url} target="_blank" rel="noopener noreferrer" onClick={()=>fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'source_click',slug:content.slug})}).catch(()=>{})}><strong>{item.title||item.label||'자료 보기'}</strong><span>{item.source} · {sourceTypeLabel(item.sourceType)}{(item.date||item.publishedAt)?` · ${item.date||new Date(item.publishedAt).toLocaleDateString('ko-KR')}`:''}</span></a>)}</section>}

        <section className="share-section"><button onClick={share}>공유하기</button>{shareMessage&&<span>{shareMessage}</span>}</section>
        {content.imageMeta?.photographerName&&<div className="photo-credit">Photo by <a href={content.imageMeta.photographerProfileUrl||content.imageMeta.unsplashPhotoUrl} target="_blank" rel="noopener noreferrer">{content.imageMeta.photographerName}</a> on Unsplash</div>}
      </article>
      {(previous||next)&&<nav className="article-navigation">{previous?<Link href={`/feed/${previous.slug}`}><small>{previous.rank?`TOP ${previous.rank} · 이전 글`:'이전 글'}</small><strong>{previous.feedTitle||previous.displayTitle||previous.keyword}</strong></Link>:<span/>}{next?<Link href={`/feed/${next.slug}`}><small>{next.rank?`TOP ${next.rank} · 다음 글`:'다음 글'}</small><strong>{next.feedTitle||next.displayTitle||next.keyword}</strong></Link>:<span/>}</nav>}
    </main>
  </>;
}

export async function getServerSideProps({params,res}){
  const slug=String(params.slug||'');
  const redirect=await getSlugRedirect(slug);
  if(redirect)return{redirect:{destination:`/feed/${redirect}`,permanent:true}};
  const trends=await getCachedTrends();
  const trend=trends.find(item=>item.slug===slug)||null;
  const [content,status,views]=await Promise.all([getContent(slug),getContentStatus(slug),getViewCount(slug)]);
  if(!content&&!trend)return{notFound:true};
  const baseCategory=content?.category||trend?.category||'general';
  const {items:categoryPosts}=await queryFeedPosts({limit:12,offset:0,category:baseCategory,sort:'latest'});
  const related=(categoryPosts||[]).filter(item=>item.slug!==slug&&Number(item.qualityScore||0)>=82).slice(0,2);
  const topIndex=(trends||[]).findIndex(item=>item.slug===slug);
  let previous=null;let next=null;
  if(topIndex>=0){
    previous=topIndex>0?trends[topIndex-1]||null:null;
    next=topIndex<trends.length-1?trends[topIndex+1]||null:null;
  }else{
    const {items:sequencePosts}=await queryFeedPosts({limit:200,offset:0,sort:'sequence'});
    const index=(sequencePosts||[]).findIndex(item=>item.slug===slug);
    previous=index>=0?sequencePosts[index+1]||null:null;
    next=index>0?sequencePosts[index-1]||null:null;
  }
  res.setHeader('Cache-Control',content?'public, s-maxage=600, stale-while-revalidate=1800':'private, no-store');
  return{props:JSON.parse(JSON.stringify({content:content||{slug,displayTitle:trend?.displayTitle||trend?.keyword,keyword:trend?.keyword,category:baseCategory,hasContent:false,status:status?.status||'pending',image:trend?.thumbnail||null,imageMeta:trend?.imageMeta||null},trend,related,previous,next,initialViews:views}))};
}
