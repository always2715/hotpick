import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEditorialKeyword, validateTopCandidateKeyword } from '../lib/editorialTitle.js';
import { isLooseSameCandidate } from '../lib/top30Selection.js';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { writeDualRunSnapshot } from '../lib/runSnapshotStore.js';
import { classifyCandidateFailure } from '../lib/trendRefreshJob.js';
import { __setRedisClientForTests, getContent, saveTrendRunContentSnapshot } from '../lib/kv.js';

process.env.STELLATE_ALLOW_TEST_REDIS='true';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const source=relative=>fs.readFileSync(path.join(root,relative),'utf8');

// 운영 실패 로그에 등장한 광범위어·사건 동작 조각은 TOP25에 고정되면 안 됩니다.
assert.equal(validateTopCandidateKeyword('반도체').valid,false);
assert.equal(validateTopCandidateKeyword('가스 누출').valid,false);
assert.equal(validateTopCandidateKeyword('구조팀').valid,false);
assert.equal(validateEditorialKeyword('영주 SK스페셜티서').keyword,'영주 SK스페셜티','기업명 뒤에 붙은 축약 조사 조각을 제거해야 합니다.');
assert.equal(validateTopCandidateKeyword('영주 SK스페셜티 가스 누출').valid,false,'사건 동작을 섞은 문구 대신 대표 주체를 확정해야 합니다.');

const shared='https://news.example.com/incidents/123?utm_source=portal';
assert.equal(isLooseSameCandidate(
  {keyword:'영주 SK스페셜티',relatedArticles:[{url:shared}]},
  {keyword:'가스 누출',relatedArticles:[{url:'https://news.example.com/incidents/123?utm_medium=referral'}]},
),true,'동일 기사·사건에서 잘려 나온 후보는 한 후보로 중복 제거해야 합니다.');

// 저장된 구체 Fact가 충분하면 결정론적 복구문도 1,000자 이상을 구성할 수 있어야 합니다.
const sources=Array.from({length:16},(_,index)=>({
  id:`S${index+1}`,source:`공식확인기관${index+1}`,publisher:`공식확인기관${index+1}`,
  domain:`source${index+1}.example`,url:`https://source${index+1}.example/fact-${index+1}`,
  sourceType:index<2?'official':'trusted_news',
}));
const factTexts=[
  '시험사건은 2026년 6월 25일 오전 공장 내부 설비에서 이상 징후가 확인된 뒤 현장 안전 절차를 가동했다고 밝혔습니다.',
  '관계 기관은 최초 신고를 접수한 직후 소방 인력과 장비를 현장으로 보내 누출 여부와 주변 영향을 확인했습니다.',
  '현장 통제선은 작업 구역과 인접 통행 구간을 분리하는 방식으로 설정됐으며 관계자 외 출입이 제한됐습니다.',
  '사업장은 사고 직후 해당 설비의 가동을 중단하고 내부 비상대응 조직을 통해 작업자 현황을 점검했습니다.',
  '소방 당국은 측정 장비를 사용해 공장 안팎의 농도를 확인하고 추가 확산 가능성을 조사했다고 설명했습니다.',
  '지방자치단체는 주민 안내 체계를 가동해 확인된 상황과 행동 요령을 공식 채널을 통해 순차적으로 전달했습니다.',
  '현장에 있던 작업자는 지정된 대피 동선을 따라 이동했으며 인원 확인 절차가 별도로 진행됐습니다.',
  '관계 기관은 물질의 종류와 누출 지점, 설비 상태를 확인하기 위해 사업장 자료와 현장 기록을 함께 점검했습니다.',
  '사업장은 사고 설비 주변의 밸브와 배관을 차단하고 안전이 확인될 때까지 관련 공정을 재가동하지 않기로 했습니다.',
  '환경 측정은 공장 경계와 인근 지점에서 나눠 실시됐으며 측정 결과는 관계 기관의 검토를 거쳐 공개하기로 했습니다.',
  '현장 대응팀은 추가 누출을 막기 위한 임시 조치를 완료한 뒤 설비별 점검 순서를 정해 후속 확인을 진행했습니다.',
  '경찰과 소방 당국은 신고 시각, 초기 대응, 작업 절차를 확인해 사고 경위와 안전수칙 준수 여부를 조사했습니다.',
  '지방자치단체는 조사 결과와 주민 안전에 영향을 줄 수 있는 변동 사항이 확인되면 추가 안내를 제공할 예정입니다.',
  '사업장은 피해 현황과 복구 계획을 정리해 관계 기관에 제출하고 재발 방지 대책을 마련하겠다고 밝혔습니다.',
  '관계 기관은 현장 안전이 확인되기 전까지 통제 범위를 유지하며 작업자와 주민의 접근을 제한한다고 설명했습니다.',
  '후속 점검에서는 설비 결함 여부와 정비 이력, 비상 차단 장치 작동 기록을 함께 확인하는 절차가 예정돼 있습니다.',
];
const facts=factTexts.map((text,index)=>({
  id:`F${index+1}`,text,scope:'issue',subject:'시험사건',predicate:'확인했다',
  sourceIds:[`S${index+1}`],sourceType:index<2?'official':'trusted_news',status:'confirmed',
}));
const fallback=buildVerifiedFallback('시험사건',{version:3,sources,facts,confirmedFacts:facts.map(row=>row.id),uncertainties:[],conflicts:[]},36,'full');
assert.ok(fallback.blog.length>=1000,`충분한 Fact Ledger의 결정론적 복구 본문은 1,000자 이상이어야 합니다. actual=${fallback.blog.length}`);
assert.ok(!/귀추가 주목|관심이 커지고|출처에서 확인|자료를 기준으로 정리/.test(fallback.blog));

