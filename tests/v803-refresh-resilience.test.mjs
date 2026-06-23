import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeDiscoverySeeds } from '../lib/trends.js';
import { assessTrendSetHealth } from '../lib/trendRefreshPolicy.js';

const approval={
  key:'성영탁현재상황',keyword:'성영탁',eventKey:'성영탁-현재-상황',approved:true,
  approvedAt:'2026-06-20T10:00:00.000Z',
  overrides:{topKeyword:'성영탁',topTopic:'경기 활약',category:'sports',searchQuery:'성영탁 경기 활약'},
};
const seeds=mergeDiscoverySeeds(
  [{keyword:'신입사원 강회장',rawKeyword:'신입사원 강회장',googleRank:1,trafficValue:10000,relatedNews:[]}],
  [approval],
  [],
  50,
);
assert.equal(seeds[0].keyword,'성영탁','관리자 승인 후보는 Google Trends 재등장 여부와 무관하게 최우선 조사 시드여야 합니다.');
assert.equal(seeds[0].manualSeed,true);
assert.ok(seeds.some(row=>row.keyword==='신입사원 강회장'));

const previousSeeds=mergeDiscoverySeeds([],[],[{
  keyword:'기존 이슈',topKeyword:'기존 이슈',sourceNewestAt:new Date().toISOString(),rank:1,
}],50);
assert.equal(previousSeeds.length,1,'최근 TOP은 콘텐츠 버전 재검증을 위해 다음 조사 후보에 포함되어야 합니다.');
assert.equal(previousSeeds[0].previousSeed,true);

const bootstrap=assessTrendSetHealth(Array.from({length:20},(_,i)=>({slug:`n${i}`,eventKey:`n${i}`})),[],{mergedCandidates:60,rejected:40},{consecutiveLow:0,targetCount:20});
assert.equal(bootstrap.healthy,true,'v8.0.4에서는 검증된 TOP 20개가 준비되어야 공개할 수 있어야 합니다.');
assert.equal(bootstrap.bootstrap,true);
const incomplete=assessTrendSetHealth([{slug:'one',eventKey:'one'}],[],{mergedCandidates:60,rejected:59},{consecutiveLow:0,targetCount:20});
assert.equal(incomplete.healthy,false,'30개 미만은 기존 TOP을 유지해야 합니다.');

const noReady=assessTrendSetHealth([],[],{mergedCandidates:10,rejected:10},{consecutiveLow:0});
assert.equal(noReady.healthy,false,'공개 준비 항목이 0건이면 갱신하면 안 됩니다.');


const trendSource=fs.readFileSync(new URL('../lib/trends.js',import.meta.url),'utf8');
assert.ok(trendSource.includes("if(!google.length&&!googleNews.length&&!naverNews.length&&!community.length&&!fallbackSeeds)"),'외부 발견 소스 장애 시에도 관리자 승인·직전 TOP 시드가 있으면 조사를 계속해야 합니다.');
assert.ok(trendSource.includes('usedFallbackSeeds:Boolean((googleTrendsError||googleNewsError||naverNewsError||communityError)&&merged.length)'),'대체 시드 사용 여부를 관리자 진단에 남겨야 합니다.');

const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
assert.ok(!Object.prototype.hasOwnProperty.call(vercel,'crons'),'외부 크론을 사용하므로 Vercel Cron 중복 설정이 없어야 합니다.');

console.log('v8.0.4 external cron refresh resilience tests passed');
