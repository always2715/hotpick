import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareSelectedTopCandidates } from '../lib/candidateIdentity.js';

const input=Array.from({length:30},(_,index)=>({
  slug:index<2?'same-keyword':`topic-${index+1}`,
  keyword:index<2?'동일 키워드':`키워드 ${index+1}`,
  displayTitle:index===0?'동일 키워드 경기 출전':index===1?'동일 키워드 이적 보도':`키워드 ${index+1}`,
  eventKey:index===0?'match':index===1?'transfer':`event-${index+1}`,
}));
const prepared=prepareSelectedTopCandidates(input,'run-test');
assert.equal(prepared.length,30);
assert.equal(new Set(prepared.map(row=>row.slug)).size,30,'같은 키워드의 다른 사건도 공개 slug가 충돌하면 안 됩니다.');
assert.equal(new Set(prepared.map(row=>row.candidateId)).size,30);
assert.equal(new Set(prepared.map(row=>row.publicationStageId)).size,30);
assert.ok(prepared.every(row=>row.publicationStageId.startsWith('run-test:')));

const job=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const kv=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
assert.match(job,/FINALIZE_RECOVERY_PASSES\s*=\s*1/);
assert.match(job,/executeTrendRefreshRetryBatch/);
assert.match(job,/missingAfterRecovery/);
assert.match(job,/forceRetry:true/);
const finalizeBlock=job.slice(job.indexOf('export async function finalizeTrendRefreshRun'),job.indexOf('export async function executeTrendRefreshRun'));
assert.doesNotMatch(finalizeBlock,/processTrendCandidate\(/);
assert.match(job,/stage_read_failed/);
assert.match(job,/identity_migrated/);
assert.match(kv,/STAGE_WRITE_VERIFY_FAILED/);
assert.match(kv,/STAGE_READ_FAILED/);
assert.match(kv,/publicationStageId/);

const adminAction=fs.readFileSync(new URL('../pages/api/admin-action.js',import.meta.url),'utf8');
assert.match(adminAction,/needsIdentityMigration/);
assert.match(adminAction,/manual_explicit_retry/);
assert.match(adminAction,/MAX_CANDIDATE_ATTEMPTS/);
assert.match(adminAction,/phase='start'/);
assert.doesNotMatch(adminAction,/\['generated','reused','pending','review','failed','skipped'\]/);
console.log('v8.0.19 unique candidate staging, bounded retry, read/write verification, and validation-only finalize tests passed');
