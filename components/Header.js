import Link from 'next/link';

export default function Header() {
  return (
    <header style={{
      borderBottom: '1px solid #eee',
      background: '#fff',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
        <Link href="/">
          <span style={{ fontSize: 20, fontWeight: 600 }}>
            Hot<span style={{ color: '#E24B4A' }}>Pick</span>
          </span>
        </Link>
        <span style={{ fontSize: 12, color: '#E24B4A', background: '#FCEBEB', padding: '3px 10px', borderRadius: 20 }}>
          🔥 실시간 트렌드
        </span>
      </div>
    </header>
  );
}
