import assert from 'node:assert/strict';
import { classifySource, normalizeSourceItem } from '../lib/contentPolicy.js';
import { buildTrendBrief, buildStructuredFactPrompt, generationPolicyFor, hasDetailedEvidence, validateTrendBriefContent } from '../lib/contentArchitecture.js';

const news=classifySource('https://www.yna.co.kr/article/1','naver');
assert.equal(news.discoveryUsable,true);
assert.equal(news.evidenceUsable,true,'신뢰도 높은 뉴스는 사실 검증 근거로 사용할 수 있어야 합니다.');
assert.equal(news.sourceType,'trusted_news');
assert.equal(news.textReuseAllowed,false);

const unknown=classifySource('https://example-news.kr/article/1','naver');
assert.equal(unknown.discoveryUsable,true);
assert.equal(unknown.evidenceUsable,false);

const official=classifySource('https://www.kisa.or.kr/notice/1','direct');
assert.equal(official.evidenceUsable,true);
assert.equal(official.bodyFetchAllowed,true);
assert.equal(official.textReuseAllowed,false);

const normalized=normalizeSourceItem({link:'https://www.yna.co.kr/a',provider:'naver',title:'외부 기사 제목'});
assert.equal(normalized.contentUsable,true);
assert.equal(normalized.textReuseAllowed,false);

const officialSocial=normalizeSourceItem({
  link:'https://x.com/example/status/1',provider:'social',title:'공식 서비스 공지',
  description:'공식 계정이 2026년 6월 21일 서비스 복구 완료와 후속 점검 일정을 발표했습니다.',
  verifiedOfficialAccount:true,
});
assert.equal(officialSocial.sourceType,'official','검증된 공식 SNS 계정 발표는 공식자료로 분류해야 합니다.');
assert.equal(officialSocial.evidenceUsable,true);
assert.equal(officialSocial.rightsBasis,'verified_official_social_announcement');
assert.equal(officialSocial.textReuseAllowed,false);

const ledger={sources:[{id:'S1',source:'공식기관',url:'https://www.kisa.or.kr/notice/1',publishedAt:'2026-06-20'}],facts:[{id:'F1',subject:'서비스',type:'state_change',predicate:'복구됐다',eventAt:'2026-06-20',publishedAt:'2026-06-20',values:[],sourceIds:['S1']}]};
const prompt=buildStructuredFactPrompt(ledger);
assert.equal(prompt.includes('서비스가 복구됐다는 외부 원문 문장'),false);
assert.equal(prompt.includes('주체=서비스'),true);
assert.equal(hasDetailedEvidence({evidenceSources:[{evidenceUsable:true}],factLedger:ledger}),true);
assert.equal(hasDetailedEvidence({evidenceSources:[],factLedger:ledger}),false);

const brief=buildTrendBrief({topicTitle:'출처 원문 없는 TOP',fixedTop:{topKeyword:'출처 원문 없는 TOP',topTopic:'서비스 장애',topTitle:'출처 원문 없는 TOP · 서비스 장애'},category:{label:'일반'},trendMeta:{rank:12,contentTier:'standard',topEligible:true,mainVisible:true,category:'tech'},newsBundle:{relatedNews:[],relatedContent:[],discoveryCount:0,maxAgeHours:36}});
assert.equal(brief.status,'published');
assert.equal(brief.contentGrade,'D');
assert.equal(validateTrendBriefContent(brief),true);
assert.equal(brief.generationPolicy.copyrightGate,'expression_similarity_only');
assert.deepEqual(generationPolicyFor('brief').newsRole,'related_link_and_cross_check');
console.log('copyright/source-role v8 tests passed');
