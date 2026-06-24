import assert from 'node:assert/strict';
import { stageMatchesTrend } from '../lib/stageIdentityPolicy.js';
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
  async del(...keys){for(const key of keys){this.values.delete(String(key));this.hashes.delete(String(key));}return keys.length;}
}

const runId='run-v8032';
const trend={
  slug:'hbm4-shipping-four-months',
  candidateId:'r1-hbm4',
  publicationStageId:'run-v8032:r1-hbm4',
  keyword:'HBM4 출하 4개월만',
  topKeyword:'HBM4 출하 4개월만',
  displayTitle:'HBM4 출하 4개월만',
  rank:1,
};
const content={
  slug:trend.slug,
  candidateId:trend.candidateId,
  publicationStageId:trend.publicationStageId,
  contentVersion:130,
  topKeyword:'HBM4',
  keyword:'HBM4',
  displayTitle:'HBM4',
};

assert.equal(
  stageMatchesTrend(content,trend,runId,0,130),
  true,
  '전체 검색어와 생성된 대표 키워드가 달라도 candidateId/publicationStageId가 같으면 동일 stage로 인정해야 합니다.',
);

const idlessSameSlug={...content,candidateId:'',publicationStageId:'',topKeyword:'HBM4'};
assert.equal(stageMatchesTrend(idlessSameSlug,trend,runId,0,130),true,'레거시 콘텐츠도 같은 slug와 대표 키워드 포함 관계면 복구할 수 있어야 합니다.');

const unrelated={...content,candidateId:'r99-other',publicationStageId:'other-run:r99-other',slug:'other-topic',topKeyword:'다른 키워드'};
assert.equal(stageMatchesTrend(unrelated,trend,runId,0,130),false,'식별자와 slug가 모두 다른 콘텐츠는 거부해야 합니다.');
assert.equal(stageMatchesTrend({...content,contentVersion:129},trend,runId,0,130),false,'이전 콘텐츠 버전은 재사용하면 안 됩니다.');

const redis=new MemoryRedis();
const stageKey=`stellate:v7:publication_stage:${trend.publicationStageId}`;
const snapshotKey=runSnapshotKey('stellate:v7',runId);
const serialized=JSON.stringify({...content,blog:'검증된 실행 원본'});
const first=await writeDualRunSnapshot(redis,{stageKey,snapshotKey,candidateId:trend.candidateId,serialized});
assert.equal(first.verified,true,'stage와 run snapshot 중 하나 이상이 실제 저장되어야 합니다.');
assert.equal(JSON.parse(await redis.get(stageKey)).slug,trend.slug,'publication stage를 저장해야 합니다.');
assert.equal(JSON.parse(await redis.hget(snapshotKey,trend.candidateId)).slug,trend.slug,'durable run snapshot을 저장해야 합니다.');

await redis.del(stageKey);
assert.equal(await redis.get(stageKey),null,'테스트를 위해 stage 키를 삭제합니다.');
assert.equal(JSON.parse(await redis.hget(snapshotKey,trend.candidateId)).slug,trend.slug,'stage가 사라져도 실행별 원본은 남아야 합니다.');

// 반대 상황도 self-heal 되는지 확인합니다.
redis.hashes.get(snapshotKey)?.delete(trend.candidateId);
const healed=await writeDualRunSnapshot(redis,{stageKey,snapshotKey,candidateId:trend.candidateId,serialized});
assert.equal(healed.verified,true);
assert.equal(JSON.parse(await redis.hget(snapshotKey,trend.candidateId)).slug,trend.slug,'한쪽 저장소만 남은 경우 다른 쪽을 복구해야 합니다.');

console.log('STELLATE v8.0.32 compatibility identity and dual snapshot tests: PASS');
