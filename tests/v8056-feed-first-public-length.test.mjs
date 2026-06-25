import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedDetailLength, feedDetailPublicText } from '../lib/feedLengthPolicy.js';
import { validateGeneratedPackageAccuracy } from '../lib/contentAccuracy.js';
import { publicContentRejectionReasons } from '../lib/publicationPolicy.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const apiSource=fs.readFileSync(path.join(root,'lib/api.js'),'utf8');

const bodyParagraph='확인된 자료에 따르면 해당 주체는 구체적인 조치를 발표했고 적용 시점과 대상도 함께 밝혔습니다. 이 문장은 검증된 사실을 설명하기 위한 본문입니다. ';
const blog=[
  '## 사건 개요', bodyParagraph.repeat(3),
  '## 주요 내용', bodyParagraph.repeat(3),
  '## 확인할 사항', bodyParagraph.repeat(3),
].join('\n\n');
assert.ok(blog.length<1000,'회귀 fixture의 본문 단독 길이는 1,000자 미만이어야 합니다.');

const content={
  contentVersion:140,
  feedDetailLengthPolicy:'v8056-public-text-min1000-target5000-feed-first',
  status:'published',visibility:'published',contentMode:'detailed',contentType:'detailed',hasContent:true,
  topKeyword:'테스트 키워드',topTopic:'구체 조치 발표',topTitle:'테스트 키워드 · 구체 조치 발표',
  feedTitle:'테스트 키워드 · 구체 조치 발표',detailTitle:'테스트 키워드 · 구체 조치 발표',
  displayTitle:'테스트 키워드',titleReady:true,titleStatus:'ready',
  blog,
  card:{
    feedTitle:'테스트 키워드 · 구체 조치 발표',detailTitle:'테스트 키워드 · 구체 조치 발표',
    summary:'검증된 피드 전체에서 핵심 사실과 적용 대상을 요약한 문장입니다. '.repeat(2),
    why:'독자가 확인해야 할 시점과 조건을 피드 내용에서 정리했습니다. '.repeat(2),
    points:[
      '첫 번째 핵심 사실과 구체적인 적용 조건을 정리했습니다.',
      '두 번째 핵심 사실과 독자가 확인할 대상을 정리했습니다.',
      '세 번째 핵심 사실과 이후 확인할 일정을 정리했습니다.',
    ],
  },
  qa:[
    {q:'가장 먼저 확인된 내용은 무엇인가요?',a:'검증된 피드 첫 번째 섹션에서 주체와 조치, 적용 대상을 확인할 수 있습니다.'},
    {q:'독자가 확인할 조건은 무엇인가요?',a:'피드에 포함된 적용 시점과 대상, 후속 공식 일정을 함께 확인해야 합니다.'},
    {q:'제목은 무엇을 기준으로 만들었나요?',a:'완성된 피드에 들어 있는 구체 사건과 행동을 기준으로 제목을 만들었습니다.'},
  ],
  factLedger:{
    facts:[{id:'F1',text:'해당 주체는 구체적인 조치를 발표했고 적용 시점과 대상을 밝혔다.',status:'confirmed',sourceIds:['S1']}],
    sources:[{id:'S1',sourceType:'official',domain:'example.go.kr'}],conflicts:[],
  },
  evidenceSources:[{sourceType:'official',domain:'example.go.kr'}],
  groundingScore:90,copyrightRisk:{passed:true},accuracyValidation:{passed:true},contentGrade:'B',
};

const publicText=feedDetailPublicText(content);
assert.ok(publicText.includes('사건 개요'),'화면 소제목은 공개 글자 수에 포함돼야 합니다.');
assert.ok(publicText.includes('테스트 키워드 · 구체 조치 발표'),'메인 제목은 공개 글자 수에 포함돼야 합니다.');
assert.ok(publicText.includes('\n\n'),'표시되는 공백·줄바꿈도 최종 문자열에 포함돼야 합니다.');
assert.ok(feedDetailLength(content)>=1000,'제목·요약·포인트·소제목·본문·Q&A를 포함한 최종 공개 피드는 1,000자 이상이어야 합니다.');
assert.ok(!publicContentRejectionReasons(content).some(reason=>reason.includes('1,000자')),'본문 단독이 짧아도 최종 공개 피드가 1,000자 이상이면 탈락시키면 안 됩니다.');

const ledger={
  facts:[{id:'F1',text:'테스트 기관은 6월 26일 적용 대상을 발표했습니다.',status:'confirmed',sourceIds:['S1']}],
  sources:[{id:'S1',sourceType:'official'}],conflicts:[],
};
const pkg={
  sections:[{heading:'발표 내용',paragraphs:[{text:'테스트 기관은 6월 26일 적용 대상을 발표했습니다.',claimIds:['F1']}]}],
  qa:[{q:'무엇인가요?',a:'근거에 없는 99% 전망입니다.',claimIds:['BAD']}],
  instagramCards:[{headline:'전망',body:'근거에 없는 전망입니다.',claimIds:['BAD']}],
};
assert.equal(validateGeneratedPackageAccuracy(pkg,ledger,{scope:'feed'}).passed,true,'보조 콘텐츠 오류가 검증된 피드 본문을 폐기하면 안 됩니다.');
assert.equal(validateGeneratedPackageAccuracy(pkg,ledger).passed,false,'전체 검증 모드에서는 잘못된 보조 콘텐츠를 감지해야 합니다.');

assert.match(apiSource,/required:\['visualQuery','sections','uncertainties'\]/,'AI 출력은 피드 본문 구조만 필수로 요구해야 합니다.');
assert.doesNotMatch(apiSource,/required:\[[^\]]*'qa'/,'AI 출력 필수 항목에 Q&A가 남아 있으면 안 됩니다.');
assert.match(apiSource,/buildFeedFirstDerivedOutputs/);
const helperStart=apiSource.indexOf('function buildFeedFirstDerivedOutputs');
const helperEnd=apiSource.indexOf('export async function generateContent',helperStart);
const helper=apiSource.slice(helperStart,helperEnd);
assert.ok(helper.indexOf('buildFeedSummaryCard')<helper.indexOf('derivePostResearchTitle'),'완성 피드 요약이 제목 확정보다 먼저 생성돼야 합니다.');
assert.ok(helper.indexOf('derivePostResearchTitle')<helper.indexOf('buildFeedDerivedQa'),'Q&A는 피드와 제목 확정 이후에 파생돼야 합니다.');
assert.match(apiSource,/feed_body_first','feed_derived_summary','feed_derived_title','feed_derived_auxiliary/);

console.log('v8.0.56 feed-first public length tests passed');
