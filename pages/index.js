import Head from 'next/head';
import Link from 'next/link';
import { Fragment } from 'react';
import Header from '../components/Header';
import MonetizationSlot from '../components/MonetizationSlot';
import { CATEGORIES } from '../lib/categories';
import { getCachedTrends, getTrendsUpdatedAt } from '../lib/kv';
import { optimizeImageUrl, isUnsplashImageUrl } from '../lib/images';
import { PUBLIC_TOP_COUNT } from '../lib/topConfig';

const CAT_BG = {
  entertainment:'linear-gradient(135deg,#EEEDFE,#AFA9EC)', sports:'linear-gradient(135deg,#E1F5EE,#5DCAA5)',
  tech:'linear-gradient(135deg,#E6F1FB,#85B7EB)', ai:'linear-gradient(135deg,#F0EDFF,#B8AEFF)',
  economy:'linear-gradient(135deg,#FAEEDA,#EF9F27)', travel:'linear-gradient(135deg,#FBEAF0,#ED93B1)',
  life:'linear-gradient(135deg,#EAF3DE,#97C459)', politics:'linear-gradient(135deg,#FDECEA,#EC8F87)', general:'linear-gradient(135deg,#F1EFE8,#B4B2A9)',
};


function feedHeadline(item={}) {
  const keyword=String(item.topKeyword||item.keyword||'').trim();
  let title=String(item.feedHeadline||item.feedTitle||item.topTopic||item.displayTitle||'').replace(/\s+/g,' ').trim();
  if(keyword){
    const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    title=title.replace(new RegExp(`^${escaped}\\s*[·*＊|｜:,-]?\\s*`,'i'),'').trim();
  }
  return title||item.topTopic||'관련 관심 증가';
}

function RankChange({ item }) {
  if (item.previousRank == null) return <span className="rank-change new">NEW</span>;
  const change = Number(item.rankChange ?? item.previousRank - item.rank);
  if (change > 0) return <span className="rank-change up">▲ {change}</span>;
  if (change < 0) return <span className="rank-change down">▼ {Math.abs(change)}</span>;
  return <span className="rank-change same">―</span>;
}

export default function Home({ trends, updatedAt }) {
  const recommendations = trends.slice(0, 3);
  return (
    <>
      <Head>
        <title>STELLATE — 검증된 주요 이슈</title>
        <meta name="description" content="검색 상승과 최신 보도, 사건 일관성, 독립 출처를 확인한 주요 이슈만 보여드립니다." />
      </Head>
      <Header />
      <main className="page-shell">
        <section className="top-intro">
          <div><p className="eyebrow">VERIFIED DISCOVERY</p><h1>지금 확인된<br />주요 이슈</h1><p>검색 상승, 최신 보도, 사건 일관성, 독립 출처를 함께 확인합니다.</p>{trends.length>0&&<div className="trend-count-note">TOP {trends.length}/{PUBLIC_TOP_COUNT} · 검증 완료</div>}</div>
          <div className="update-pill">{updatedAt ? `갱신 ${new Date(updatedAt).toLocaleString('ko-KR')}` : '데이터 준비 중'}</div>
        </section>

        {trends.length === 0 ? (
          <section className="empty-card"><div className="empty-icon">✨</div><h2>검증된 이슈를 준비하고 있어요</h2><p>관리자 페이지에서 TOP 미리 계산 결과를 확인한 뒤 실제 적용을 실행해 주세요.</p><Link href="/admin" className="primary-link">관리자 페이지로 이동</Link></section>
        ) : (
          <section className="ranking-list" aria-label="검증된 주요 이슈">
            {trends.map((item, index) => {
              const cat = CATEGORIES[item.category] || CATEGORIES.general;
              const keyword = item.topKeyword || item.keyword || item.displayTitle;
              const topic = feedHeadline(item);
              const title = item.feedTitle || item.topTitle || item.displayTitle || item.keyword;
              const showSlot = index === 4 || index === 14;
              return <Fragment key={item.slug}>
                <Link href={`/${item.slug}`} className="ranking-row" onClick={() => {
                  if (typeof navigator !== 'undefined') navigator.sendBeacon?.('/api/event', new Blob([JSON.stringify({ type:'top_click', slug:item.slug })], { type:'application/json' }));
                }}>
                  <div className={`rank-number ${index < 3 ? 'top3' : ''}`}><strong>{item.rank}</strong><RankChange item={item} /></div>
                  <div className="rank-thumb">{isUnsplashImageUrl(item.thumbnail) ? <><img src={optimizeImageUrl(item.thumbnail, 180, 72)} alt="" loading="lazy" />{item.imageMeta?.photographerName && <span className="thumb-credit" title={`Photo by ${item.imageMeta.photographerName} on Unsplash`}>U · {item.imageMeta.photographerName}</span>}</> : <span className="thumb-fallback" style={{ background:CAT_BG[item.category] || CAT_BG.general }}><><small>{cat.label}</small><strong>STELLATE</strong></></span>}</div>
                  <div className="rank-copy"><div className="rank-title-row"><h2>{topic ? <><strong className="top-keyword">{keyword}</strong><span className="top-separator">·</span><span className="top-topic">{topic}</span></> : title}</h2>{item.badge === 'HOT' && <em className="hot-badge">HOT</em>}</div>{(item.previewSummary||item.listSummary)&&<p className="rank-summary">{item.previewSummary||item.listSummary}</p>}<div className="rank-meta"><span style={{ color:cat.color }}>{cat.label}</span><span>검증 출처 {item.independentSources||0}개</span></div></div>
                  <span className="chevron">›</span>
                </Link>
                {showSlot && <MonetizationSlot slot={process.env.NEXT_PUBLIC_ADSENSE_HOME_SLOT} label={index === 4 ? '지금 많이 보는 콘텐츠' : '카테고리별 인기 콘텐츠'} items={recommendations} compact />}
              </Fragment>;
            })}
          </section>
        )}
        {trends.length > 0 && <MonetizationSlot slot={process.env.NEXT_PUBLIC_ADSENSE_HOME_SLOT} label="STELLATE에서 더 보기" items={recommendations} className="final-ad-slot" />}
      </main>
    </>
  );
}

export async function getServerSideProps({ res }) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const [trends, updatedAt] = await Promise.all([getCachedTrends(), getTrendsUpdatedAt()]);
    return { props: JSON.parse(JSON.stringify({ trends: Array.isArray(trends) ? trends.slice(0, PUBLIC_TOP_COUNT) : [], updatedAt: updatedAt || null })) };
  } catch (error) {
    console.error('Homepage data load failed:', error);
    return { props: { trends: [], updatedAt: null } };
  }
}
