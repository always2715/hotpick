import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FEED_INDEX_SCHEMA_VERSION,
  feedIndexItemRejectionReasons,
  isCurrentFeedIndexItem,
} from '../lib/feedIndexPolicy.js';


const expected={
  slug:'park-seojin',feedIndexSchemaVersion:FEED_INDEX_SCHEMA_VERSION,
  sourceContentVersion:124,contentVersion:125,sourceUpdatedAt:'2026-06-23T09:00:00.000Z',
  category:'entertainment',feedTitle:'박서진 · 전국투어 공연 예매 일정 공개',
  summary:'박서진의 전국투어 공연 일정과 예매 정보가 공개됐습니다.',
};
const current={
  ...expected,hasContent:true,publicReady:true,feedReady:true,status:'published',visibility:'published',
  updatedAt:'2026-06-23T09:00:00.000Z',
};
assert.equal(isCurrentFeedIndexItem(current,expected),true);
assert.deepEqual(feedIndexItemRejectionReasons(current,expected),[]);

const stale={...current,feedIndexSchemaVersion:1,publicReady:false,feedReady:false,summary:'',sourceContentVersion:122};
const reasons=feedIndexItemRejectionReasons(stale,expected);
assert.ok(reasons.includes('피드 인덱스 스키마 불일치'));
assert.ok(reasons.includes('공개 준비 상태 누락'));
assert.ok(reasons.includes('피드 준비 상태 누락'));
assert.ok(reasons.includes('피드 요약 없음'));
assert.ok(reasons.includes('콘텐츠 버전 불일치'));
assert.equal(isCurrentFeedIndexItem(stale,expected),false);

const kv=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
assert.match(kv,/feedIndexSchema:\s*`\$\{NS\}:feed:index:schema`/);
assert.match(kv,/feedIndexSchemaVersion:FEED_INDEX_SCHEMA_VERSION/);
assert.match(kv,/sourceUpdatedAt/);
assert.match(kv,/feedIndexItemRejectionReasons\(storedItem\|\|\{\},item\)/);
assert.match(kv,/sourceOfTruthFeedFallback/);
assert.match(kv,/FEED_REBUILD_VISIBLE_COUNT_MISMATCH/);
assert.match(kv,/repairPublishedFeedIndexesInternal\(r,\{topOnly:false,force:true\}\)/);
assert.match(kv,/markerStale\|\|invalidTopCount>0\|\|empty/);
assert.match(kv,/피드 인덱스 재구성 후 검증 실패/);
assert.match(kv,/K\.feedIndexSchema/);

const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(refresh,/repairPublishedFeedIndexes\(\{topOnly:true,force:true\}\)/);

const admin=fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
assert.match(admin,/현재 TOP 피드 목록 재구성/);
assert.match(admin,/원본에서 피드 목록·최신순·게시번호·조회수·카테고리 인덱스를 강제로 다시 만듭니다/);

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/contentVersion:132/);
assert.match(version,/trendCacheVersion:51/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/published-content-source-of-truth-and-index-rebuild-v8030-plus-canonical-run-snapshot-alias-v8036/);

console.log('STELLATE v8.0.23 feed index source rebuild tests: PASS');
