import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';
import { getTrends } from '../lib/api';
import { CATEGORIES } from '../lib/categories';

const BADGE_STYLE = {
  HOT: { background: '#FCEBEB', color: '#A32D2D', label: '🔥 HOT' },
  NEW: { background: '#E6F1FB', color: '#185FA5', label: 'NEW' },
  UP:  { background: '#EAF3DE', color: '#3B6D11', label: '↑ 급상승' },
};

export default function Home({ trends, updatedAt }) {
  const nextUpdate = new Date(new Date(updatedAt).getTime() + 3 * 60 * 60 * 1000);

  return (
    <>
      <Head>
        <title>HotPick — 실시간 트렌드 키워드 TOP 30</title>
        <meta name="description" content="지금 가장 많이 검색되는 키워드 TOP 30을 AI가 분석해드립니다." />
        <meta property="og:title" content="HotPick — 실시간 트렌드 TOP 30" />
        <meta property="og:description" content="지금 뜨는 키워드를 AI가 분석해드립니다." />
      </Head>
      <Header />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px' }}>
        {/* 업데이트 바 */}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#999', padding:'8px 0', borderBottom:'1px solid #f0f0f0', marginBottom:4 }}>
          <span>🕒 갱신: {new Date(updatedAt).toLocaleString('ko-KR')}</span>
          <span>다음 갱신: {nextUpdate.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}</span>
        </div>

        {/* 광고 */}
        <div className="ad-slot">광고</div>

        {/* 카테고리 범례 */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'10px 0', borderBottom:'1px solid #f0f0f0', marginBottom:12 }}>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <span key={key} style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'#666' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:cat.color, display:'inline-block' }} />
              {cat.label}
            </span>
          ))}
        </div>

        <div style={{ fontSize:13, fontWeight:600, color:'#666', marginBottom:12 }}>
          지금 뜨는 키워드 TOP {trends.length}
        </div>

        {/* 트렌드 목록 */}
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #eee', overflow:'hidden' }}>
          {trends.map((item, i) => {
            const cat = CATEGORIES[item.category];
            return (
              <Link key={item.slug} href={`/${item.slug}`}>
                <div style={{
                  display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                  borderBottom: i < trends.length - 1 ? '1px solid #f5f5f5' : 'none',
                  cursor:'pointer',
                }}>
                  <span style={{ fontSize:14, fontWeight:600, color: i < 3 ? '#E24B4A' : '#bbb', width:24, textAlign:'right', flexShrink:0 }}>
                    {item.rank}
                  </span>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:cat?.color || '#ccc', flexShrink:0 }} />
                  <span style={{ flex:1, fontSize:15, color:'#1a1a1a' }}>{item.keyword}</span>
                  {item.badge && BADGE_STYLE[item.badge] && (
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:BADGE_STYLE[item.badge].background, color:BADGE_STYLE[item.badge].color, flexShrink:0 }}>
                      {BADGE_STYLE[item.badge].label}
                    </span>
                  )}
                  <span style={{ color:'#ccc', fontSize:14 }}>›</span>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="ad-slot">광고</div>
      </div>
    </>
  );
}

export async function getStaticProps() {
  const trends = await getTrends();
  return {
    props: { trends, updatedAt: new Date().toISOString() },
    revalidate: 60 * 60 * 3,
  };
}
