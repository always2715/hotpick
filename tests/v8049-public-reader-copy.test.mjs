import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizePublicText, sanitizePublicContent, sanitizeSourceDisplayText, containsPublicMetaCopy } from '../lib/publicCopy.js';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { isGenericFactText } from '../lib/contentAccuracy.js';

const leaked=`민주당 검찰정상화 특위에서 활동하는 최석군 변호사는 이를 매우 뜻깊은 사건이라 평가했습니다. ohmynews.com의 공개 자료와 연결된 기본정보입니다. 본문은 주체·행동·대상·조건을 이 자료에서 확인되는 범위로만 정리했으며, 자료에 없는 원인이나 전망은 덧붙이지 않았습니다. 세부 조건이 필요한 경우 같은 출처의 원문과 후속 공지를 함께 확인할 수 있습니다. 우선 위 기사는 언론이 기본적으로 가져야 할 객관적인 정보제공의 기능을 상실했습니다. mindlenews.com에서 확인할 수 있는 내용을 기준으로 정리했습니다. 다른 사건이나 동명이인 정보와 섞이지 않도록 주체와 대상을 구분했고, 공개 자료에 없는 평가나 결과는 확정하지 않았습니다. 기본정보는 현재 이슈와 섞지 않고 대상의 정체를 확인하는 데 필요한 범위로만 정리했습니다.`;
const clean=sanitizePublicText(leaked);
assert.equal(clean,'민주당 검찰정상화 특위에서 활동하는 최석군 변호사는 이를 매우 뜻깊은 사건이라 평가했습니다.');
assert.equal(/ohmynews|mindlenews|동명이인|원문|객관적인 정보제공|기준으로 정리/.test(clean),false);
assert.equal(sanitizeSourceDisplayText('머니투데이&nbsp;&nbsp;머니투데이. 머니투데이'),'머니투데이');
assert.equal(containsPublicMetaCopy('다른 사건이나 동명이인 정보와 섞이지 않도록 주체와 대상을 구분했습니다.'),true);
assert.equal(containsPublicMetaCopy('세부 일정은 공식 홈페이지에서 확인할 수 있습니다.'),true);
assert.equal(sanitizePublicText('핵심 일정은 7월 2일입니다. 세부 일정은 공식 홈페이지에서 확인할 수 있습니다.'),'핵심 일정은 7월 2일입니다.');
assert.equal(isGenericFactText('우선 위 기사는 언론이 기본적으로 가져야 할 객관적인 정보제공의 기능을 상실했습니다.'),true);

const publicContent=sanitizePublicContent({
  blog:`## 보완수사권 폐지는 무엇인가\n\n${leaked}`,
  card:{summary:leaked,why:'mindlenews.com에서 확인할 수 있는 내용을 기준으로 정리했습니다.',points:['보완수사권 폐지 논의가 이어졌습니다.','다른 사건이나 동명이인 정보와 섞이지 않도록 구분했습니다.']},
  qa:[{q:'무엇인가요?',a:'해당 출처의 최신 안내에서 다시 확인할 수 있습니다.'}],
});
assert.match(publicContent.blog,/보완수사권 폐지는 무엇인가/);
assert.match(publicContent.blog,/최석군 변호사는 이를 매우 뜻깊은 사건이라 평가했습니다/);
assert.equal(/ohmynews|mindlenews|동명이인|원문|출처의 최신 안내/.test(JSON.stringify(publicContent)),false);
assert.deepEqual(publicContent.card.points,['보완수사권 폐지 논의가 이어졌습니다.']);
assert.equal(publicContent.qa.length,0);

const sources=[
  {id:'S1',source:'오마이뉴스',domain:'ohmynews.com',url:'https://ohmynews.com/a',link:'https://ohmynews.com/a',sourceType:'trusted_news'},
  {id:'S2',source:'마인드뉴스',domain:'mindlenews.com',url:'https://mindlenews.com/b',link:'https://mindlenews.com/b',sourceType:'independent'},
];
const facts=[
  {id:'F1',text:'국회에서 보완수사권 폐지 방안이 논의됐습니다.',scope:'issue',sourceIds:['S1'],sourceType:'trusted_news',status:'confirmed'},
  {id:'F2',text:'논의안은 검찰의 수사 권한 조정 범위를 다뤘습니다.',scope:'issue',sourceIds:['S2'],sourceType:'independent',status:'confirmed'},
];
const fallback=buildVerifiedFallback('보완수사권 폐지',{version:3,sources,facts,confirmedFacts:['F1','F2'],uncertainties:[],conflicts:[]},36,'full');
assert.match(fallback.blog,/국회에서 보완수사권 폐지 방안이 논의됐습니다/);
assert.equal(/오마이뉴스|마인드뉴스|ohmynews|mindlenews|동명이인|원문|기준으로 정리|공개 자료/.test(fallback.blog),false);

const editorialSource=fs.readFileSync(new URL('../lib/editorialContent.js',import.meta.url),'utf8');
assert.doesNotMatch(editorialSource,/sourceContextSentence/);
assert.doesNotMatch(editorialSource,/다른 사건이나 동명이인 정보와 섞이지 않도록/);
const apiSource=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(apiSource,/출처 목록은 시스템이 별도 영역에 표시합니다/);
assert.doesNotMatch(apiSource,/확인된 출처와 사실을 중심으로 정리했습니다/);

console.log('STELLATE v8.0.50 public reader copy sanitation tests: PASS');
