import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFactLedger } from '../lib/contentPolicy.js';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { isResearchBackedFeedReady, researchBackedFeedRejectionReasons } from '../lib/publicationPolicy.js';
import { assessResearchBackedFeedSet } from '../lib/feedSetQuality.js';

const generic={
  status:'published',visibility:'published',contentMode:'detailed',contentType:'detailed',hasContent:true,
  contentGrade:'D',candidateType:'interest',causeStatus:'unconfirmed',
  topKeyword:'가수 박서진',topTopic:'관련 관심 증가',topTitle:'가수 박서진 · 관련 관심 증가',
  feedTitle:'가수 박서진 알아보기',detailTitle:'가수 박서진 알아보기',displayTitle:'가수 박서진',titleReady:true,titleStatus:'ready',
  blog:'## 가수 박서진 알아보기\n가수 박서진는 현재 검색과 콘텐츠에서 관심이 늘고 있는 주제입니다.\n\n## 지금 확인된 관심 흐름\n관심이 증가한 구체적인 원인은 아직 하나의 사건으로 확인되지 않았습니다.\n\n## STELLATE 인사이트\n현재는 관심 증가 자체만 확인된 단계입니다.',
  card:{summary:'가수 박서진에 대한 관심이 증가하고 있습니다. 구체적인 배경은 확인 중입니다.',why:'관심 증가 자체만 확인됐습니다.',points:['관련 관심 증가']},
  copyrightRisk:{passed:true},groundingScore:0,evidenceSources:[],factLedger:{facts:[],conflicts:[]},
};
assert.equal(isResearchBackedFeedReady(generic),false);
assert.ok(researchBackedFeedRejectionReasons(generic).some(reason=>/고정문|검색 근거|D등급/.test(reason)));

const ledger=buildFactLedger([{
  title:'박서진, 전국투어 콘서트 서울 공연 일정 공개',
  description:'가수 박서진이 전국투어 콘서트 서울 공연 일정과 예매 시작일을 공개했습니다.',
  link:'https://news.example.com/park-seojin-concert',source:'예시뉴스',sourceType:'independent',
  evidenceUsable:true,contentUsable:true,publishedAt:new Date().toISOString(),
}]);
assert.ok(ledger.facts.length>=1,'뉴스 검색 제목·요약에서도 현재 이슈 Fact를 추출해야 합니다.');
assert.ok(ledger.facts.some(f=>/박서진|콘서트|공연/.test(f.text)));
const parkFallback=buildVerifiedFallback('박서진',ledger,36,'standard');
assert.match(parkFallback.feedTitle,/박서진/);
assert.equal(parkFallback.feedTitle,'박서진 · 전국투어 공연 예매 일정 공개');
assert.match(parkFallback.blog,/박서진은 어떤 가수인가/);
assert.match(parkFallback.blog,/가수/);
assert.ok(parkFallback.blog.trim().startsWith('## 박서진은 어떤 가수인가'),'피드는 기본정보 섹션부터 시작해야 합니다.');
assert.match(parkFallback.blog,/공연|콘서트|예매/);
assert.doesNotMatch(parkFallback.blog,/현재 검색과 콘텐츠에서 관심이 늘고 있는 주제|지금 확인된 관심 흐름|관심 증가 자체만 확인된 단계/);

