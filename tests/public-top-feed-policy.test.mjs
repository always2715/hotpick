import assert from 'node:assert/strict';
import { isCurrentPublicTop, isTopBriefEligible, shouldSkipSourceFetchForBrief, selectTopContentCandidates, isResearchCandidate, contentTierForTrend } from '../lib/topContentPolicy.js';

const atomicTop={rank:8,slug:'atomic',keyword:'검증 TOP',visibility:'published',mainVisible:true,publicTopPolicy:'atomic_verified_event_v3',publicReady:true,contentReady:true,verifiedFactCount:3,verifiedEvidenceCount:2};
assert.equal(isCurrentPublicTop(atomicTop),true);
assert.equal(isTopBriefEligible(atomicTop),false);
assert.equal(shouldSkipSourceFetchForBrief(atomicTop),false);
assert.equal(contentTierForTrend(atomicTop),'full');

const pending={rank:12,slug:'pending',keyword:'조사 후보',visibility:'private',mainVisible:true,publicTopPolicy:'research_pending_v3'};
assert.equal(isResearchCandidate(pending),true);
assert.equal(isCurrentPublicTop(pending),false);
assert.equal(contentTierForTrend(pending),'standard');

const incomplete={...atomicTop,slug:'incomplete',publicReady:false};
const hidden={...atomicTop,slug:'hidden',visibility:'private'};
assert.equal(isCurrentPublicTop(incomplete),false);
assert.equal(isCurrentPublicTop(hidden),false);
assert.deepEqual(selectTopContentCandidates([atomicTop,incomplete,hidden]).map(item=>item.slug),['atomic']);
console.log('public top atomic policy tests passed');
