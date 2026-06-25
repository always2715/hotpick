import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PUBLIC_TOP_COUNT, TOP_GENERATION_POOL_COUNT, TOP_POLICY_VERSION } from '../lib/topConfig.js';
import { prepareSelectedTopCandidates } from '../lib/candidateIdentity.js';
import { selectStableTop30 } from '../lib/top30Selection.js';
import { sanitizeFactLedgerForPublication, isGenericFactText } from '../lib/contentAccuracy.js';
import { publicContentRejectionReasons } from '../lib/publicationPolicy.js';

assert.equal(PUBLIC_TOP_COUNT,20,'공개 TOP 수는 20이어야 합니다.');
assert.equal(TOP_POLICY_VERSION,'ranked_candidate_pool_v17_top20_from25');

const selected=prepareSelectedTopCandidates(
  Array.from({length:25},(_,index)=>({slug:`topic-${index+1}`,keyword:`키워드 ${index+1}`,displayTitle:`키워드 ${index+1}`})),
  'run-v8031',
  TOP_GENERATION_POOL_COUNT,
);
assert.equal(selected.length,25,'생성 후보 확정은 정확히 TOP25여야 합니다.');
assert.equal(new Set(selected.map(row=>row.candidateId)).size,25,'TOP25 candidateId가 고유해야 합니다.');
assert.ok(selected.every(row=>row.publicationStageId.startsWith('run-v8031:')),'실행별 stage id를 생성해야 합니다.');

const stableSelection=selectStableTop30(Array.from({length:25},(_,index)=>({
  keyword:`검증키워드${index+1}`,topKeyword:`검증키워드${index+1}`,topTopic:`확인 사건 ${index+1}`,
  candidateType:'event',causeStatus:'confirmed',rankingScore:100-index,keywordConfidence:90,eventCoherence:85,
  independentSources:2,officialSources:1,interestSignals:['search','news'],rankingComponents:{search:12,newsVelocity:8},
  category:index%2?'tech':'entertainment',eventSignatures:[`event-${index+1}`],
})));
assert.equal(stableSelection.rows.length,25,'선정 함수의 기본값은 TOP25 생성 후보 풀이어야 합니다.');
assert.equal(stableSelection.diagnostics.target,25);

const ledger={
  sources:[{id:'S1',url:'https://example.com/report',sourceType:'official'}],
  facts:[
    {id:'F1',text:'상태 변화가 확인됐습니다.',status:'confirmed',sourceIds:['S1']},
    {id:'F2',text:'학교법인은 6월 23일 총장 불신임 안건의 표결 결과를 공개했습니다.',status:'confirmed',sourceIds:['S1']},
  ],
  confirmedFacts:[
    {id:'F1',text:'상태 변화가 확인됐습니다.',status:'confirmed',sourceIds:['S1']},
    {id:'F2',text:'학교법인은 6월 23일 총장 불신임 안건의 표결 결과를 공개했습니다.',status:'confirmed',sourceIds:['S1']},
  ],
  conflicts:[],
};
const sanitized=sanitizeFactLedgerForPublication(ledger);
assert.equal(sanitized.facts.length,1,'일반화 Fact는 저장 전에 제거해야 합니다.');
assert.equal(sanitized.facts[0].id,'F2');
assert.equal(sanitized.genericFactsRemoved,1);
assert.equal(isGenericFactText(sanitized.facts[0].text),false);

const genericOnly={
  contentVersion:131,status:'published',visibility:'published',contentMode:'detailed',contentType:'detailed',hasContent:true,
  topKeyword:'테스트',topTopic:'구체 사건 내용',topTitle:'테스트 · 구체 사건 내용',feedTitle:'테스트 사건의 구체적인 진행 상황 정리',
  card:{summary:'확인된 공식 자료를 토대로 구체적인 사건 내용과 현재 진행 상황을 정리했습니다.'},blog:'충분한 상세 본문입니다.'.repeat(20),
  factLedger:{sources:[{id:'S1',url:'https://example.com',sourceType:'official'}],facts:[{id:'F1',text:'상태 변화가 확인됐습니다.',status:'confirmed',sourceIds:['S1']}]},
  evidenceSources:[{id:'S1',link:'https://example.com',sourceType:'official',domain:'example.com'}],
  accuracyValidation:{passed:true},groundingScore:100,titleReady:true,titleStatus:'ready',contentGrade:'B',copyrightRisk:{passed:true},
};
assert.ok(publicContentRejectionReasons(genericOnly).some(reason=>reason.includes('일반화된 Fact')),'일반화 Fact가 남은 콘텐츠는 공개하면 안 됩니다.');

const refreshSource=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const apiSource=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const kvSource=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
const adminSource=fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
const adminActionSource=fs.readFileSync(new URL('../pages/api/admin-action.js',import.meta.url),'utf8');
const versionSource=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');

assert.match(refreshSource,/TARGET_TOP_COUNT = PUBLIC_TOP_COUNT/);
assert.match(refreshSource,/top20_new_run_required/,'기존 TOP30 실행을 TOP20으로 잘못 재개하지 않아야 합니다.');
assert.match(refreshSource,/legacy_slug_stage/,'레거시 slug stage 복구 경로를 유지해야 합니다.');
assert.match(refreshSource,/saveTrendRunContentSnapshot/,'실행별 콘텐츠를 durable snapshot으로 이중 저장해야 합니다.');
assert.doesNotMatch(refreshSource,/fixedTop30:\s*true/,'신규 TOP20 후보에 과거 TOP30 플래그를 다시 저장하면 안 됩니다.');
assert.match(apiSource,/requestedStageId/,'콘텐츠 생성 내부에서 실행별 stage를 직접 저장해야 합니다.');
assert.match(apiSource,/source_signature_unchanged/,'출처 지문이 같아 기존 콘텐츠를 재사용해도 실행별 stage를 저장해야 합니다.');
assert.match(apiSource,/sanitizeFactLedgerForPublication/,'일반화 Fact 제거를 적용해야 합니다.');
assert.match(apiSource,/\[\.\.\.directEvidence,\.\.\.ledgerEvidence\]/,'직접 출처가 일부 손상돼도 Ledger 출처를 함께 사용해야 합니다.');
assert.match(kvSource,/trends\.length !== PUBLIC_TOP_COUNT/,'TOP 저장과 공개 수를 중앙 설정으로 검증해야 합니다.');
assert.match(adminSource,/성공 후보 상위 20개 공개|공개 목표 20/,'관리자 안내가 공개 TOP20이어야 합니다.');
assert.doesNotMatch(adminSource,/TOP 키워드 30개|31위 이하 후보/,'관리자 화면에 TOP30 기준이 남으면 안 됩니다.');
assert.match(adminActionSource,/needsFixedTop20Migration/,'이전 실행 재개를 차단해야 합니다.');
assert.match(versionSource,/publicTopCount:20/);
assert.match(versionSource,/contentVersion:137/);
assert.match(versionSource,/trendCacheVersion:54/);

console.log('STELLATE v8.0.31 TOP20 and stage durability tests: PASS');
