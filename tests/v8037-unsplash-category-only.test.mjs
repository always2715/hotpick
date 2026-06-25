import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCategoryImageSpec, isUnsplashImageUrl, isUnsplashImageMeta, CATEGORY_UNSPLASH_SPECS } from '../lib/images.js';

for (const category of ['entertainment','sports','tech','ai','economy','travel','life','politics','general']) {
  const spec=buildCategoryImageSpec(category,'김정은 HBM4 특정 키워드');
  assert.ok(CATEGORY_UNSPLASH_SPECS[category].some(row=>row.query===spec.query));
  assert.doesNotMatch(spec.query,/김정은|HBM4/i,'검색어에는 개별 키워드가 들어가면 안 됩니다.');
  assert.equal(spec.source,'category');
}
assert.equal(isUnsplashImageUrl('https://images.unsplash.com/photo-123?x=1'),true);
assert.equal(isUnsplashImageUrl('https://i.ytimg.com/vi/abc/hqdefault.jpg'),false);
assert.equal(isUnsplashImageUrl('https://news.example.com/cover.jpg'),false);
assert.equal(isUnsplashImageMeta({source:'unsplash',imageUrl:'https://images.unsplash.com/photo-1'}),true);
assert.equal(isUnsplashImageMeta({source:'youtube',imageUrl:'https://i.ytimg.com/vi/a/hqdefault.jpg'}),false);

const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(api,/const IMAGE_SELECTOR_VERSION = 'v7-curated-pool-500'/);
assert.match(api,/selectCuratedThumbnailForContent/);
assert.match(api,/콘텐츠별 실시간 검색을 하지 않고 Redis의 사전 풀 안에서만 선택합니다/);
assert.doesNotMatch(api,/preferredImageMeta\|\|videoImageMeta\|\|sourceImageMeta/);
assert.doesNotMatch(api,/function selectRelevantVideoImage/);
assert.doesNotMatch(api,/function selectRelevantSourceImage/);
assert.doesNotMatch(api,/function createBatchVisualQueries/);
assert.match(api,/const imageMeta=await resolveCoverImage/);

const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(refresh,/isUnsplashImageMeta\(content\.imageMeta\)/);
assert.doesNotMatch(refresh,/videoThumb/);
assert.doesNotMatch(refresh,/source:'youtube',imageUrl:videoThumb/);

const detail=fs.readFileSync(new URL('../pages/feed/[slug].js',import.meta.url),'utf8');
assert.doesNotMatch(detail,/<img src=\{video\.thumbnail\}/);
assert.match(detail,/youtube-thumb-safe/);

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/contentVersion:139/);
assert.match(version,/trendCacheVersion:56/);
assert.match(version,/coverImagePolicy:'unsplash-curated-pool-500-no-official-press-youtube-thumbnails-v8043'/);
console.log('v8.0.37 Unsplash-only regression policy tests passed under v8.0.38');
