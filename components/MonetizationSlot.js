import { useEffect, useRef, useState } from 'react';

const ADS_ENABLED = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === 'true';
const ADS_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '';

export default function MonetizationSlot({ slot, label = 'STELLATE 추천', items = [], compact = false, className = '' }) {
  const adRef = useRef(null);
  const [filled, setFilled] = useState(false);
  const canRequestAd = ADS_ENABLED && ADS_CLIENT && slot;

  useEffect(() => {
    if (!canRequestAd || !adRef.current) return undefined;
    const node = adRef.current;
    const update = () => setFilled(node.getAttribute('data-ad-status') === 'filled');
    const observer = new MutationObserver(update);
    observer.observe(node, { attributes: true, attributeFilter: ['data-ad-status'] });
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
    update();
    return () => observer.disconnect();
  }, [canRequestAd, slot]);

  return (
    <section className={`monetization-slot ${compact ? 'compact' : ''} ${className}`.trim()}>
      <div className={`slot-fallback ${canRequestAd ? 'is-overlay' : ''} ${filled ? 'is-hidden' : ''}`.trim()}><InternalRecommendation label={label} items={items} compact={compact} /></div>
      {canRequestAd && (
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={{ display: 'block', opacity: filled ? 1 : 0, pointerEvents: filled ? 'auto' : 'none' }}
          data-ad-client={ADS_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </section>
  );
}

function InternalRecommendation({ label, items, compact }) {
  const rows = (Array.isArray(items) ? items : []).filter(Boolean).slice(0, compact ? 2 : 3);
  return (
    <div className="internal-recommendation">
      <span className="internal-label">{label}</span>
      {rows.length > 0 ? (
        <div className="internal-links">
          {rows.map(item => <a key={item.slug} href={`/${item.slug}`}><strong>{item.displayTitle || item.feedTitle || item.keyword}</strong><span>자세히 보기 →</span></a>)}
        </div>
      ) : (
        <a className="internal-cta" href="/feed"><strong>오늘 놓치기 쉬운 주요 이슈</strong><span>누적 피드에서 확인하기 →</span></a>
      )}
    </div>
  );
}
