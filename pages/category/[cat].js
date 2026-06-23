import Head from 'next/head';
import Link from 'next/link';
import { Fragment } from 'react';
import Header from '../../components/Header';
import MonetizationSlot from '../../components/MonetizationSlot';
import { queryFeedPosts } from '../../lib/kv';
import { CATEGORIES } from '../../lib/categories';

export default function CategoryPage({ posts, catInfo }) {
  const recommendations = posts.slice(0, 3);
  return (
    <>
      <Head><title>{catInfo.label} — STELLATE</title><meta name="description" content={`STELLATE ${catInfo.label} 카테고리의 최신 트렌드 콘텐츠를 확인하세요.`} /></Head>
      <Header />
      <div style={{ maxWidth:680, margin:'0 auto', padding:'16px 16px 40px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}><Link href="/feed" style={{ fontSize:13, color:'#999' }}>← 피드</Link><span style={{ fontSize:18, fontWeight:600, color:catInfo.color }}>{catInfo.label}</span><span style={{ fontSize:13, color:'#999' }}>({posts.length}개)</span></div>
        {posts.length === 0 ? <div style={{ textAlign:'center', padding:60, color:'#999' }}>아직 콘텐츠가 없어요.</div> : <div style={{ background:'#fff', borderRadius:12, border:'1px solid #eee', overflow:'hidden' }}>
          {posts.map((post, i) => <Fragment key={post.slug || i}>
            <Link href={`/feed/${post.slug}`}><div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid #f5f5f5', cursor:'pointer' }}><span style={{ width:7, height:7, borderRadius:'50%', background:catInfo.color, flexShrink:0 }} /><div style={{ flex:1 }}><div style={{ fontSize:14, color:'#1a1a1a', marginBottom:3 }}>{post.feedTitle || post.displayTitle || post.keyword}</div><div style={{ fontSize:12, color:'#999' }}>{new Date(post.generatedAt).toLocaleDateString('ko-KR')}</div></div><span style={{ color:'#ccc' }}>›</span></div></Link>
            {i === 4 && <MonetizationSlot slot={process.env.NEXT_PUBLIC_ADSENSE_FEED_SLOT} label="이 카테고리에서 많이 보는 콘텐츠" items={recommendations} compact />}
          </Fragment>)}
        </div>}
      </div>
    </>
  );
}

export async function getServerSideProps({ params, res }) {
  if (!CATEGORIES[params.cat]) return { notFound: true };
  const { items, total } = await queryFeedPosts({ limit: 200, offset: 0, category: params.cat });
  const catInfo = CATEGORIES[params.cat];
  res.setHeader('Cache-Control', 'private, no-store');
  return { props: { posts: items, total, catInfo: { label: catInfo.label, color: catInfo.color } } };
}
