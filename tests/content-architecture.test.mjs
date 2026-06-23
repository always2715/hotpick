import assert from 'node:assert/strict';
import { buildRelatedNews, buildTrendBrief, sanitizeExternalLinksForStorage, sanitizeLedgerForStorage, contentIsReady, validateTrendBriefContent, validateDetailedTierShape } from '../lib/contentArchitecture.js';

const news=buildRelatedNews([
  {title:'삼성전자, 실적 발표 관련 기사 원제',link:'https://example.com/a?utm_source=x',source:'언론사 A',publishedAt:'2026-06-20T00:00:00.000Z'},
  {title:'다른 표현의 기사',link:'https://example.org/b',source:'언론사 B',publishedAt:'2026-06-20T01:00:00.000Z'},
],'삼성전자 실적 발표');
assert.equal(news.length,2);
assert.equal(news[0].label,'삼성전자, 실적 발표 관련 기사 원제');
assert.equal(news[0].displayTitle,'삼성전자, 실적 발표 관련 기사 원제');
assert.ok(news[0].titleHash);
assert.ok(news[0].transientOriginalTitle);
const storedNews=sanitizeExternalLinksForStorage(news);
assert.equal(storedNews[0].transientOriginalTitle,undefined);
assert.equal(storedNews[0].link.includes('utm_source'),false);

const brief=buildTrendBrief({
  topicTitle:'삼성전자 실적 발표',fixedTop:{topKeyword:'삼성전자',topTopic:'실적 발표',topTitle:'삼성전자 · 실적 발표'},
  category:{label:'경제'},trendMeta:{keyword:'삼성전자',rankingGrade:'A',rankingScore:88,category:'economy'},
  newsBundle:{relatedNews:storedNews,relatedContent:[],discoveryCount:2,maxAgeHours:36},
});
assert.equal(brief.contentMode,'graded_detail');
assert.equal(brief.contentGrade,'D');
assert.equal(brief.hasContent,true,'관리자 검토용 브리핑 데이터는 만들 수 있습니다.');
assert.equal(brief.status,'published','근거가 부족한 관심 증가형은 D등급 템플릿으로 공개 준비되어야 합니다.');
assert.equal(brief.visibility,'published');
assert.equal(brief.instagramCards.length,0);
assert.equal(validateTrendBriefContent(brief),true);
assert.ok(contentIsReady(brief));

const noLinkBrief=buildTrendBrief({
  topicTitle:'검색량만 높은 주제',fixedTop:{topKeyword:'검색량 주제',topTopic:'관심 증가',topTitle:'검색량 주제 · 관심 증가'},
  category:{label:'일반'},trendMeta:{keyword:'검색량 주제',rankingGrade:'A',rankingScore:95,category:'general'},
  newsBundle:{relatedNews:[],relatedContent:[],discoveryCount:0,maxAgeHours:36},
});
assert.equal(noLinkBrief.status,'published');
assert.equal(noLinkBrief.visibility,'published');
assert.equal(noLinkBrief.topEligible,true);

const ledger=sanitizeLedgerForStorage({
  sources:[{id:'S1',title:'원문 제목',source:'공식기관',url:'https://official.go.kr/a'}],
  facts:[{id:'F1',text:'원문 문장 전체',type:'announcement',subject:'공식기관',values:[],sourceIds:['S1'],status:'confirmed'}],confirmedFacts:['F1'],uncertainties:[],conflicts:[],
});
assert.equal(ledger.sources[0].title,'원문 제목','출처 제목은 공개 출처 표시를 위해 보존해야 합니다.');
assert.equal(ledger.facts[0].text,'원문 문장 전체','Fact Ledger에는 실제 확인 문장을 보존해야 합니다.');

const standardShape={contentTier:'standard',blog:'가'.repeat(1100),instagramCards:[]};
assert.equal(validateDetailedTierShape(standardShape),true,'표준형 TOP11~30은 인스타 카드 없이도 상세 구조 검증을 통과해야 합니다.');
assert.equal(validateDetailedTierShape({...standardShape,instagramCards:[{type:'promo'}]}),false);
const fullShape={contentTier:'full',blog:'가'.repeat(1300),instagramCards:[{type:'cover'},{type:'summary'},{type:'detail'},{type:'promo'}]};
assert.equal(validateDetailedTierShape(fullShape),true);
console.log('content architecture v8 tests passed');
