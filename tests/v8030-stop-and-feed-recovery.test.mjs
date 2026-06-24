import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isVisibleFeedIndexRecord } from '../lib/feedIndexPolicy.js';

const compactFeed={
  slug:'verified-feed',hasContent:true,publicReady:true,feedReady:true,
  status:'published',visibility:'published',feedTitle:'검증된 피드 제목입니다',
  summary:'공식 자료에서 확인한 사실을 근거로 작성한 피드 요약입니다.',
};
assert.equal(isVisibleFeedIndexRecord(compactFeed),true,'목록용 피드 레코드는 상세 blog 필드가 없어도 표시돼야 합니다.');
assert.equal(isVisibleFeedIndexRecord({...compactFeed,visibility:'hidden_feed'}),false);
assert.equal(isVisibleFeedIndexRecord({...compactFeed,feedReady:false}),false);
assert.equal(isVisibleFeedIndexRecord({...compactFeed,summary:'짧음'}),false);

const kv=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
assert.match(kv,/loadPublishedFeedRowsFromContents/,'피드 인덱스 장애 시 공개 콘텐츠 원본 fallback이 필요합니다.');
assert.match(kv,/sourceOfTruthFeedFallback/,'피드 조회의 source-of-truth fallback이 필요합니다.');
assert.match(kv,/console\.error\('Redis getFeedPosts error:'/,'피드 오류를 빈 배열로 조용히 숨기면 안 됩니다.');
assert.match(kv,/FEED_REBUILD_VISIBLE_COUNT_MISMATCH/,'재구성 후 실제 표시 건수를 검증해야 합니다.');
assert.match(kv,/status:'cancelled'.*stopRequested:'true'/s,'관리자 중단은 즉시 취소 상태로 확정돼야 합니다.');
assert.match(kv,/status:'stopped'.*trend_refresh_cancelled/s,'대기·처리 작업을 중단 상태로 전환해야 합니다.');
assert.match(kv,/activeLockReleased/,'현재 실행 잠금을 해제한 결과를 반환해야 합니다.');

const admin=fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
assert.match(admin,/현재 TOP 작업 즉시 중단/);
assert.match(admin,/stop_active_trend_run/);
assert.match(admin,/activeRunId/);
assert.match(admin,/CURRENT_CONTENT_VERSION=133/);

const adminAction=fs.readFileSync(new URL('../pages/api/admin-action.js',import.meta.url),'utf8');
assert.match(adminAction,/stop_active_trend_run/);
assert.match(adminAction,/rebuildMissingTopFeeds\(\{force:true\}\)/);

const status=fs.readFileSync(new URL('../pages/api/admin/status.js',import.meta.url),'utf8');
assert.match(status,/getActiveTrendRefreshRunId/);
assert.match(status,/activeRunId/);

const feedApi=fs.readFileSync(new URL('../pages/api/feed.js',import.meta.url),'utf8');
assert.match(feedApi,/recovered/);
assert.match(feedApi,/errorCode/);

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/stop-and-feed-recovery-v8030/);
assert.match(version,/source-content-fallback-force-index-rebuild/);

console.log('STELLATE v8.0.30 stop and feed recovery tests: PASS');
