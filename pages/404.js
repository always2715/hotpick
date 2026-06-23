import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';
export default function NotFound(){return <><Head><title>페이지를 찾을 수 없습니다 — STELLATE</title></Head><Header/><main className="page-shell"><section className="status-card not-found-card"><div className="status-spinner">✦</div><p className="eyebrow">404 NOT FOUND</p><h1>콘텐츠가 종료됐거나<br/>주소가 변경됐습니다</h1><p>지금 뜨는 새로운 이슈와 누적 피드에서 다른 이야기를 확인해보세요.</p><div className="not-found-actions"><Link className="primary-link" href="/">검증된 주요 이슈</Link><Link className="secondary-link" href="/feed">피드 보기</Link></div></section></main></>}
