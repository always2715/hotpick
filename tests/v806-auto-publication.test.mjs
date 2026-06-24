import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAutomaticPublicationReady, automaticPublicationRejectionReasons } from '../lib/publicationPolicy.js';
import { TOP_RESEARCH_POOL_LIMIT, TOP_DISCOVERY_POOL_LIMIT } from '../lib/trends.js';
import { decidePublication } from '../lib/contentPolicy.js';

const candidate={
  status:'published',visibility:'published',reviewRequired:false,contentMode:'detailed',contentType:'detailed',hasContent:true,
  topKeyword:'카카오',topTopic:'서비스 장애 복구',topTitle:'카카오 · 서비스 장애 복구',displayTitle:'카카오 · 서비스 장애 복구',feedTitle:'카카오 · 서비스 장애 복구',detailTitle:'카카오 · 서비스 장애 복구',titleStatus:'ready',titleReady:true,
  blog:'## 키워드 한눈에 보기\n검증된 사실을 정리했습니다.',
  card:{summary:'카카오가 서비스 장애 복구와 후속 점검 일정을 발표했습니다. 복수의 검증 자료에서 공통으로 확인된 핵심 내용을 정리했습니다.',points:['장애 발생','복구 완료','후속 점검']},
  groundingScore:85,copyrightRisk:{passed:true},
  evidenceSources:[{sourceType:'trusted_news',domain:'a.example'},{sourceType:'trusted_news',domain:'b.example'}],
  factLedger:{facts:[{id:'F1',status:'confirmed'},{id:'F2',status:'confirmed'},{id:'F3',status:'confirmed'}]},
  publicationDecision:{publishable:true,reasons:[]},
};
assert.equal(isAutomaticPublicationReady(candidate),true,'검증형 fallback은 별도 관리자 승인 없이 자동 공개되어야 합니다.');
assert.deepEqual(automaticPublicationRejectionReasons(candidate),[]);

const facts=[
  {id:'F1',text:'카카오가 서비스 장애 복구를 완료했습니다.',status:'confirmed',sourceType:'trusted_news',sourceIds:['S1','S2']},
  {id:'F2',text:'카카오는 후속 점검 일정을 안내했습니다.',status:'confirmed',sourceType:'trusted_news',sourceIds:['S1','S2']},
  {id:'F3',text:'서비스 이용은 현재 정상화된 상태입니다.',status:'confirmed',sourceType:'trusted_news',sourceIds:['S1','S2']},
];
const fallbackDecision=decidePublication({
  content:{
    aiStatus:'verified_fallback',contentTier:'standard',
    topKeyword:'카카오',topTopic:'서비스 장애 복구',topTitle:'카카오 · 서비스 장애 복구',displayTitle:'카카오 · 서비스 장애 복구',feedTitle:'카카오 · 서비스 장애 복구',detailTitle:'카카오 · 서비스 장애 복구',titleStatus:'ready',titleReady:true,
    blog:facts.map(f=>f.text).join(' '),claimMap:facts.map(f=>({text:f.text,claimIds:[f.id]})),
    card:{summary:facts[0].text,why:facts[1].text,points:facts.map(f=>f.text)},qa:[],instagramCards:[],
  },
  sourceItems:[
    {id:'S1',sourceType:'trusted_news',domain:'a.example',link:'https://a.example/1',title:'첫 번째 보도',evidenceUsable:true,contentUsable:true},
    {id:'S2',sourceType:'trusted_news',domain:'b.example',link:'https://b.example/2',title:'두 번째 보도',evidenceUsable:true,contentUsable:true},
  ],
  ledger:{facts,conflicts:[]},qualityScore:50,category:'tech',
});
assert.equal(fallbackDecision.publishable,true,'근거가 연결된 fallback은 자동 공개 판정을 받아야 합니다.');
assert.equal(fallbackDecision.reviewRequired,false);

assert.equal(TOP_RESEARCH_POOL_LIMIT,120);
assert.equal(TOP_DISCOVERY_POOL_LIMIT,240);

const apiSource=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(apiSource,/const TREND_CACHE_VERSION = 52/);
assert.match(apiSource,/export const CONTENT_VERSION = 133/);
assert.match(apiSource,/isAutomaticPublicationReady\(stageCandidate\)\|\|fixedTopReady/);
assert.doesNotMatch(apiSource,/stageOnly[\s\S]{0,700}validateContent\(candidate\)/,'stageOnly auto publication must not be blocked by legacy validateContent');
const trendsSource=fs.readFileSync(new URL('../lib/trends.js',import.meta.url),'utf8');
assert.match(trendsSource,/fetchNaverNewsDiscovery/);
assert.match(trendsSource,/naverNewsCandidates/);
const adminSource=fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
assert.match(adminSource,/CURRENT_CONTENT_VERSION=133/);
assert.match(adminSource,/const latestRun=runs\[0\]/);
console.log('v8.0.6 automatic publication and current-state tests passed');
