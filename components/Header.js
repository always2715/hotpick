import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Header() {
  const router = useRouter();
  const isFeed = router.pathname === '/feed';

  return (
    <header style={{
      borderBottom: '1px solid #eee',
      background: '#fff',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ maxWidth:680, margin:'0 auto', padding:'12px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <Link href="/">
            <span style={{ fontSize:20, fontWeight:700, letterSpacing:2, cursor:'pointer', color:'#1a1a1a' }}>
              STELL<span style={{ color:'#E24B4A' }}>ATE</span>
            </span>
          </Link>
          <span style={{ fontSize:12, color:'#E24B4A', background:'#FCEBEB', padding:'3px 10px', borderRadius:20 }}>
            🔥 실시간
          </span>
        </div>
        <div style={{ display:'flex', gap:0, borderBottom:'2px solid #f0f0f0', marginBottom:-1 }}>
          <Link href="/">
            <div style={{
              padding:'8px 20px', fontSize:14,
              fontWeight: !isFeed ? 600 : 400,
              color: !isFeed ? '#E24B4A' : '#999',
              borderBottom: !isFeed ? '2px solid #E24B4A' : '2px solid transparent',
              cursor:'pointer', marginBottom:-2,
            }}>
              TOP20
            </div>
          </Link>
          <Link href="/feed">
            <div style={{
              padding:'8px 20px', fontSize:14,
              fontWeight: isFeed ? 600 : 400,
              color: isFeed ? '#E24B4A' : '#999',
              borderBottom: isFeed ? '2px solid #E24B4A' : '2px solid transparent',
              cursor:'pointer', marginBottom:-2,
            }}>
              📋 피드
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