class MemoryRedis {
  constructor({failSet=0,failHset=0}={}){this.values=new Map();this.hashes=new Map();this.failSet=failSet;this.failHset=failHset;}
  async set(key,value){if(this.failSet-->0)throw new Error('temporary set failure');this.values.set(String(key),value);return 'OK';}
  async get(key){return this.values.get(String(key))??null;}
  async hset(key,object){
    if(this.failHset-->0)throw new Error('temporary hset failure');
    const name=String(key);const map=this.hashes.get(name)||new Map();
    for(const [field,value] of Object.entries(object||{}))map.set(String(field),value);
    this.hashes.set(name,map);return Object.keys(object||{}).length;
  }
  async hget(key,field){return this.hashes.get(String(key))?.get(String(field))??null;}
  async expire(){return 1;}
}

// 첫 Redis 쓰기가 동시에 실패해도 제한 재시도로 stage와 모든 alias를 남겨야 합니다.
const dualRedis=new MemoryRedis({failSet:1,failHset:1});
const stageKey='stellate:v7:publication_stage:run55:candidate55';
const snapshotKey='stellate:v7:cron:content:run55';
const serialized=JSON.stringify({slug:'test-event',candidateId:'candidate55',publicationStageId:'run55:candidate55'});
const dual=await writeDualRunSnapshot(dualRedis,{
  stageKey,snapshotKey,candidateId:'candidate55',aliases:['slug:test-event','stage:run55:candidate55'],serialized,retries:3,
});
assert.equal(dual.verified,true);
assert.ok(dual.attempts>=2,'첫 쓰기 장애 뒤 실제 재시도가 수행돼야 합니다.');
assert.deepEqual(new Set(dual.verifiedFields),new Set(['candidate55','slug:test-event','stage:run55:candidate55']));

// 외부 조사 전에 저장하는 최소 checkpoint도 candidate/slug/stage alias 전체가 확인돼야 합니다.
const checkpointRedis=new MemoryRedis();
__setRedisClientForTests(checkpointRedis);
const checkpoint=await saveTrendRunContentSnapshot('run-checkpoint','candidate-checkpoint',{
  slug:'checkpoint-event',candidateId:'candidate-checkpoint',publicationStageId:'run-checkpoint:candidate-checkpoint',
  keyword:'체크포인트 사건',displayTitle:'체크포인트 사건',status:'researching',visibility:'private',blog:'',
  card:{summary:'',why:'',points:[]},factLedger:{version:3,sources:[],facts:[],confirmedFacts:[],uncertainties:[],conflicts:[]},
},{stageId:'run-checkpoint:candidate-checkpoint',checkpoint:true});
assert.equal(checkpoint.stageCheckpoint,true);
const checkpointHash=checkpointRedis.hashes.get('stellate:v7:cron:content:run-checkpoint');
for(const field of ['candidate-checkpoint','slug:checkpoint-event','stage:run-checkpoint:candidate-checkpoint'])assert.ok(checkpointHash?.has(field),`${field} alias가 저장돼야 합니다.`);

