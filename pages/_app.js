import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import '../styles/globals.css';
import SiteFooter from '../components/SiteFooter';

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const NAVER_WCS_ID = process.env.NEXT_PUBLIC_NAVER_WCS_ID;
const ADS_ENABLED = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === 'true';
const ADS_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

function isTrackablePath(pathname = '') {
  return !pathname.startsWith('/admin') && pathname !== '/admin-login' && pathname !== '/404' && pathname !== '/500';
}

function Analytics({ router }) {
  const [productionDomain, setProductionDomain] = useState(false);
  const naverReady = useRef(false);

  useEffect(() => {
    setProductionDomain(window.location.hostname === 'stellate.co.kr' || window.location.hostname === 'www.stellate.co.kr');
  }, []);

  useEffect(() => {
    if (!productionDomain) return undefined;
    const track = url => {
      const pathname = String(url || router.asPath || '').split('?')[0];
      if (!isTrackablePath(pathname)) return;
      if (GA_ID && typeof window.gtag === 'function') {
        window.gtag('config', GA_ID, { page_path: url || router.asPath });
      }
      if (NAVER_WCS_ID && naverReady.current && typeof window.wcs_do === 'function') {
        window.wcs_add = window.wcs_add || {};
        window.wcs_add.wa = NAVER_WCS_ID;
        window.wcs_do();
      }
    };
    router.events.on('routeChangeComplete', track);
    return () => router.events.off('routeChangeComplete', track);
  }, [productionDomain, router]);

  if (!productionDomain) return null;
  const excluded = !isTrackablePath(router.pathname);
  if (excluded) return null;

  return <>
    {GA_ID && <>
      <Script strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
      <Script id="stellate-ga" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', '${GA_ID}', { send_page_view: true });
      ` }} />
    </>}
    {NAVER_WCS_ID && <Script
      id="stellate-naver-wcs"
      src="https://wcs.naver.net/wcslog.js"
      strategy="afterInteractive"
      onLoad={() => {
        naverReady.current = true;
        window.wcs_add = window.wcs_add || {};
        window.wcs_add.wa = NAVER_WCS_ID;
        if (typeof window.wcs_do === 'function') window.wcs_do();
      }}
    />}
  </>;
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const excludedPath = !isTrackablePath(router.pathname);
  const pageCanShowAds = !excludedPath && (pageProps?.content?.hasContent ?? pageProps?.content?.hasNews) !== false;
  return <>
    <Analytics router={router} />
    {ADS_ENABLED && ADS_CLIENT && pageCanShowAds && <Script id="stellate-adsense" async strategy="afterInteractive" crossOrigin="anonymous" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_CLIENT}`} />}
    <Component {...pageProps} />
    {!excludedPath && <SiteFooter />}
  </>;
}
