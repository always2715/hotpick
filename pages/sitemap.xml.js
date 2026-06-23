import { getCachedTrends, getContentsBatch } from '../lib/kv';

const DOMAIN = 'https://stellate.co.kr';

function generateSiteMap(trends) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${DOMAIN}</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>
  <url><loc>${DOMAIN}/feed</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>
  ${trends.map(({ slug }) => `<url><loc>${DOMAIN}/${slug}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n  <url><loc>${DOMAIN}/feed/${slug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`).join('\n  ')}
</urlset>`;
}

export default function SiteMap() {}

export async function getServerSideProps({ res }) {
  const trends = await getCachedTrends();
  const contents = await getContentsBatch(trends.map(item=>item.slug), { includePrivate:false });
  const valid = trends.filter(item => (contents[item.slug]?.hasContent ?? contents[item.slug]?.hasNews));
  const sitemap = generateSiteMap(valid);
  res.setHeader('Content-Type', 'text/xml');
  res.write(sitemap);
  res.end();
  return { props: {} };
}
