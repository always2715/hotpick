import assert from 'node:assert/strict';
import { buildTrendBrief, validateTrendBriefContent } from '../lib/contentArchitecture.js';
import { isTopBriefEligible } from '../lib/topContentPolicy.js';
import { containsForbiddenPublicCopy } from '../lib/publicationPolicy.js';

const emptyBundle={relatedNews:[],relatedContent:[],discoveryCount:0,maxAgeHours:36};
const candidate=buildTrendBrief({
  topicTitle:'출처 조회 실패 주제',fixedTop:{topKeyword:'출처 조회 실패 주제',topTopic:'서비스 장애',topTitle:'출처 조회 실패 주제 · 서비스 장애'},
  category:{label:'IT'},trendMeta:{slug:'source-failed-top',keyword:'출처 조회 실패 주제',rank:25,contentTier:'standard',topEligible:true,mainVisible:true,category:'tech'},newsBundle:emptyBundle,
});
assert.equal(candidate.hasContent,true);
assert.equal(candidate.status,'published');
assert.equal(candidate.contentGrade,'D');
assert.equal(candidate.visibility,'published');
assert.equal(validateTrendBriefContent(candidate),true,'원인을 꾸미지 않는 D등급 관심 증가형은 TOP 보충 콘텐츠로 사용할 수 있어야 합니다.');
assert.equal(isTopBriefEligible(candidate),false);
assert.equal(containsForbiddenPublicCopy(candidate),false,'관리자 검토용 브리핑도 금지된 운영 진단 문구를 만들지 않습니다.');

const nonTop=buildTrendBrief({
  topicTitle:'무근거 수동 검색어',fixedTop:{topKeyword:'무근거 수동 검색어',topTopic:'제품 출시',topTitle:'무근거 수동 검색어 · 제품 출시'},
  category:{label:'일반'},trendMeta:{rank:99,contentTier:'none',category:'general'},newsBundle:emptyBundle,
});
assert.equal(nonTop.status,'published');
assert.equal(nonTop.visibility,'published');
console.log('source-independent D-grade fallback tests passed');
