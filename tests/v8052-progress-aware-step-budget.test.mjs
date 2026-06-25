import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTOMATIC_RUN_STEP_BUDGET,
  MANUAL_RUN_STEP_BUDGET,
  MAX_RUN_STEPS,
  HARD_MAX_RUN_STEPS,
  MAX_STALLED_RUN_STEPS,
} from '../lib/trendRefreshJob.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const job=fs.readFileSync(path.join(root,'lib/trendRefreshJob.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'pages/api/admin-action.js'),'utf8');
const jobs=fs.readFileSync(path.join(root,'lib/jobs.js'),'utf8');
const version=fs.readFileSync(path.join(root,'pages/api/version.js'),'utf8');

// 25개를 1회 처리하고, 실패한 25개를 자동으로 두 번 더 처리한 뒤 finalize하는 정상 최악 조건입니다.
const automaticWorstCase=25*3+1;
const manualWorstCase=25*5+1;
assert.ok(AUTOMATIC_RUN_STEP_BUDGET>=automaticWorstCase,`자동 단계 예산 ${AUTOMATIC_RUN_STEP_BUDGET}은 정상 최악 ${automaticWorstCase}보다 작습니다.`);
assert.ok(MAX_RUN_STEPS>=AUTOMATIC_RUN_STEP_BUDGET);
assert.ok(MANUAL_RUN_STEP_BUDGET>=manualWorstCase,`수동 단계 예산 ${MANUAL_RUN_STEP_BUDGET}은 정상 최악 ${manualWorstCase}보다 작습니다.`);
assert.ok(HARD_MAX_RUN_STEPS>MANUAL_RUN_STEP_BUDGET);
assert.ok(MAX_STALLED_RUN_STEPS>=4&&MAX_STALLED_RUN_STEPS<=20);

assert.match(job,/progressSignature\(run,tasks\)/);
assert.match(job,/trend_refresh_stalled_loop/);
assert.match(job,/trend_refresh_hard_step_limit/);
assert.match(job,/RUN_STEP_BUDGET_EXTENSION/);
assert.match(job,/resumeWindowStartedAt\|\|run\?\.resumedAt/);
assert.match(admin,/resumeWindowStartedAt:resumedAt/);
assert.match(admin,/stepCount:0,stepBudget:0,stalledStepCount:0/);
assert.match(admin,/queueGeneration=Math\.max\(0,Number\(run\?\.queueGeneration\|\|0\)\)\+1/);
assert.match(jobs,/`g\$\{queueGeneration\}`/);
assert.match(version,/automaticRunStepBudget:96/);
assert.match(version,/manualRunStepBudget:160/);
assert.match(version,/hardMaxRunSteps:240/);
assert.match(version,/maxStalledRunSteps:10/);

console.log('STELLATE v8.0.52 progress-aware step budget and resume window tests: PASS');
