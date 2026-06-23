import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessFeedDuplicateRisk, assessResearchBackedFeedSet } from '../lib/feedSetQuality.js';

const template=(keyword,fact,url)=>({
  topKeyword:keyword,
  keyword,
  feedTitle:`${keyword} · 확인된 핵심 내용`,
  topTitle:`${keyword} · 확인된 핵심 내용`,
  blog:`## ${keyword}는 어떤 주제인가\n${fact} 확인된 자료를 기준으로 핵심 내용을 정리했습니다.\n## 확인된 핵심 내용\n공식 자료와 신뢰할 수 있는 출처에서 확인되는 내용을 중심으로 설명합니다.\n## STELLATE 인사이트\n확인된 사실과 향후 확인할 지점을 구분해 살펴볼 필요가 있습니다.`,
  fingerprint:`fp-${keyword}`,
  factLedger:{facts:[{id:'F1',text:fact,sourceIds:['S1'],status:'confirmed'}],sources:[{id:'S1',url,sourceType:'official'}],conflicts:[]},
  evidenceSources:[{id:'S1',link:url,sourceType:'official',domain:new URL(url).hostname}],
  sourceItems:[{id:'S1',link:url,sourceType:'official',domain:new URL(url).hostname}],
  status:'published',visibility:'published',contentMode:'detailed',contentType:'detailed',hasContent:true,
  titleReady:true,titleStatus:'ready',card:{feedTitle:`${keyword} · 확인된 핵심 내용`,summary:`${fact} 확인된 자료를 중심으로 핵심 정보를 상세하게 정리했습니다.`},
  contentGrade:'B',groundingScore:80,copyrightRisk:{passed:true,maxSimilarity:0,longPhraseMatches:0},
  candidateType:'event',causeStatus:'confirmed',topTopic:'확인된 핵심 내용',contentVersion:125,
});

const left=template('키워드A','키워드A의 공식 일정이 공개됐습니다.','https://a.example.com/official');
const right=template('키워드B','키워드B의 공식 제품 정보가 공개됐습니다.','https://b.example.com/official');
const structural=assessFeedDuplicateRisk(left,right);
assert.equal(structural.structuralSimilarity,true,'공통 문서 구조는 유사 경고로 탐지할 수 있어야 합니다.');
assert.equal(structural.severe,false,'키워드·사실·출처가 다른 문서는 구조가 비슷해도 탈락시키면 안 됩니다.');

const copied={...left};
const severe=assessFeedDuplicateRisk(left,copied);
assert.equal(severe.severe,true,'동일 fingerprint와 본문을 재사용한 실제 중복은 차단해야 합니다.');

const rows=Array.from({length:30},(_,index)=>template(`키워드${index+1}`,`키워드${index+1}에 대한 공식 확인 사실입니다.`,`https://source${index+1}.example.com/official`));
const quality=assessResearchBackedFeedSet(rows,30);
assert.equal(quality.count,30);
assert.equal(quality.severeDuplicatePairCount,0);
assert.equal(quality.healthy,true,'구조가 비슷한 30개 정상 피드는 모두 유지돼야 합니다.');

const job=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
const finalize=job.slice(job.indexOf('export async function finalizeTrendRefreshRun'),job.indexOf('export async function executeTrendRefreshRun'));

assert.match(job,/repairIncompleteStagesLocally/);
assert.match(job,/buildFactBasedStageCandidate/);
assert.doesNotMatch(job,/duplicateReady/,'구조 유사 항목을 ready 목록에서 제거하면 다시 28\/30이 됩니다.');
assert.doesNotMatch(job,/duplicate_feed_body/,'단순 본문 토큰 유사도를 개별 탈락 사유로 사용하면 안 됩니다.');
assert.doesNotMatch(finalize,/getCachedContent\(/,'최종 복구는 외부 검색·AI 재생성을 호출하면 안 됩니다.');
assert.doesNotMatch(finalize,/processTrendCandidate\(/,'최종 복구는 반복 검색 루프를 다시 시작하면 안 됩니다.');
assert.match(finalize,/repairIncompleteStagesLocally/);
assert.match(finalize,/미완료 항목/,'실패 시 실제 키워드와 원인을 표시해야 합니다.');
assert.match(api,/id:row\?\.id\|\|`F\$\{index\+1\}`/,'Fact ID 누락 때문에 로컬 복구가 실패하면 안 됩니다.');
assert.match(api,/excludedConflicts:originalConflicts/,'충돌 사실은 본문에서 제외하되 진단 정보는 보존해야 합니다.');
assert.match(version,/completionRecovery/);

console.log('STELLATE v8.0.28 TOP30 completion recovery tests: PASS');
