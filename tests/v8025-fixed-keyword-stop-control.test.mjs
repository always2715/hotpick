import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { isFixedKeywordFeedReady, fixedKeywordFeedRejectionReasons, GENERIC_INTEREST_TEMPLATE } from '../lib/publicationPolicy.js';

const now=new Date().toISOString();
const ledger={
  facts:[
    {id:'P1',text:'박서진은 트로트 장르를 중심으로 활동하는 가수입니다.',scope:'profile',status:'confirmed',sourceIds:['S1'],sourceType:'trusted_news'},
    {id:'P2',text:'박서진은 방송과 공연 무대에서 활동하고 있습니다.',scope:'profile',status:'confirmed',sourceIds:['S1'],sourceType:'trusted_news'},
    {id:'P3',text:'박서진은 장구를 활용한 무대로 대중에게 알려졌습니다.',scope:'profile',status:'confirmed',sourceIds:['S1'],sourceType:'trusted_news'},
  ],
  conflicts:[],uncertainties:[],
};
const pkg=buildVerifiedFallback('박서진',ledger,36,'standard');
assert.equal(pkg.identityOnly,true,'현재 사건이 없어도 키워드 정체 사실로 설명형 피드를 작성해야 합니다.');
assert.equal(pkg.feedTitle,'박서진 · 가수 활동과 주요 정보');
assert.match(pkg.blog,/## 박서진은 어떤 가수인가/);
assert.match(pkg.blog,/트로트|방송|공연|장구/);
assert.doesNotMatch(pkg.blog,GENERIC_INTEREST_TEMPLATE);

const content={
  ...pkg,
  status:'published',visibility:'published',contentMode:'detailed',contentType:'detailed',hasContent:true,
  contentGrade:'C',candidateType:'entity_profile',causeStatus:'identified',identityMode:true,
  topKeyword:'박서진',topTopic:'가수 활동과 주요 정보',topTitle:'박서진 · 가수 활동과 주요 정보',
  displayTitle:'박서진',feedTitle:'박서진 · 가수 활동과 주요 정보',detailTitle:'박서진 · 가수 활동과 주요 정보',
  titleReady:true,titleStatus:'ready',groundingScore:78,
  card:{summary:pkg.summary,why:pkg.why,points:pkg.points,feedTitle:pkg.feedTitle},
  copyrightRisk:{passed:true,maxSimilarity:0,longPhraseMatches:0},
  evidenceSources:[{id:'S1',title:'박서진 가수 프로필',source:'예시뉴스',domain:'news.example.com',sourceType:'trusted_news',link:'https://news.example.com/park',publishedAt:now}],
  factLedger:ledger,
};
assert.equal(isFixedKeywordFeedReady(content),true,JSON.stringify(fixedKeywordFeedRejectionReasons(content)));

const job=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const processBlock=job.slice(job.indexOf('async function processTrendCandidate'),job.indexOf('export async function startTrendRefreshRun'));
assert.match(job,/TOP_KEYWORD_MAX_ATTEMPTS\|\|5/);
assert.match(job,/AUTOMATIC_RUN_STEP_BUDGET/);
assert.match(job,/MAX_STALLED_RUN_STEPS/);
assert.match(job,/TOP_REFRESH_MAX_MINUTES\|\|120/);
assert.match(job,/trend_refresh_cancelled/);
assert.match(job,/trend_refresh_step_limit/);
assert.match(job,/trend_refresh_time_limit/);
assert.match(processBlock,/retryable\?'retry_wait':'failed'/);
assert.match(processBlock,/status:'failed'/);
assert.match(processBlock,/status:'stopped'/);
assert.doesNotMatch(processBlock,/status:'review'/);
assert.doesNotMatch(processBlock,/status:'pending'/);
assert.match(processBlock,/isFixedKeywordFeedReady/);

const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(api,/identityMode/);
assert.match(job,/expanded_keyword_research/);
assert.match(api,/fixed_keyword_feed_v16_top20/);
assert.doesNotMatch(api,/현재 사건 Fact 1개가 없어.*검토/);

const kv=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
assert.match(kv,/export async function requestTrendRefreshStop/);
assert.match(kv,/status:'stop_requested'/);
assert.match(kv,/stopRequestedAt/);

const adminAction=fs.readFileSync(new URL('../pages/api/admin-action.js',import.meta.url),'utf8');
assert.match(adminAction,/stop_trend_run/);
assert.match(adminAction,/requestTrendRefreshStop/);
assert.match(adminAction,/clearTrendRefreshStop/);

const admin=fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
assert.match(admin,/현재 TOP 작업 중단/);
assert.match(admin,/작업 중단/);
assert.match(admin,/추가 검색/);
assert.doesNotMatch(admin,/검토기준 미충족/);

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/contentVersion:139/);
assert.match(version,/trendCacheVersion:56/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/ranked_candidate_pool_v17_top20_from25/);
assert.match(version,/automaticKeywordAttempts:3/);
assert.match(version,/manualKeywordAttempts:5/);
assert.match(version,/maxRunSteps:96/);
assert.match(version,/hardMaxRunSteps:240/);
assert.match(version,/maxRunMinutes:120/);

console.log('STELLATE v8.0.25 fixed keyword content and stop control tests: PASS');
