import assert from 'node:assert/strict';
import { buildEarlyCompletionPlan, TARGET_TOP_COUNT, RESEARCH_POOL_LIMIT } from '../lib/trendRefreshJob.js';

const candidates=Array.from({length:RESEARCH_POOL_LIMIT},(_,index)=>({
  candidateId:`candidate-${index+1}`,
  slug:`candidate-${index+1}`,
  selectionRank:index+1,
  rank:index+1,
}));
const task=(rank,status,attempts=1)=>({candidateId:`candidate-${rank}`,slug:`candidate-${rank}`,status,attempts});

{
  const tasks=[
    ...Array.from({length:20},(_,index)=>task(index+1,'generated')),
    ...Array.from({length:5},(_,index)=>task(index+21,'queued',0)),
  ];
  const plan=buildEarlyCompletionPlan(candidates,tasks,TARGET_TOP_COUNT,3);
  assert.equal(plan.targetReached,true);
  assert.equal(plan.readyCount,20);
  assert.equal(plan.cutoffRank,20);
  assert.deepEqual(plan.retryTaskIds,[]);
  assert.deepEqual(plan.skipTaskIds,['candidate-21','candidate-22','candidate-23','candidate-24','candidate-25']);
}

{
  const tasks=[];
  for(let rank=1;rank<=25;rank++){
    if(rank===2)tasks.push(task(rank,'retry_wait',1));
    else if(rank<=21)tasks.push(task(rank,'generated'));
    else tasks.push(task(rank,'queued',0));
  }
  const plan=buildEarlyCompletionPlan(candidates,tasks,TARGET_TOP_COUNT,3);
  assert.equal(plan.targetReached,true);
  assert.equal(plan.readyCount,20);
  assert.equal(plan.cutoffRank,21);
  assert.deepEqual(plan.retryTaskIds,['candidate-2']);
  assert.deepEqual(plan.skipTaskIds,['candidate-22','candidate-23','candidate-24','candidate-25']);
}

{
  const tasks=[
    ...Array.from({length:19},(_,index)=>task(index+1,'generated')),
    ...Array.from({length:6},(_,index)=>task(index+20,'queued',0)),
  ];
  const plan=buildEarlyCompletionPlan(candidates,tasks,TARGET_TOP_COUNT,3);
  assert.equal(plan.targetReached,false);
  assert.equal(plan.readyCount,19);
  assert.deepEqual(plan.skipTaskIds,[]);
}

const source=await import('node:fs').then(({readFileSync})=>readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8'));
assert.match(source,/if\(progress\.ready>=TARGET_TOP_COUNT\)return queueRetryOrFinalize/);
assert.match(source,/errorCode:'SKIPPED_NOT_NEEDED'/);
assert.match(source,/candidatePhase:'skipped_not_needed'/);
assert.match(source,/더 높은 순위 retry_wait 후보/);

console.log('STELLATE v8.0.55 early TOP20 completion tests: PASS');
