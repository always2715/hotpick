import Head from 'next/head';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import MonetizationSlot from '../components/MonetizationSlot';
import { CATEGORIES } from '../lib/categories';
import { getCachedTrends, queryFeedPosts } from '../lib/kv';
import { optimizeImageUrl, isUnsplashImageUrl } from '../lib/images';

const PER_PAGE = 20;

export default function Feed({ initialPosts, initialTotal, initialTopMap, recommendations }) {
  const [category, setCategory] = useState('all');
  const [scope, setScope] = useState('all');
  const [sort, setSort] = useState('latest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState(initialPosts);
  const [total, setTotal] = useState(initialTotal);
  const [topMap, setTopMap] = useState(initialTopMap);
  const [loading, setLoading] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PER_PAGE), category, scope, sort });
        if (search.trim()) params.set('search', search.trim());
        const response = await fetch(`/api/feed?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '피드 조회 실패');
        setPosts(data.items || []);
        setTotal(Number(data.total || 0));
        setTopMap(data.topMap || {});
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      } finally { setLoading(false); }
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, scope, sort, search, page]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const changeFilter = setter => event => { setter(event.target.value); setPage(1); };

  return (
    <>
      <Head><title>누적 피드 — STELLATE</title><meta name="description" content="지금 뜨는 이야기와 지난 이슈를 누적으로 확인하세요." /></Head>
      <Header />
      <main className="page-shell">
        <section className="feed-head">
          <p className="eyebrow">STELLATE FEED</p>
          <h1>지금부터 지난 이야기까지</h1>
          <p>TOP에서 내려간 콘텐츠도 사라지지 않고 계속 쌓입니다.</p>
        </section>

        <section className="feed-toolbar compact-toolbar">
          <div className="feed-search-box">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={changeFilter(setSearch)} placeholder="제목이나 키워드 검색" />
            {search && <button type="button" aria-label="검색어 지우기" onClick={() => { setSearch(''); setPage(1); }}>×</button>}
          </div>
          <div className="filter-row compact-filter-row">
            <select aria-label="카테고리" value={category} onChange={changeFilter(setCategory)}>
              <option value="all">전체 카테고리</option>
              {Object.entries(CATEGORIES).map(([key, cat]) => <option key={key} value={key}>{cat.label}</option>)}
            </select>
            <select aria-label="피드 범위" value={scope} onChange={changeFilter(setScope)}>
              <option value="all">전체 피드</option><option value="top">현재 검증 TOP</option><option value="past">지난 피드</option>
            </select>
            <select aria-label="정렬" value={sort} onChange={changeFilter(setSort)}>
              <option value="latest">최신순</option><option value="oldest">오래된순</option><option value="sequence">게시글번호순</option><option value="views">조회수순</option>
            </select>
          </div>
        </section>

        <div className="feed-result-count">총 {total.toLocaleString()}개 · {sort === 'latest' ? '최신순' : sort === 'oldest' ? '오래된순' : sort === 'sequence' ? '게시글번호순' : '조회수순'} {loading && <span>불러오는 중…</span>}</div>

        {posts.length === 0 ? (
          <section className="empty-card"><div className="empty-icon">🗂️</div><h2>조건에 맞는 피드가 없어요</h2><p>검색어나 필터를 바꿔보세요.</p></section>
        ) : (
          <section className={`feed-list ${loading ? 'is-loading' : ''}`}>
            {posts.map((post, index) => {
              const top = topMap[post.slug];
              const cat = CATEGORIES[post.category] || CATEGORIES.general;
              const showSlot = index === 4 || index === 14;
              return <Fragment key={post.slug}>
                <Link href={`/feed/${post.slug}`} className="feed-row">
                  <div className="feed-seq"><strong>#{post.feedSeq || '-'}</strong>{top ? <><span className="top-feed-badge">TOP {top.rank}</span></> : <span>FEED</span>}</div>
                  <div className="feed-thumb">{isUnsplashImageUrl(post.thumbnail || post.image) ? <><img src={optimizeImageUrl(post.thumbnail || post.image, 180, 72)} alt="" loading="lazy" />{post.imageMeta?.photographerName && <span className="thumb-credit" title={`Photo by ${post.imageMeta.photographerName} on Unsplash`}>U · {post.imageMeta.photographerName}</span>}</> : <span className="thumb-fallback">{cat.emoji || '🔥'}</span>}</div>
                  <div className="feed-copy">
                    <div className="feed-labels"><span style={{ color: cat.color }}>{cat.label}</span><span>{new Date(post.updatedAt || post.generatedAt).toLocaleDateString('ko-KR')} · 조회 {Number(post.viewCount || 0).toLocaleString()}</span></div>
                    <h2>{post.feedTitle || post.displayTitle || post.keyword}</h2>
                    <p className="feed-excerpt">{post.previewSummary || post.summary || post.why}</p>
                    <div className="feed-trust"><span>검증 출처 {Number(post.verifiedEvidenceCount || post.trustSummary?.evidenceSources || post.sourceItems?.length || 0)}개</span>{Number(post.verifiedFactCount||0)>0&&<span>확인 사실 {Number(post.verifiedFactCount)}개</span>}</div>
                  </div>
                </Link>
                {showSlot && <MonetizationSlot slot={process.env.NEXT_PUBLIC_ADSENSE_FEED_SLOT} label={index === 4 ? '놓치면 아쉬운 최신 콘텐츠' : 'STELLATE 추천'} items={recommendations} compact />}
              </Fragment>;
            })}
          </section>
        )}

        {posts.length > 0 && page >= pages && <MonetizationSlot slot={process.env.NEXT_PUBLIC_ADSENSE_FEED_SLOT} label="오늘의 이야기를 모두 확인했어요" items={recommendations} className="final-ad-slot" />}

        {pages > 1 && <nav className="pagination">
          <button disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>이전</button><span>{page} / {pages}</span><button disabled={page >= pages || loading} onClick={() => setPage(p => Math.min(pages, p + 1))}>다음</button>
        </nav>}
      </main>
    </>
  );
}

export async function getServerSideProps({ res }) {
  const trends = await getCachedTrends();
  const topSlugs = trends.map(item => item.slug);
  const { items, total } = await queryFeedPosts({ limit: PER_PAGE, offset: 0, topSlugs });
  const topMap = {};
  trends.forEach(item => { topMap[item.slug] = { rank: item.rank, displayTitle: item.displayTitle || item.keyword, independentSources:item.independentSources }; });
  res.setHeader('Cache-Control', 'private, no-store');
  return { props: JSON.parse(JSON.stringify({ initialPosts: items || [], initialTotal: total || 0, initialTopMap: topMap, recommendations: trends.slice(0, 3) })) };
}