// 실패한 live 콘텐츠가 있어도 마지막 정상 archive를 carryover에서 읽을 수 있어야 합니다.
const archiveRedis=new MemoryRedis();
archiveRedis.values.set('stellate:v7:content:previous-top',{slug:'previous-top',status:'failed',visibility:'private',blog:'',card:{summary:'',why:'',points:[]}});
const archiveMap=new Map();
archiveMap.set('previous-top',JSON.stringify({
  slug:'previous-top',status:'published',visibility:'published',contentMode:'trend_brief',
  topKeyword:'이전 정상 TOP',displayTitle:'이전 정상 TOP',feedTitle:'이전 정상 TOP · 마지막 정상 공개본',
  blog:'마지막 정상 공개 archive에 보존된 콘텐츠입니다. '.repeat(40),
  card:{summary:'이전 정상 TOP의 마지막 공개 내용을 확인할 수 있는 충분한 요약입니다.',why:'신규 콘텐츠 부족분을 안전하게 보충합니다.',points:['정상 공개본을 사용합니다.']},
  sourceItems:[],evidenceSources:[],relatedNews:[],relatedContent:[],
}));
archiveRedis.hashes.set('stellate:v7:feed:archive:contents',archiveMap);
__setRedisClientForTests(archiveRedis);
const archived=await getContent('previous-top');
assert.equal(archived?.status,'published');
assert.match(archived?.feedTitle||'',/마지막 정상 공개본/);

assert.equal(classifyCandidateFailure('피드 상세 본문 최소 1,000자 기준 미충족'),'CONTENT_BODY_TOO_SHORT');
assert.equal(classifyCandidateFailure('단일 후보 처리 후 실행별 stage·snapshot·slug alias가 모두 없음'),'RUN_STAGE_NOT_FOUND');

const refresh=source('lib/trendRefreshJob.js');
const api=source('lib/api.js');
const kv=source('lib/kv.js');
const header=source('components/Header.js');
const admin=source('pages/admin.js');
const version=source('pages/api/version.js');
const packageJson=JSON.parse(source('package.json'));
assert.match(refresh,/saveTrendRunContentSnapshot\(runId,taskId,[\s\S]+checkpoint:true/,'외부 조사 전 최소 checkpoint를 저장해야 합니다.');
assert.match(refresh,/lastRootCauseCode/);
assert.match(refresh,/attemptLimitCode:'KEYWORD_ATTEMPT_LIMIT'/,'시도 한도는 실제 오류 원인과 별도 필드로 저장해야 합니다.');
assert.match(refresh,/content=await getContent\(slug\)/,'carryover는 정상 공개 archive fallback이 가능한 조회를 사용해야 합니다.');
assert.doesNotMatch(refresh,/content=await getContent\(slug,\{includePrivate:true\}\)/);
assert.match(api,/\[최종 공개 피드 분량 보강\]/);
assert.match(api,/외부 검색을 다시 하지 말고/);
assert.match(kv,/aliasesVerified/);
assert.match(header,/📈 TOP20/);
assert.match(header,/📋 피드/);
assert.match(admin,/진단 코드/);
assert.match(admin,/lastRootCauseCode/);
assert.equal(packageJson.version,'8.0.56');
assert.match(version,/contentVersion:140/);
assert.match(version,/trendCacheVersion:57/);
assert.match(version,/carryoverArchiveFallbackV8055/);

console.log('STELLATE v8.0.55 refresh root-cause recovery tests: PASS');
