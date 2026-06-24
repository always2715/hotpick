import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { CATEGORIES } from '../lib/categories';
import { getContent, getCachedTrends, getContentStatus, getViewCount, getSlugRedirect } from '../lib/kv';
import { optimizeImageUrl, isUnsplashImageUrl } from '../lib/images';

function StatusPage({content,trend}){
  const title=content?.detailTitle||content?.displayTitle||trend?.displayTitle||trend?.keyword||'콘텐츠';
  return <><Head><title>{title} — STELLATE</title></Head><Header/><main className="page-shell"><section className="status-card"><div className="status-spinner">✦</div><p className="eyebrow">CONTENT CHECK</p><h1>검증된 내용을 준비하고 있어요</h1><h2>{title}</h2><p>확인 가능한 자료를 다시 점검한 뒤 공개합니다. 준비되지 않은 설명은 먼저 노출하지 않습니다.</p><Link href="/" className="primary-link">주요 이슈로 돌아가기</Link></section></main></>;
}

export default function TopPreview({content,trend,initialViews}){
  const [views]=useState(initialViews||0);
  const contentReady=Boolean(content?.hasContent??content?.hasNews);
  useEffect(()=>{
    if(!content?.slug||!contentReady)return;
    try{const key=`stellate-top-preview:${content.slug}`;if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,'1');fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'top_preview_view',slug:content.slug})}).catch(()=>{});}}catch{}
  },[content?.slug,contentReady]);
  if(!contentReady||content?.status!=='published')return <StatusPage content={content} trend={trend}/>;

  const title=content.feedTitle||content.card?.feedTitle||content.detailTitle||content.displayTitle||content.keyword;
  const keyword=content.topKeyword||content.keyword||trend?.topKeyword||trend?.keyword||title;
  const category=CATEGORIES[content.category]||CATEGORIES.general;
  const points=Array.isArray(content.card?.points)?content.card.points.slice(0,5):[];
  const summaryParagraphs=Array.isArray(content.card?.summaryParagraphs)?content.card.summaryParagraphs.filter(Boolean):[];
  const summary=summaryParagraphs[0]||content.card?.summary||content.summary||'';
  const why=summaryParagraphs[1]||content.card?.why||'';
  const infoLine=content.card?.infoLine||`${keyword}에 대한 정보`;
  const summaryLabel=content.card?.summaryLabel||'요약 정보';
  const pointsLabel=content.card?.pointsLabel||'주요 내용';
  const ctaLabel=content.card?.ctaLabel||'상세 정보 피드 보기';

  return <>
    <Head><title>{title} — STELLATE</title><meta name="description" content={[summary,why].filter(Boolean).join(' ')}/><link rel="canonical" href={`https://stellate.co.kr/${content.slug}`}/>{content.image&&<meta property="og:image" content={content.image}/>}</Head>
    <Header/>
    <main className="preview-shell">
      <article className="feed-preview-card">
        <header className="preview-hero" style={{background:content.image?'#111':category.heroBg}}>
          {isUnsplashImageUrl(content.image)&&<img src={optimizeImageUrl(content.image,1200,80)} alt="" className="preview-hero-image" loading="eager"/>}<div className="preview-hero-overlay"/>
          <div className="preview-hero-content"><div className="article-badges"><span>{category.label}</span>{trend?.rank&&<span>TOP {trend.rank}</span>}</div><h1>{title}</h1></div>
        </header>
        <section className="preview-copy">
          <p className="preview-info-line">{infoLine}</p>
          <div className="preview-section"><h2>{summaryLabel}</h2><p className="preview-summary">{summary}</p>{why&&<p className="preview-summary-secondary">{why}</p>}</div>
          {points.length>0&&<div className="preview-section"><h2>{pointsLabel}</h2><ul>{points.map((point,index)=><li key={index}><span>•</span><p>{point}</p></li>)}</ul></div>}
          <div className="preview-meta"><span>{new Date(content.generatedAt).toLocaleString('ko-KR')}</span><span>조회 {Number(views||0).toLocaleString()}</span></div>
          <Link href={`/feed/${content.slug}`} className="detail-cta" onClick={()=>fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'detail_cta_click',slug:content.slug})}).catch(()=>{})}>{ctaLabel} <span>→</span></Link>
        </section>
      </article>
      <Link href="/" className="preview-back">← TOP 목록으로 돌아가기</Link>
    </main>
  </>;
}

export async function getServerSideProps({params,res}){
  const slug=String(params.slug||'');
  const redirect=await getSlugRedirect(slug);
  if(redirect)return{redirect:{destination:`/${redirect}`,permanent:true}};
  const trends=await getCachedTrends();
  const trend=trends.find(item=>item.slug===slug)||null;
  const [content,status,views]=await Promise.all([getContent(slug),getContentStatus(slug),getViewCount(slug)]);
  if(!content&&!trend)return{notFound:true};
  res.setHeader('Cache-Control',content?'public, s-maxage=600, stale-while-revalidate=1800':'private, no-store');
  return{props:JSON.parse(JSON.stringify({content:content||{slug,displayTitle:trend?.displayTitle||trend?.keyword,keyword:trend?.keyword,category:trend?.category||'general',hasContent:false,status:status?.status||'pending',image:trend?.thumbnail||null,imageMeta:trend?.imageMeta||null},trend,initialViews:views}))};
}
