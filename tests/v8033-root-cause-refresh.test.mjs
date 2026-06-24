import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTopCandidateKeyword, resolveTop30Keyword } from '../lib/editorialTitle.js';
import { assessStageIdentity } from '../lib/stageIdentityPolicy.js';
import { researchCandidateEntryRejectionReasons } from '../lib/trendSelectionPolicy.js';
import { selectStableTop30 } from '../lib/top30Selection.js';
import { writeDualRunSnapshot, runSnapshotKey } from '../lib/runSnapshotStore.js';

class MemoryRedis {
  constructor(){this.values=new Map();this.hashes=new Map();}
  async set(key,value){this.values.set(String(key),value);return 'OK';}
  async get(key){return this.values.get(String(key))??null;}
  async hset(key,object){
    const name=String(key);const map=this.hashes.get(name)||new Map();
    for(const [field,value] of Object.entries(object||{}))map.set(String(field),value);
    this.hashes.set(name,map);return Object.keys(object||{}).length;
  }
  async hget(key,field){return this.hashes.get(String(key))?.get(String(field))??null;}
  async expire(){return 1;}
}

// 실제 실패 로그에 등장한 문장 조각은 TOP20 확정 전에 제외해야 합니다.
for(const keyword of ['13.61포인트(1.53 오른','나란히 2경기','질문에 답하는']){
  const quality=validateTopCandidateKeyword(keyword);
  assert.equal(quality.valid,false,`${keyword}는 독립 키워드가 아닌 기사 문장 조각입니다.`);
  assert.ok(researchCandidateEntryRejectionReasons({keyword,topKeyword:keyword,displayTitle:keyword,keywordUsable:quality.valid}).length>0);
}
assert.equal(validateTopCandidateKeyword('김정은').valid,true,'명확한 인물명은 유지해야 합니다.');
assert.equal(resolveTop30Keyword({keyword:'유인영 45세 전에는 꼭',sourceTitles:['유인영 인터뷰']}).keyword,'유인영');
assert.equal(resolveTop30Keyword({keyword:'HBM4 출하 4개월만',sourceTitles:['HBM4 출하 관련 발표']}).keyword,'HBM4');


// 후보 필터는 잘못된 조각을 제거한 뒤 다음 정상 후보로 TOP20을 끝까지 채워야 합니다.
const validSelectionCandidates=Array.from({length:22},(_,index)=>({
  keyword:`검증키워드${index+1}`,
  topKeyword:`검증키워드${index+1}`,
  displayTitle:`검증키워드${index+1}`,
  rawKeyword:`검증키워드${index+1}`,
  keywordUsable:true,
  rankingScore:100-index,
  googleRank:index+1,
  category:['tech','economy','life','sports'][index%4],
  candidateType:'interest',
}));
const invalidSelectionCandidates=['13.61포인트(1.53 오른','나란히 2경기','질문에 답하는'].map((keyword,index)=>({
  keyword,topKeyword:keyword,displayTitle:keyword,rawKeyword:keyword,keywordUsable:false,rankingScore:200-index,googleRank:index+1,category:'general',candidateType:'interest',
}));
const selectedTop20=selectStableTop30([...invalidSelectionCandidates,...validSelectionCandidates],{limit:20});
assert.equal(selectedTop20.rows.length,20,'비정상 문장 조각을 제외해도 다음 정상 후보로 TOP20을 채워야 합니다.');
assert.equal(selectedTop20.rows.some(row=>invalidSelectionCandidates.some(invalid=>invalid.keyword===row.keyword)),false,'비정상 문장 조각이 TOP20에 남으면 안 됩니다.');

