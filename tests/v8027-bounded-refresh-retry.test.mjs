import assert from 'node:assert/strict';
import fs from 'node:fs';

const job=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const jobs=fs.readFileSync(new URL('../lib/jobs.js',import.meta.url),'utf8');
const endpoint=fs.readFileSync(new URL('../pages/api/jobs/update-trends.js',import.meta.url),'utf8');
const admin=fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
const adminAction=fs.readFileSync(new URL('../pages/api/admin-action.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const kv=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');

assert.match(job,/TREND_REFRESH_RETRY_BATCH_SIZE\s*=\s*1/);
assert.match(job,/MAX_AUTOMATIC_ATTEMPTS/);
assert.match(job,/FINALIZE_RECOVERY_PASSES\s*=\s*1/);
assert.match(job,/force:forceRetry\|\|attempt>1/,'1차 처리는 캐시를 사용할 수 있어야 합니다.');
assert.match(job,/executeTrendRefreshRetryBatch/);
assert.match(job,/duplicateBatchIgnored/);
assert.match(job,/Math\.max\(0,Number\(run\.lastCompletedCursor\|\|0\),Number\(run\.batchCursor\|\|0\)\)/,'v8.0.26 실행의 batchCursor를 이어받아야 합니다.');
assert.match(job,/duplicateRetryIgnored/);
assert.match(job,/duplicateStartIgnored/);
assert.match(job,/manualRetryAllowed/);
assert.match(job,/normalizeReadyStagesForBoundedRetry/);
assert.match(job,/normalizeReadyStagesForBoundedRetry/);
assert.match(job,/\['retry_wait','failed','stopped'\]\.includes/,'1차 배치 재전달이 추가 검색을 직접 실행하면 안 됩니다.');
const generatedGuard=job.indexOf('snapshot_preflight_verified');
const attemptGuard=job.indexOf('if(previousAttempts>=candidateAttemptLimit)');
assert.ok(generatedGuard>=0&&attemptGuard>generatedGuard,'이미 완료된 항목 검증이 시도 한도 판정보다 먼저 실행돼야 합니다.');

const finalizeBlock=job.slice(job.indexOf('export async function finalizeTrendRefreshRun'),job.indexOf('export async function executeTrendRefreshRun'));
assert.doesNotMatch(finalizeBlock,/processTrendCandidate\(/,'finalize 단계에서 검색·AI 생성을 다시 실행하면 안 됩니다.');
assert.doesNotMatch(finalizeBlock,/getCachedContent\(/,'finalize 단계는 콘텐츠 생성 API를 호출하면 안 됩니다.');

assert.match(jobs,/\['start','batch','retry','finalize'\]/);
assert.match(jobs,/update-trends-v836/);
assert.match(jobs,/cleanPart\(trigger\)/,'관리자 명시적 재개는 기존 자동 retry dedupe ID와 충돌하면 안 됩니다.');
assert.match(endpoint,/phase === 'retry'/);
assert.match(admin,/1차 처리/);
assert.match(admin,/재시도 대기/);
assert.match(adminAction,/manual_explicit_retry/);
assert.match(adminAction,/phase=retryableCount>0\?'retry':'finalize'/);
assert.match(version,/automaticKeywordAttempts:3/);
assert.match(version,/retryBatchSize:1/);

// Fact Ledger에 직접 evidenceSources가 없어도 ledger.sources와 fact.claim을 복구 입력으로 사용해야 합니다.
assert.match(api,/row\?\.text\|\|row\?\.claim/);
assert.match(api,/originalLedger\.sources/);
assert.match(api,/stageCacheReused:true/);
assert.match(api,/reusableFixedStageContent/);
assert.match(kv,/lastCompletedCursor/);
assert.match(kv,/retryProcessed/);

console.log('STELLATE v8.0.28 bounded TOP refresh retry compatibility tests: PASS');
