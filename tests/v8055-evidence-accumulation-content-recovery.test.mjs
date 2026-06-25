import assert from 'node:assert/strict';
import { validateTopCandidateKeyword } from '../lib/editorialTitle.js';
import { researchCandidateEntryRejectionReasons } from '../lib/trendSelectionPolicy.js';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { buildResearchEventQueries, mergeResearchLedgers } from '../lib/researchEvidenceMerge.js';
import { buildIndependentResearchTrend } from '../lib/trendRefreshJob.js';
import { isPreviousTopCarryoverContentReady } from '../lib/partialTopPublication.js';

assert.equal(validateTopCandidateKeyword('급등해').valid,false,'서술어 조각은 TOP 후보가 될 수 없습니다.');
assert.equal(validateTopCandidateKeyword('최소 164명').valid,false,'수량만 남은 기사 조각은 TOP 후보가 될 수 없습니다.');
assert.ok(researchCandidateEntryRejectionReasons({keyword:'급등해',displayTitle:'급등해'}).length>0);
assert.ok(researchCandidateEntryRejectionReasons({keyword:'최소 164명',displayTitle:'최소 164명'}).length>0);

const queries=buildResearchEventQueries('ETF',[
  '비트코인 현물 ETF 승인 기대에 시장 거래량 증가 - 샘플뉴스',
  '금융당국, 가상자산 ETF 제도 검토 일정 공개 | 경제신문',
],'시장·가격 변동');
assert.ok(queries.length>=1);
assert.match(queries[0],/ETF/);
assert.match(queries.join(' '),/비트코인|현물|승인|가상자산|제도/);
assert.doesNotMatch(queries.join(' '),/샘플뉴스|경제신문/);

const ledgerA={
  version:4,topicTitle:'테스트 정책',
  sources:[
    {id:'S1',url:'https://example.com/a',domain:'example.com',sourceType:'trusted_news'},
    {id:'S2',url:'https://official.example.org/b',domain:'official.example.org',sourceType:'official'},
  ],
  facts:[
    {id:'F1',text:'테스트 정책은 6월 25일 국회 위원회에서 심사 일정이 확정됐습니다.',scope:'issue',sourceIds:['S1'],sourceType:'trusted_news',status:'single_source'},
    {id:'F2',text:'위원회는 적용 대상과 시행 시기를 별도 조항으로 구분했습니다.',scope:'issue',sourceIds:['S2'],sourceType:'official',status:'confirmed'},
  ],confirmedFacts:['F2'],uncertainties:[],conflicts:[],
};
const ledgerB={
  version:4,topicTitle:'테스트 정책',
  sources:[
    {id:'A1',url:'https://official.example.org/b',domain:'official.example.org',sourceType:'official'},
    {id:'A2',url:'https://example.net/c',domain:'example.net',sourceType:'trusted_news'},
  ],
  facts:[
    {id:'A1F',text:'위원회는 적용 대상과 시행 시기를 별도 조항으로 구분했습니다.',scope:'issue',sourceIds:['A1'],sourceType:'official',status:'confirmed'},
    {id:'A2F',text:'후속 회의에서는 예외 대상과 신청 절차를 추가로 논의하기로 했습니다.',scope:'issue',sourceIds:['A2'],sourceType:'trusted_news',status:'single_source'},
  ],confirmedFacts:['A1F'],uncertainties:['일부 세부 일정은 확정 전입니다.'],conflicts:[],
};
const merged=mergeResearchLedgers(ledgerA,ledgerB,'테스트 정책');
assert.equal(merged.sources.length,3,'재시도별 출처는 URL 기준으로 누적·중복 제거돼야 합니다.');
assert.equal(merged.facts.length,3,'재시도별 Fact는 누적하되 같은 사실은 중복 제거돼야 합니다.');
assert.equal(merged.mergedResearchAttempts,2);

const richSources=Array.from({length:14},(_,index)=>({
  id:`S${index+1}`,url:`https://news${index+1}.example.com/item`,domain:`news${index+1}.example.com`,sourceType:index===0?'official':'trusted_news',source:`자료${index+1}`,
}));
const richFacts=Array.from({length:14},(_,index)=>({
  id:`F${index+1}`,
  text:`테스트 제도 세부 항목 ${index+1}은 적용 대상 ${index+1}번과 처리 절차 ${index+1}단계를 구분하며, 시행 일정과 신청 조건을 각각 명시했습니다.`,
  scope:'issue',sourceIds:[`S${index+1}`],sourceType:index===0?'official':'trusted_news',status:index===0?'confirmed':'single_source',confidence:0.9,
}));
const fallback=buildVerifiedFallback('테스트 제도',{version:4,topicTitle:'테스트 제도',sources:richSources,facts:richFacts,confirmedFacts:['F1'],uncertainties:[],conflicts:[]},36,'standard');
assert.ok(fallback.blog.length>=1000,`충분한 Fact가 있으면 검증형 fallback도 최소 1,000자를 구성해야 합니다. actual=${fallback.blog.length}`);
assert.doesNotMatch(fallback.blog,/출처에서 확인|자료를 기준으로|동명이인|원문|후속 공지/);

const prior={factLedger:ledgerA,evidenceSources:[{link:'https://example.com/a',title:'기존 조사',description:'기존 조사 설명'}]};
const research=buildIndependentResearchTrend({keyword:'ETF',topKeyword:'ETF',rawKeyword:'ETF',slug:'etf',rank:1,researchAttempt:2,priorResearchCheckpoint:prior,relatedArticles:[{title:'비트코인 현물 ETF 승인 일정 공개'}]},0);
assert.equal(research.priorResearchCheckpoint,prior,'재시도는 이전 조사 체크포인트를 다음 조사에 전달해야 합니다.');
assert.ok(research.sourceTitleHints.length===1);

assert.equal(isPreviousTopCarryoverContentReady({status:'published',visibility:'published',feedTitle:'기존 정상 피드',card:{summary:'기존에 정상 공개된 요약 정보가 충분히 남아 있습니다.'},blog:'가'.repeat(350)}),true,'기존 정상 공개본은 새 길이 정책과 무관하게 혼합 공개 보충에 사용할 수 있어야 합니다.');
assert.equal(isPreviousTopCarryoverContentReady({status:'failed',visibility:'private',feedTitle:'실패',card:{summary:'요약 정보가 충분히 남아 있습니다.'},blog:'가'.repeat(350)}),false);

const apiSource=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../lib/api.js',import.meta.url),'utf8'));
assert.match(apiSource,/mergeResearchLedgers\(bundle\.factLedger,priorCheckpoint\.factLedger\|\|\{\},topicTitle\)/);
assert.match(apiSource,/eventQueries\[0\]\|\|topicTitle/);
const refreshSource=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8'));
assert.match(refreshSource,/priorResearchCheckpoint:compactPriorCheckpoint/);

console.log('STELLATE v8.0.55 evidence accumulation and content recovery tests: PASS');
