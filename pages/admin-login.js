import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import { adminAuthConfigured, isAdminRequest } from '../lib/adminAuth';

export default function AdminLogin({ configured }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(event) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '로그인 실패');
      router.replace('/admin');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  return <>
    <Head><title>관리자 로그인 — STELLATE</title></Head><Header />
    <main className="page-shell admin-login-shell">
      <form className="admin-login-card" onSubmit={login}>
        <p className="eyebrow">STELLATE ADMIN</p><h1>관리자 로그인</h1>
        <p>운영 기능은 인증된 관리자만 사용할 수 있습니다.</p>
        {!configured && <div className="status-error">Vercel 환경변수에 ADMIN_PASSWORD와 SESSION_SECRET을 설정해 주세요.</div>}
        <label>관리자 비밀번호<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" disabled={!configured} /></label>
        <button type="submit" disabled={busy || !configured}>{busy ? '확인 중…' : '로그인'}</button>
        {message && <div className="status-error">{message}</div>}
      </form>
    </main>
  </>;
}

export async function getServerSideProps({ req }) {
  if (isAdminRequest(req)) return { redirect: { destination: '/admin', permanent: false } };
  return { props: { configured: adminAuthConfigured() } };
}
