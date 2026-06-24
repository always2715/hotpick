import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api=await readFile(new URL('../lib/api.js',import.meta.url),'utf8');
const kv=await readFile(new URL('../lib/kv.js',import.meta.url),'utf8');
const admin=await readFile(new URL('../pages/admin.js',import.meta.url),'utf8');
const action=await readFile(new URL('../pages/api/admin-action.js',import.meta.url),'utf8');
const home=await readFile(new URL('../pages/index.js',import.meta.url),'utf8');
const feed=await readFile(new URL('../pages/feed.js',import.meta.url),'utf8');
const refreshJob=await readFile(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');

assert.equal(api.includes('usedPreviousCache:true'),false);
assert.equal(kv.includes("error.code = 'REDIS_NOT_CONFIGURED'"),true);
assert.equal(action.includes("if (action === 'refresh_trends_direct')"),true,'QStash 장애 시 관리자 즉시 실행 진단 경로를 제공해야 합니다.');
assert.equal(action.includes("executeTrendRefreshRun(runId,{actor:'admin',trigger:'admin_direct'}"),true,'즉시 실행은 별도 명시적 관리자 액션에서만 허용합니다.');
assert.equal(action.includes("enqueueTrendRefresh({trigger:'admin'})"),true,'관리자 TOP 적용도 QStash 원자적 갱신 경로를 사용해야 합니다.');
assert.equal(admin.includes("fetch('/api/admin/trends'"),true);
assert.equal(admin.includes('const [trends,setTrends]=useState'),true);
assert.equal(admin.includes('마지막 성공 TOP 갱신이 4시간을 초과'),true);
assert.equal(home.includes('private, no-store'),true);
assert.equal(feed.includes('private, no-store'),true);
assert.equal(refreshJob.includes('prepareTrendRefresh'),true,'후보 조사와 공개 확정이 분리되어야 합니다.');
assert.equal(refreshJob.includes('commitAtomicTopPublication'),true,'TOP·피드·상세를 원자적으로 공개해야 합니다.');
assert.equal(refreshJob.includes('ensureBaseTopFeeds'),false,'빈 기본 브리핑 선공개는 제거되어야 합니다.');
assert.equal(refreshJob.includes("contentTier:'brief'"),false,'TOP 갱신에서 브리핑 공개를 사용하면 안 됩니다.');
assert.equal(refreshJob.includes("'abnormal_top_pool_shrink'"),true,'급감 보호 실패 코드를 기록해야 합니다.');
console.log('admin atomic refresh flow tests passed');
