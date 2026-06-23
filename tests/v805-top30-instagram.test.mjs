import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TOP_TARGET_COUNT,
  TOP_RESEARCH_POOL_LIMIT,
  TOP_DISCOVERY_POOL_LIMIT,
  extractNewsDiscoveryKeyword,
} from '../lib/trends.js';
import { selectVisibleTrendPool } from '../lib/trendSelectionPolicy.js';
import { assessTrendSetHealth } from '../lib/trendRefreshPolicy.js';

assert.equal(TOP_TARGET_COUNT,30);
assert.equal(TOP_RESEARCH_POOL_LIMIT,120);
assert.equal(TOP_DISCOVERY_POOL_LIMIT,240);
assert.equal(extractNewsDiscoveryKeyword('[속보] 삼성전자 신제품 공개 - 연합뉴스'),'삼성전자');

const candidates=Array.from({length:60},(_,i)=>({
  keyword:`후보 ${i+1}`,
  rawKeyword:`후보 ${i+1}`,
  topKeyword:`후보 ${i+1}`,
  topTopic:'공식 발표',
  title:`후보 ${i+1} 공식 발표`,
  displayTitle:`후보 ${i+1} · 공식 발표`,
  eventKey:`event-${i+1}`,
  grade:'B',
  publicEligible:true,
  visibility:'published',
  mainVisible:true,
  sourceCount:2,
  officialSources:1,
  independentSources:2,
  eventConsistency:80,
  categoryConfidence:.8,
  category:'general',
  eventType:'announcement',
}));
const selected=selectVisibleTrendPool(candidates,{limit:90});
assert.equal(selected.length,60,'입력된 60개 후보는 10개로 잘리지 않아야 합니다.');

const ready30=assessTrendSetHealth(candidates.slice(0,30),[],{mergedCandidates:60},{targetCount:30});
assert.equal(ready30.healthy,true);
const ready29=assessTrendSetHealth(candidates.slice(0,29),[],{mergedCandidates:60},{targetCount:30});
assert.equal(ready29.healthy,false);
assert.equal(ready29.incompleteTarget,true);

const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
assert.ok(!Object.prototype.hasOwnProperty.call(vercel,'crons'),'외부 크론 사용 시 Vercel Cron을 중복 등록하면 안 됩니다.');

const css=fs.readFileSync(new URL('../styles/globals.css',import.meta.url),'utf8');
assert.match(css,/\.instagram-picker\{display:grid!important;grid-template-columns:minmax\(0,1fr\)!important/);
assert.match(css,/\.instagram-picker button\{width:100%!important;[^}]*white-space:normal!important/);

const statusSource=fs.readFileSync(new URL('../pages/api/admin/status.js',import.meta.url),'utf8');
assert.ok(statusSource.includes("cronMode:'external'"));
const jobSource=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(jobSource,/TARGET_TOP_COUNT\s*=\s*30/);
assert.match(jobSource,/RESEARCH_POOL_LIMIT\s*=\s*30/);
assert.ok(jobSource.includes("top30_fixed_content_incomplete"));
assert.doesNotMatch(jobSource,/carryoverMigratedFrom|validCarryoverRows|combinePublicationRows/);

console.log('v8.0.5 TOP30 and vertical Instagram tests passed');

const trendsSource = fs.readFileSync(new URL('../lib/trends.js',import.meta.url),'utf8');
assert.match(trendsSource, /google_trends_related_news/, 'Google Trends related news should expand discovery candidates');
assert.match(trendsSource, /TOP_DISCOVERY_POOL_LIMIT,Number\(limit\|\|50\)/, 'discovery merge should retain up to the configured discovery limit');
const adminSource = fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
assert.match(adminSource, /instagramSearch/, 'instagram search should be available');
assert.match(adminSource, /INSTAGRAM_PAGE_SIZE=10/, 'instagram list should paginate by ten');
assert.match(adminSource, /setFeed\(fd\.items\|\|\[\]\)/, 'admin feed state should refresh without full reload');
const apiSource = fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(apiSource, /verified_fallback/, 'verified fallback should be supported');
assert.doesNotMatch(apiSource, /AI fallback 결과는 자동 공개하지 않습니다/, 'verified fallback must not be blocked solely because Claude was unavailable');

assert.match(adminSource, /\(trends\|\|\[\]\)\.slice\(0,30\)/, 'instagram should include all current TOP30 items');