const subjects=['박서진','아이폰 18','삼성전자','손흥민','서울시','프로야구','한국은행','엔비디아','넷플릭스','제주도','현대자동차','BTS','임영웅','카카오','네이버','대한항공','기상청','교육부','국세청','토트넘','LG전자','SK하이닉스','두산베어스','한강공원','부산시','한국전력','쿠팡','디즈니플러스','아시안게임','우주항공청'];
const actions=['콘서트 일정 공개','신제품 기능 발표','투자 계획 확대','경기 출전 확정','교통 정책 변경','순위 변동 확인','기준금리 발표','신형 칩 공개','신작 공개 일정','축제 일정 발표','전기차 가격 공개','앨범 발매 일정','공연 예매 시작','서비스 업데이트','검색 기능 개편','노선 운항 확대','기상 특보 발표','교육 정책 안내','신고 일정 안내','이적 관련 입장','신제품 출시','생산 계획 공개','선수 등록 발표','행사 운영 변경','대중교통 안내','요금 조정 발표','배송 정책 변경','신작 예고편 공개','대표팀 명단 발표','발사 일정 공개'];
const rows=subjects.slice(0,20).map((keyword,index)=>{
  const topic=actions[index]; const title=`${keyword} · ${topic}`;
  return {
    status:'published',visibility:'published',contentMode:'detailed',contentType:'detailed',hasContent:true,contentGrade:'C',candidateType:'event',causeStatus:'confirmed',
    topKeyword:keyword,topTopic:topic,topTitle:title,feedTitle:title,detailTitle:title,displayTitle:title,titleReady:true,titleStatus:'ready',groundingScore:78,
    blog:`## ${keyword} 기본 정보\n${keyword}의 역할과 특징을 이해할 수 있는 기본 내용을 정리했습니다.\n\n## ${topic}\n${keyword}가 ${topic} 관련 세부 사항을 발표했습니다. ${index+1}번째 확인 항목에는 대상과 시행 일정이 포함됐습니다.\n\n## STELLATE 인사이트\n이번 발표에서 확인된 핵심은 ${topic}이며, 이용자가 확인해야 할 구체적 조건을 중심으로 살펴볼 필요가 있습니다.`,
    card:{summary:`${keyword}가 ${topic} 관련 내용을 공개했습니다. 발표된 대상과 일정, 적용 조건을 중심으로 정리했습니다.`,why:`${keyword}의 ${topic} 내용을 확인할 수 있습니다.`,points:[topic,`${index+1}번째 세부 조건`,`공식 일정 확인`]},
    copyrightRisk:{passed:true,maxSimilarity:0,longPhraseMatches:0},
    evidenceSources:[{source:`출처 ${index+1}`,domain:`source${index+1}.example.com`,sourceType:'independent',link:`https://source${index+1}.example.com/article`}],
    factLedger:{facts:[{id:'F1',text:`${keyword}가 ${topic} 관련 세부 사항을 발표했습니다.`,status:'single_source',sourceIds:['S1'],sourceType:'independent',scope:'issue'}],conflicts:[]},
  };
});
assert.equal(rows.filter(isResearchBackedFeedReady).length,20);
const quality=assessResearchBackedFeedSet(rows);
assert.equal(quality.healthy,true,JSON.stringify(quality));
assert.equal(quality.genericTemplateCount,0);
assert.equal(quality.dGradeCount,0);
assert.equal(quality.unsupportedCount,0);
assert.ok(quality.uniqueTitleCount>=18);

const repeated=Array.from({length:20},(_,index)=>({...generic,topKeyword:`반복 ${index}`,topTitle:`반복 ${index} · 관련 관심 증가`}));
assert.equal(assessResearchBackedFeedSet(repeated).healthy,false);

const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const job=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const trends=fs.readFileSync(new URL('../lib/trends.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(api,/publisherUrl/);
assert.match(api,/news_search_metadata_fact_verification/);
assert.match(api,/CONTENT_KEYWORD_NOT_READY/);
assert.doesNotMatch(job,/buildDeterministicSafetyContent/);
assert.doesNotMatch(job,/TOP_RESEARCH_CANDIDATE_LIMIT/);
assert.match(job,/prepareSelectedTopCandidates\(\(prepared\.trends \|\| \[\]\)\.slice\(0, RESEARCH_POOL_LIMIT\)/);
assert.match(job,/assessResearchBackedFeedSet/);
assert.match(job,/상위 25개 생성 후보|공개에 필요한 20개/);
assert.match(trends,/researchPool/);
assert.match(version,/contentVersion:138/);
assert.match(version,/trendCacheVersion:54/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/ranked_candidate_pool_v17_top20_from25/);
console.log('STELLATE v8.0.31 fixed TOP20 compatibility tests: PASS');
