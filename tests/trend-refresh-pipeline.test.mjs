import assert from 'node:assert/strict';
import {
  TrendRefreshError,
  assertFreshTrendSet,
  verifyPersistedTrendSet,
  summarizeTrendRefresh,
  normalizeRefreshError,
  assessTrendSetHealth,
  mergeRecentPreviousTrends,
  shouldCommitProgressiveRecovery,
} from '../lib/trendRefreshPolicy.js';

const previous = [
  { slug:'a', eventKey:'event-a', rank:1 },
  { slug:'b', eventKey:'event-b', rank:2 },
];

assert.throws(
  () => assertFreshTrendSet([], { reason:'google_trends_empty' }, previous),
  error => error instanceof TrendRefreshError && error.code === 'google_trends_empty',
  '신규 후보 0건은 이전 TOP 성공 재사용이 아니라 명시적 실패여야 합니다.',
);

assert.throws(
  () => assertFreshTrendSet([{ slug:'a', eventKey:'same' }, { slug:'b', eventKey:'same' }], {}, previous),
  error => error.code === 'duplicate_trend_identity',
  '중복 사건 식별자는 저장 전에 차단해야 합니다.',
);

const next = [
  { slug:'b', eventKey:'event-b', rank:1 },
  { slug:'c', eventKey:'event-c', rank:2 },
];
assert.deepEqual(summarizeTrendRefresh(previous, next), {
  previousCount:2,
  nextCount:2,
  entered:1,
  dropped:1,
  moved:1,
  changed:3,
  unchanged:false,
  result:'updated',
});

const unchanged = summarizeTrendRefresh(previous, previous);
assert.equal(unchanged.result, 'verified_unchanged');
assert.equal(unchanged.changed, 0);

const now = new Date().toISOString();
assert.deepEqual(
  verifyPersistedTrendSet(next, JSON.parse(JSON.stringify(next)), now, now),
  { verified:true, savedCount:2, updatedAt:now },
);
assert.throws(
  () => verifyPersistedTrendSet(next, next.slice(0,1), now, now),
  error => error.code === 'trend_save_verify_failed',
  'Redis 저장 건수가 다르면 성공으로 처리하면 안 됩니다.',
);

const normalized = normalizeRefreshError(new TrendRefreshError('no_verified_candidates','후보 없음',{previousCount:30}));
assert.equal(normalized.code,'no_verified_candidates');
assert.equal(normalized.details.previousCount,30);

console.log('trend refresh pipeline tests passed');


const healthy=assessTrendSetHealth(Array.from({length:20},(_,i)=>({slug:`n${i}`,eventKey:`n${i}`})),Array.from({length:20},(_,i)=>({slug:`p${i}`,eventKey:`p${i}`})),{mergedCandidates:60,rejected:20},{consecutiveLow:0,targetCount:20});
assert.equal(healthy.healthy,true);
const low=assessTrendSetHealth(Array.from({length:19},(_,i)=>({slug:`n${i}`,eventKey:`n${i}`})),Array.from({length:20},(_,i)=>({slug:`p${i}`,eventKey:`p${i}`})),{mergedCandidates:60,rejected:31,dominantRejectionShare:0.75},{consecutiveLow:0,targetCount:20});
assert.equal(low.healthy,false);
assert.equal(low.lowCount,true);
assert.equal(low.suddenDrop,true);
assert.equal(low.massRejected,true);
const secondLow=assessTrendSetHealth([{slug:'one',eventKey:'one'}],[],{mergedCandidates:60,rejected:59},{consecutiveLow:1,targetCount:20});
assert.equal(secondLow.healthy,false);
assert.equal(secondLow.incompleteTarget,true);
assert.equal(secondLow.allowMergeWithPrevious,true);
const recent=new Date().toISOString();
const merged=mergeRecentPreviousTrends([{slug:'new',eventKey:'new',sourceNewestAt:recent}],[{slug:'old',eventKey:'old',sourceNewestAt:recent}],30);
assert.deepEqual(merged.map(item=>item.slug),['new','old']);
console.log('trend refresh health guard tests passed');

assert.equal(shouldCommitProgressiveRecovery(8,0,30),true,'초기 TOP이 0건이면 검증된 일부라도 복구 공개해야 합니다.');
assert.equal(shouldCommitProgressiveRecovery(18,8,30),true,'30개까지 증가하는 복구 갱신은 허용해야 합니다.');
assert.equal(shouldCommitProgressiveRecovery(8,18,30),false,'부분 TOP이 감소하는 갱신은 차단해야 합니다.');
assert.equal(shouldCommitProgressiveRecovery(19,20,20),false,'완성된 TOP20을 불완전한 목록으로 교체하면 안 됩니다.');
