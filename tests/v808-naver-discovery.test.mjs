import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NAVER_CLIENT_ID='test-client';
process.env.NAVER_CLIENT_SECRET='test-secret';

const attempts=new Map();
const now=new Date().toUTCString();
const queryNames=[];
globalThis.fetch=async url=>{
  const parsed=new URL(url);
  const query=decodeURIComponent(parsed.searchParams.get('query')||'');
  queryNames.push(query);
  const count=(attempts.get(query)||0)+1;
  attempts.set(query,count);
  if(query==='경제'&&count===1){
    return new Response(JSON.stringify({errorCode:'024',errorMessage:'rate limit'}),{status:429,headers:{'content-type':'application/json','x-rate-limit-remaining':'0'}});
  }
  return new Response(JSON.stringify({
    lastBuildDate:now,
    total:1,
    start:1,
    display:1,
    items:[{
      title:`${query} 분야 주요 변화와 새로운 발표`,
      originallink:`https://news.example.com/${encodeURIComponent(query)}`,
      link:`https://n.news.naver.com/${encodeURIComponent(query)}`,
      pubDate:now,
    }],
  }),{status:200,headers:{'content-type':'application/json','x-rate-limit-remaining':'9'}});
};

const {fetchNaverNewsDiscovery,buildBalancedDiscoveryPool}=await import(`../lib/trends.js?v808=${Date.now()}`);
const rows=await fetchNaverNewsDiscovery();
const diagnostics=rows.diagnostics;
assert.equal(diagnostics.requestedFeeds,8);
assert.equal(diagnostics.successfulFeeds,8);
assert.equal(diagnostics.failedFeeds,0);
assert.equal(diagnostics.rawItems,8);
assert.equal(diagnostics.recentItems,8);
assert.equal(diagnostics.keywordItems,8);
assert.equal(diagnostics.dedupedCandidates,8);
assert.equal(rows.length,8);
assert.equal(attempts.get('경제'),2,'429 응답은 재시도해야 합니다.');
assert.ok(rows.every(row=>row.discoverySource==='naver_news'));
assert.ok(rows.every(row=>row.relatedNews?.[0]?.source==='news.example.com'));

const balanced=buildBalancedDiscoveryPool(
  Array.from({length:31},(_,index)=>({keyword:`trend-${index}`})),
  Array.from({length:86},(_,index)=>({keyword:`google-${index}`,discoverySource:'google_news'})),
  Array.from({length:80},(_,index)=>({keyword:`naver-${index}`,discoverySource:'naver_news'})),
  [],
  90,
);
assert.equal(balanced.length,90);
assert.equal(balanced.filter(row=>row.discoverySource==='naver_news').length,30,'네이버 후보가 Google 뉴스 뒤에서 잘리지 않아야 합니다.');
assert.equal(balanced.filter(row=>row.discoverySource==='google_news').length,30);
assert.equal(balanced.filter(row=>!row.discoverySource).length,30);

const trendsSource=fs.readFileSync(new URL('../lib/trends.js',import.meta.url),'utf8');
const adminSource=fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
const versionSource=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(trendsSource,/display=100&start=1&sort=date/);
assert.match(trendsSource,/naverDiscovery:naverDiscoveryDiagnostics/);
assert.match(trendsSource,/buildBalancedDiscoveryPool/);
assert.match(trendsSource,/naver_http_/);
assert.match(trendsSource,/naver_timeout/);
assert.match(adminSource,/네이버 요청/);
assert.match(adminSource,/36시간 통과/);
assert.match(adminSource,/중복 제거 후/);
assert.match(adminSource,/병합 투입 네이버 뉴스/);
assert.match(versionSource,/contentVersion:130/);
assert.match(versionSource,/trendCacheVersion:50/);
assert.match(versionSource,/fixed-keyword-content-stop-control-v8025/);
console.log('v8.0.8 Naver discovery retry and diagnostics tests passed');
