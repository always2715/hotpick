import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { applyRankMovements } from '../lib/rankMovement.js';

const sourceRows=Array.from({length:5},(_,index)=>({
  id:`S${index+1}`,source:`확인기관${index+1}`,publisher:`확인기관${index+1}`,
  domain:`source${index+1}.example`,url:`https://source${index+1}.example/item`,link:`https://source${index+1}.example/item`,
  sourceType:index===0?'official':'trusted_news',
}));
const factTexts=[
  '테스트주제는 신규 정책 시행 계획을 발표했습니다.',
  '테스트주제는 신청 절차 변경 내용을 공개했습니다.',
  '테스트주제는 적용 대상을 공개된 기준에 따라 구분했습니다.',
  '테스트주제는 시행 전 세부 안내를 추가 공개할 예정입니다.',
  '테스트주제는 신청자가 공식 안내에서 적용 조건을 확인해야 한다고 밝혔습니다.',
];
const facts=factTexts.map((text,index)=>({
  id:`F${index+1}`,text,scope:'issue',subject:'테스트주제',predicate:'발표했다',
  sourceIds:[`S${index+1}`],sourceType:index===0?'official':'trusted_news',status:'confirmed',
}));
const fallback=buildVerifiedFallback('테스트주제',{
  version:3,sources:sourceRows,facts,confirmedFacts:facts.map(row=>row.id),uncertainties:[],conflicts:[],
},36,'full');
assert.ok(fallback.blog.length>=1000,`5개 구체 Fact fallback은 최소 1,000자를 구성해야 합니다. actual=${fallback.blog.length}`);
assert.ok(!/관심이 커지고|귀추가 주목|향후 전망/.test(fallback.blog),'분량 복구에 빈 일반론을 넣으면 안 됩니다.');

const previous=[
  {rank:1,slug:'lee-jae-yong',topKeyword:'이재용',eventKey:'event-samsung-chairman'},
  {rank:2,slug:'nasdaq-close',topKeyword:'나스닥'},
  {rank:3,slug:'old-topic',topKeyword:'기존 이슈'},
];
const next=applyRankMovements([
  {slug:'nasdaq-market',topKeyword:'나스닥'},
  {slug:'brand-new',topKeyword:'신규 이슈'},
  {slug:'lee-new-slug',topKeyword:'이재용',eventKey:'event-samsung-chairman'},
],previous);
assert.equal(next[0].previousRank,2);
assert.equal(next[0].rankChange,1);
assert.equal(next[0].movementStatus,'up');
assert.equal(next[1].previousRank,null);
assert.equal(next[1].movementStatus,'new');
assert.equal(next[1].badge,'NEW');
assert.equal(next[2].previousRank,1);
assert.equal(next[2].rankChange,-2);
assert.equal(next[2].movementStatus,'down');

const refreshSource=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const apiSource=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const kvSource=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
assert.match(apiSource,/stageDraftSavedAt/,'최종 검증 전에 실행별 stage 초안을 저장해야 합니다.');
assert.match(refreshSource,/same_attempt_fact_recovery/,'같은 시도에서 Fact Ledger stage 복구를 수행해야 합니다.');
assert.match(refreshSource,/TOP_KEYWORD_MAX_ATTEMPTS\|\|5/,'관리자 명시적 재개는 최대 5회까지 허용해야 합니다.');
assert.match(kvSource,/applyRankMovements\(trends,currentTop\)/,'공개 직전 이전 공개 TOP과 순위변동을 다시 계산해야 합니다.');

console.log('v8.0.47 generation recovery and rank movement tests passed');
