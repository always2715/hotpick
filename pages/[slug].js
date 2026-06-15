import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';
import { getTrends, getCachedContent } from '../lib/api';
import { CATEGORIES } from '../lib/categories';

const TABS = [
  { key: 'card', label: '📋 카드 요약' },
  { key: 'blog', label: '📝 블로그 글' },
  { key: 'qa',   label: '❓ Q&A' },
];

export default function KeywordPage({ content, related }) {
  const [activeTab, setActiveTab] = useState('card');
  if (!content) return <div style={{ padding:40, textAlign:'center' }}>콘텐츠를 불러올 수 없습니다.</div>;

  const { keyword, categoryLabel, categoryColor, heroBg, titleColor, metaColor, blog, card, qa, image, generatedAt } = content;

  return (
    <>
      <Head>
        <title>{keyword} — HotPick</title>
        <meta name="description" content={card.summary || `${keyword}에 대한 최신 정보`} />
        <meta property="og:title" content={`${keyword} — HotPick`} />
        <meta property="og:description" content={card.summary} />
        {image && <meta property="og:image" content={image} />}
      </Head>
      <Header />

      <div style={{ maxWidth:680, margin:'0 auto', paddingBottom:40 }}>

        {/* 브레드크럼 */}
        <div style={{ fontSize:13, color:'#999', padding:'12px 16px 0', display:'flex', gap:6, alignItems:'center' }}>
          <Link href="/" style={{ color:'#E24B4A' }}>HotPick</Link>
          <span>›</span>
          <span style={{ color:categoryColor }}>{categoryLabel}</span>
          <span>›</span>
          <span>{keyword}</span>
        </div>

        {/* 히어로 */}
        <div style={{
          background: heroBg,
          margin: '12px 16px 0',
          borderRadius: 14,
          padding: '24px 20px 20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {image && (
            <img src={image} alt={keyword} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.15, borderRadius:14 }} />
          )}
          <span style={{ fontSize:11, background:categoryColor, color:'#fff', padding:'3px 10px', borderRadius:20, display:'inline-block', marginBottom:10 }}>
            {categoryLabel}
          </span>
          <h1 style={{ fontSize:22, fontWeight:600, color:titleColor, lineHeight:1.4, marginBottom:10 }}>
            {keyword} 완벽 정리
          </h1>
          <div style={{ fontSize:12, color:metaColor, display:'flex', gap:12, flexWrap:'wrap' }}>
            <span>🕒 {new Date(generatedAt).toLocaleString('ko-KR')}</span>
            <span>⏱ 읽기 3분</span>
          </div>
        </div>

        {/* 핵심 요약 */}
        <div style={{ margin:'12px 16px 0', borderLeft:`3px solid ${categoryColor}`, borderRadius:'0 8px 8px 0', padding:'12px 14px', background:'#f8f8f6' }}>
          <div style={{ fontSize:12, color:categoryColor, fontWeight:600, marginBottom:8 }}>📌 핵심 요약</div>
          <div style={{ fontSize:13, color:'#555', lineHeight:2 }}>· {card.summary}</div>
          <div style={{ fontSize:13, color:'#555', lineHeight:2 }}>· {card.why}</div>
          {(card.points || []).map((p, i) => (
            <div key={i} style={{ fontSize:13, color:'#555', lineHeight:2 }}>· {p}</div>
          ))}
        </div>

        {/* 목차 */}
        <div style={{ margin:'12px 16px 0', background:'#f8f8f6', borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#555', marginBottom:8 }}>📋 목차</div>
          <div style={{ fontSize:13, color:'#378ADD', lineHeight:1.9 }}>1. 왜 지금 화제인가</div>
          <div style={{ fontSize:13, color:'#378ADD', lineHeight:1.9 }}>2. 핵심 정보</div>
          <div style={{ fontSize:13, color:'#378ADD', lineHeight:1.9 }}>3. 알아두면 좋은 팁</div>
        </div>

        {/* 광고 */}
        <div className="ad-slot">광고</div>

        {/* 탭 */}
        <div style={{ display:'flex', borderBottom:'1px solid #eee', margin:'0 16px' }}>
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              flex:1, padding:'10px 0', fontSize:13,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? categoryColor : '#999',
              background:'none', border:'none',
              borderBottom: activeTab === tab.key ? `2px solid ${categoryColor}` : '2px solid transparent',
              cursor:'pointer',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div style={{ padding:'16px 16px 0' }}>

          {/* 카드 요약 */}
          {activeTab === 'card' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <InfoCard title="📌 한줄 요약" body={card.summary} color={categoryColor} />
              <InfoCard title="🔥 왜 지금 뜨는걸까?" body={card.why} color={categoryColor} />
              <div style={{ background:'#f8f8f6', borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>✅ 핵심 포인트</div>
                {(card.points || []).map((p, i) => (
                  <div key={i} style={{ fontSize:14, color:'#444', padding:'4px 0', borderBottom: i < card.points.length-1 ? '1px solid #eee':'none' }}>· {p}</div>
                ))}
              </div>
            </div>
          )}

          {/* 블로그 글 */}
          {activeTab === 'blog' && (
            <>
              {image && (
                <img src={image} alt={keyword} style={{ width:'100%', height:180, objectFit:'cover', borderRadius:10, marginBottom:16 }} />
              )}
              <div style={{ background:'#fff', borderRadius:10, border:'1px solid #eee', padding:'20px 18px' }}>
                <div style={{ fontSize:15, lineHeight:1.9, color:'#333', whiteSpace:'pre-wrap' }}>
                  {blog}
                </div>
              </div>
            </>
          )}

          {/* Q&A */}
          {activeTab === 'qa' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {(qa || []).map((item, i) => (
                <div key={i} style={{ background:'#f8f8f6', borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'#1a1a1a', marginBottom:6 }}>Q. {item.q}</div>
                  <div style={{ fontSize:14, color:'#555', lineHeight:1.7 }}>A. {item.a}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 공유 */}
        <div style={{ display:'flex', gap:8, margin:'20px 16px 0' }}>
          {['🔗 링크 복사','💬 카카오 공유','🔖 저장'].map((label) => (
            <button key={label} style={{ flex:1, padding:'10px 0', fontSize:13, color:'#666', background:'#fff', border:'1px solid #eee', borderRadius:8, cursor:'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {/* 해시태그 */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'12px 16px', borderTop:'1px solid #f0f0f0', marginTop:12 }}>
          {[`#${keyword.replace(/ /g,'')}`, `#${categoryLabel}`, '#실시간트렌드', '#핫픽'].map((tag) => (
            <span key={tag} style={{ fontSize:12, color:'#666', background:'#f5f5f5', padding:'4px 10px', borderRadius:20, border:'1px solid #eee' }}>
              {tag}
            </span>
          ))}
        </div>

        <div className="ad-slot">광고</div>

        {/* 관련 트렌드 */}
        {related.length > 0 && (
          <div style={{ padding:'0 16px' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#666', marginBottom:10 }}>지금 뜨는 다른 키워드</div>
            {related.map((item) => {
              const cat = CATEGORIES[item.category];
              return (
                <Link key={item.slug} href={`/${item.slug}`}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#fff', borderRadius:8, border:'1px solid #f0f0f0', marginBottom:6, cursor:'pointer' }}>
                    <span style={{ fontSize:13, color:'#E24B4A', fontWeight:600, width:24 }}>{item.rank}위</span>
                    <span style={{ width:7, height:7, borderRadius:'50%', background:cat?.color||'#ccc', flexShrink:0 }} />
                    <span style={{ flex:1, fontSize:14 }}>{item.keyword}</span>
                    <span style={{ color:'#ccc' }}>›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function InfoCard({ title, body, color }) {
  return (
    <div style={{ background:'#f8f8f6', borderRadius:10, padding:'14px 16px' }}>
      <div style={{ fontSize:14, fontWeight:600, marginBottom:6, color }}>{title}</div>
      <div style={{ fontSize:14, color:'#444', lineHeight:1.7 }}>{body}</div>
    </div>
  );
}

export async function getStaticPaths() {
  const trends = await getTrends();
  return {
    paths: trends.map((t) => ({ params: { slug: t.slug } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const trends = await getTrends();
  const trend = trends.find((t) => t.slug === params.slug);
  if (!trend) return { notFound: true };
  const content = await getCachedContent(trend.keyword);
  const related = trends.filter((t) => t.slug !== params.slug).slice(0, 5);
  return {
    props: { content, related },
    revalidate: 60 * 60 * 3,
  };
}
