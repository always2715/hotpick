import assert from 'node:assert/strict';
import {
  resolveEditorialKeyword,
  validateEditorialEventTitle,
  derivePostResearchTitle,
  extractEventPhraseFromText,
} from '../lib/editorialTitle.js';
import { decidePublication } from '../lib/contentPolicy.js';

const keywordSentence=resolveEditorialKeyword({
  topKeyword:'삼성전자 주가가 크게 상승한 이유',
  rawKeyword:'삼성전자 주가가 크게 상승한 이유',
  candidateTerms:['삼성전자'],
});
assert.equal(keywordSentence.ok,true);
assert.equal(keywordSentence.keyword,'삼성전자');

const productKeyword=resolveEditorialKeyword({rawKeyword:'아이폰 18 공개 소식'});
assert.equal(productKeyword.keyword,'아이폰 18');

const personKeyword=resolveEditorialKeyword({rawKeyword:'손흥민 결승 진출 소식'});
assert.equal(personKeyword.keyword,'손흥민');

assert.equal(validateEditorialEventTitle('현재 상황',{keyword:'삼성전자'}).valid,false);
assert.equal(validateEditorialEventTitle('수치 변화',{keyword:'삼성전자'}).valid,false);
assert.equal(validateEditorialEventTitle('결승 진출 확정',{keyword:'손흥민'}).valid,true);

const pregnancyLedger={
  facts:[
    {id:'F1',text:'앤 해서웨이가 셋째 아이 임신 소식을 직접 발표했다.',subject:'앤 해서웨이',status:'confirmed',sourceIds:['S1','S2']},
    {id:'F2',text:'출산 예정일과 아이의 성별은 공개되지 않았다.',subject:'앤 해서웨이',status:'single_source',sourceIds:['S1']},
  ],
  sources:[{id:'S1',sourceType:'trusted_news'},{id:'S2',sourceType:'trusted_news'}],
  conflicts:[],uncertainties:[],
};
assert.equal(extractEventPhraseFromText(pregnancyLedger.facts[0].text,'앤 해서웨이'),'셋째 임신 발표');
const pregnancyTitle=derivePostResearchTitle(
  '앤 해서웨이',
  {shortTitle:'수치 변화',summary:'앤 해서웨이가 셋째 아이 임신 소식을 직접 발표했습니다.'},
  pregnancyLedger,
  [],
  {detailContent:'앤 해서웨이가 셋째 아이 임신 사실을 발표했습니다. 확인된 사실을 중심으로 정리했습니다.'},
);
assert.equal(pregnancyTitle.titleReady,true);
assert.equal(pregnancyTitle.topKeyword,'앤 해서웨이');
assert.equal(pregnancyTitle.topTopic,'셋째 임신 발표');
assert.equal(pregnancyTitle.topTitle,'앤 해서웨이 · 셋째 임신 발표');
assert.equal(pregnancyTitle.titleSource,'fact_ledger_fallback');

const sportsLedger={
  facts:[{id:'F1',text:'손흥민의 소속팀이 결승 진출을 확정했다.',subject:'손흥민',status:'confirmed',sourceIds:['S1','S2']}],
  sources:[{id:'S1',sourceType:'official'},{id:'S2',sourceType:'trusted_news'}],conflicts:[],uncertainties:[],
};
const sportsTitle=derivePostResearchTitle(
  '손흥민 결승 진출 소식',
  {shortTitle:'결승 진출 확정',summary:'손흥민의 소속팀이 결승 진출을 확정했습니다.'},
  sportsLedger,
  ['손흥민 소속팀, 결승전 진출 확정 후 공식 명단 발표'],
  {detailContent:'손흥민의 소속팀은 경기 결과에 따라 결승 진출을 확정했습니다. 공식 일정도 확인됐습니다.'},
);
assert.equal(sportsTitle.topKeyword,'손흥민');
assert.equal(sportsTitle.topTitle,'손흥민 · 결승 진출 확정');
assert.equal(sportsTitle.titleSource,'ai_after_detail');

const outageLedger={
  facts:[{id:'F1',text:'카카오톡 서비스가 장애 복구 후 정상화됐다.',subject:'카카오톡',status:'confirmed',sourceIds:['S1','S2']}],
  sources:[{id:'S1',sourceType:'official'},{id:'S2',sourceType:'trusted_news'}],conflicts:[],uncertainties:[],
};
const sourceSimilar=derivePostResearchTitle(
  '카카오톡',
  {shortTitle:'서비스 장애 발생',summary:'카카오톡 서비스 장애가 발생했으며 이후 복구됐습니다.'},
  outageLedger,
  ['카카오톡 서비스 장애 발생'],
  {detailContent:'카카오톡 서비스 장애가 발생했습니다. 이후 서비스가 복구돼 정상화됐습니다.'},
);
assert.equal(sourceSimilar.titleReady,true);
assert.equal(sourceSimilar.titleSource,'fact_ledger_fallback');
assert.notEqual(sourceSimilar.topTopic,'서비스 장애 발생');
assert.match(sourceSimilar.topTopic,/복구|정상화/);

const unresolved=derivePostResearchTitle(
  '테스트 키워드',
  {shortTitle:'현재 상황',summary:'확인 가능한 구체적 행동이 없습니다.'},
  {facts:[{id:'F1',text:'확인 가능한 구체적 행동이 없습니다.',status:'single_source',sourceIds:['S1']}],sources:[],conflicts:[],uncertainties:[]},
  [],
  {detailContent:'확인 가능한 구체적 행동이 없습니다.'},
);
assert.equal(unresolved.titleReady,false);
assert.equal(unresolved.titleStatus,'review_required');
assert.equal(unresolved.topTitle,'');
assert.equal(unresolved.displayTitle,'테스트 키워드');

const blocked=decidePublication({
  content:{
    titleReady:false,titleStatus:'review_required',topKeyword:'테스트 키워드',topTopic:'',topTitle:'',
    contentTier:'standard',aiStatus:'verified_fallback',claimMap:[],qa:[],instagramCards:[],card:{summary:'충분한 길이의 검증 요약 문장입니다.',why:'검증 이유입니다.',points:['사실 1','사실 2','사실 3']},blog:'충분한 본문입니다.',
  },
  sourceItems:[{title:'공식 자료',description:'테스트 키워드에 관한 사실을 발표했다.',link:'https://example.com/a',sourceType:'official',contentUsable:true,evidenceUsable:true,domain:'example.com'}],
  ledger:{facts:[{id:'F1',text:'테스트 키워드에 관한 사실을 발표했다.',status:'confirmed',sourceIds:['S1']}],conflicts:[]},
  qualityScore:100,
});
assert.equal(blocked.publishable,false);
assert.ok(blocked.reasons.some(reason=>reason.includes('최종 제목')));

console.log('v8.0.11 keyword-first title pipeline tests passed');
