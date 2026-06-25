import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildThumbnailPoolSeeds, THUMBNAIL_POOL_TARGET_SIZE, THUMBNAIL_POOL_CATEGORIES, THUMBNAIL_POOL_VERSION } from '../lib/thumbnailPoolCatalog.js';
import { guaranteeFeedPage } from '../lib/feedPresentation.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const seeds=buildThumbnailPoolSeeds();
assert.equal(THUMBNAIL_POOL_VERSION,'v2-500-curated');
assert.equal(THUMBNAIL_POOL_TARGET_SIZE,500);
assert.equal(seeds.length,500);
assert.equal(Object.keys(THUMBNAIL_POOL_CATEGORIES).length,10);
for(const category of Object.keys(THUMBNAIL_POOL_CATEGORIES)){
  assert.equal(seeds.filter(item=>item.category===category).length,50,`${category} must have 50 curated slots`);
  assert.ok(seeds.some(item=>item.id===`${category}_001`));
  assert.ok(seeds.some(item=>item.id===`${category}_050`));
}
assert.equal(new Set(seeds.map(item=>item.id)).size,500,'all thumbnail slot ids must be unique');

const trends=Array.from({length:7},(_,index)=>({
  slug:`top-${index+1}`,rank:index+1,keyword:`키워드 ${index+1}`,displayTitle:`키워드 ${index+1} · 확인된 사건`,
  previewSummary:`키워드 ${index+1} 관련 상세 콘텐츠에서 확인된 핵심 사실을 정리한 충분한 길이의 요약입니다.`,
  category:'general',updatedAt:`2026-06-24T${String(12-index).padStart(2,'0')}:00:00.000Z`,
}));
const recovered=guaranteeFeedPage({items:[],total:25,trends,limit:20,offset:0,category:'all',scope:'all',sort:'latest',search:''});
assert.equal(recovered.items.length,7,'total count without rows must still render current TOP rows');
assert.equal(recovered.total,7,'emergency fallback total must match actual rendered rows');
assert.equal(recovered.emergency,true);
assert.ok(recovered.items.every(item=>item.status==='published'&&item.feedReady===true));

const feedPage=fs.readFileSync(path.join(root,'pages/feed.js'),'utf8');
const feedApi=fs.readFileSync(path.join(root,'pages/api/feed.js'),'utf8');
const kv=fs.readFileSync(path.join(root,'lib/kv.js'),'utf8');
const version=fs.readFileSync(path.join(root,'pages/api/version.js'),'utf8');
const topConfig=fs.readFileSync(path.join(root,'lib/topConfig.js'),'utf8');
assert.match(feedPage,/guaranteeFeedPage/);
assert.match(feedApi,/FEED_PAGE_EMERGENCY_TOP_FALLBACK/);
assert.match(kv,/현재 TOP은 공개 원본 그 자체를 최종 기준으로 항상 병합합니다/);
assert.match(version,/thumbnailPoolSize:500/);
assert.match(version,/deploymentIntegrityV8043/);
assert.match(topConfig,/PUBLIC_TOP_COUNT = 20/);

console.log('STELLATE v8.0.48 feed visibility, 500 thumbnail pool, and runtime sync tests: PASS');