// candidateId는 실행·순위마다 달라질 수 있으므로 과거 공개 콘텐츠는 slug+핵심 키워드로 현재 실행에 승격합니다.
const runId='run-v8033';
const trend={slug:'kim-jong-un',candidateId:'r2-new',publicationStageId:`${runId}:r2-new`,keyword:'김정은',topKeyword:'김정은',displayTitle:'김정은',rank:2};
const priorRunContent={slug:'kim-jong-un',candidateId:'r7-old',publicationStageId:'run-v8032:r7-old',contentVersion:129,keyword:'김정은',topKeyword:'김정은',displayTitle:'김정은'};
const migrated=assessStageIdentity(priorRunContent,trend,runId,1,131);
assert.equal(migrated.matched,true,'과거 실행 ID가 달라도 같은 slug와 키워드면 현재 실행 원본으로 복구해야 합니다.');
assert.equal(migrated.versionMatched,false,'이전 콘텐츠 버전은 동일성만 인정하고 Fact 기반 재구성을 거쳐야 합니다.');
assert.equal(migrated.matchType,'legacy_cross_run_slug_keyword');

const sameRunConflict={...priorRunContent,publicationStageId:`${runId}:r99-other`,candidateId:'r99-other',contentVersion:131};
assert.equal(assessStageIdentity(sameRunConflict,trend,runId,1,131).matched,false,'현재 실행 안의 다른 후보 stage는 잘못 승격하면 안 됩니다.');

// 실행 원본은 candidateId, slug alias, stage alias 모두에 저장되어야 합니다.
const redis=new MemoryRedis();
const snapshotKey=runSnapshotKey('stellate:v7',runId);
const stageKey=`stellate:v7:publication_stage:${trend.publicationStageId}`;
const serialized=JSON.stringify({...trend,contentVersion:131,blog:'검증 사실 기반 상세 콘텐츠'});
const written=await writeDualRunSnapshot(redis,{stageKey,snapshotKey,candidateId:trend.candidateId,aliases:[`slug:${trend.slug}`,`stage:${trend.publicationStageId}`],serialized});
assert.equal(written.verified,true);
assert.ok(await redis.hget(snapshotKey,trend.candidateId));
assert.ok(await redis.hget(snapshotKey,`slug:${trend.slug}`));
assert.ok(await redis.hget(snapshotKey,`stage:${trend.publicationStageId}`));

const refreshSource=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const jobsSource=fs.readFileSync(new URL('../lib/jobs.js',import.meta.url),'utf8');
const versionSource=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(refreshSource,/TREND_REFRESH_STEP_BATCH_SIZE = 1/,'후보는 QStash 요청당 한 건만 처리해야 합니다.');
assert.match(refreshSource,/TREND_REFRESH_RETRY_BATCH_SIZE = 1/,'추가 검색도 요청당 한 건만 처리해야 합니다.');
assert.match(refreshSource,/PHASE_LOCK_TTL_SEC = 240/,'단계 lock은 QStash 300초 요청 제한보다 먼저 만료돼야 합니다.');
assert.match(refreshSource,/throw new TrendRefreshError\('trend_step_lock_busy'/,'남은 lock을 성공 응답으로 소비하지 말고 QStash 재시도를 유도해야 합니다.');
assert.doesNotMatch(refreshSource,/stepAlreadyRunning:true/,'lock 충돌을 200 성공으로 반환하던 실패 유발 경로가 없어야 합니다.');
assert.match(refreshSource,/snapshot_preflight_verified/,'task 상태와 무관하게 저장된 실행 원본을 먼저 확인해야 합니다.');
assert.match(refreshSource,/MAX_AUTOMATIC_ATTEMPTS = Math\.min\(3/,'자동 시도는 최대 3회로 제한해야 합니다.');
assert.match(jobsSource,/update-trends-v837/,'이전 QStash dedupe key와 분리해야 합니다.');
assert.match(versionSource,/contentVersion:\s*133/);
assert.match(versionSource,/trendCacheVersion:\s*52/);
assert.match(versionSource,/publicTopCount:\s*20/);

console.log('STELLATE v8.0.33 root-cause refresh tests: PASS');
