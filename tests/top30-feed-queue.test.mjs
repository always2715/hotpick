import assert from 'node:assert/strict';
import { compactTrendPayload, contentTierForTrend, selectTopContentCandidates } from '../lib/topContentPolicy.js';

const trends=Array.from({length:20},(_,index)=>({
  rank:index+1,slug:`trend-${index+1}`,keyword:`검증 주제 ${index+1}`,visibility:'published',mainVisible:true,
  publicTopPolicy:'atomic_verified_event_v3',publicReady:true,contentReady:true,verifiedFactCount:3,verifiedEvidenceCount:2,
}));
const selected=selectTopContentCandidates(trends,{limit:30});
assert.equal(selected.length,20);
assert.equal(selected[0].contentTier,'full');
assert.equal(selected[9].contentTier,'full','TOP1~10은 full 조사 단계입니다.');
assert.equal(selected[10].contentTier,'standard');
const payload=compactTrendPayload(selected[19]);
assert.equal(payload.rank,20);
assert.equal(payload.contentTier,'standard');
assert.equal(payload.topEligible,true);
assert.equal(payload.publicTopPolicy,'atomic_verified_event_v3');

assert.equal(contentTierForTrend({rank:31,visibility:'published',mainVisible:true,publicTopPolicy:'atomic_verified_event_v3',publicReady:true,contentReady:true,verifiedFactCount:3}),'none');
assert.equal(contentTierForTrend({rank:10,visibility:'private',mainVisible:true,publicTopPolicy:'research_pending_v3'}),'full');
assert.equal(contentTierForTrend({rank:11,visibility:'private',mainVisible:true,publicTopPolicy:'research_pending_v3'}),'standard');

const filtered=selectTopContentCandidates([
  trends[0],
  {...trends[1],slug:'private',visibility:'private'},
  {...trends[2],slug:'not-ready',publicReady:false},
  {...trends[3],slug:'outside',rank:31},
]);
assert.deepEqual(filtered.map(item=>item.slug),['trend-1']);
console.log('top content tier v8 tests passed');
