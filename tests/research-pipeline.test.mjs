import assert from 'node:assert/strict';
import { inferResearchTopicType, buildDeterministicResearchPlan, makeStructuredApiSource, mergeResearchBundle, normalizeRelatedVideos, researchCompleteness } from '../lib/researchPipeline.js';
import { resolveKmaBaseDateTime, resolveWeatherTargetDate } from '../lib/weatherResearch.js';

assert.equal(inferResearchTopicType('내일 전국 날씨',{category:'life'}),'weather');
assert.equal(inferResearchTopicType('카카오톡 서비스 장애',{category:'tech'}),'service_status');
assert.equal(inferResearchTopicType('삼성전자 2분기 실적',{category:'economy'}),'company');

const plan=buildDeterministicResearchPlan('내일 전국 날씨',{topKeyword:'내일',topTopic:'기상 상황',category:'life'});
assert.equal(plan.topicType,'weather');
assert.ok(plan.queries.length>=2);

assert.deepEqual(resolveKmaBaseDateTime(new Date('2026-06-20T00:00:00Z')),{baseDate:'20260620',baseTime:'0800'});
assert.deepEqual(resolveKmaBaseDateTime(new Date('2026-06-19T16:00:00Z')),{baseDate:'20260619',baseTime:'2300'});
assert.equal(resolveWeatherTargetDate('내일 전국 날씨',new Date('2026-06-20T00:00:00Z')),'20260621');
assert.equal(resolveWeatherTargetDate('오늘 전국 날씨',new Date('2026-06-20T00:00:00Z')),'20260620');

const structured=makeStructuredApiSource({
  source:'테스트 날씨 API',link:'https://example.com/weather',sourceType:'authorized',facts:[
    '2026년 6월 21일 서울의 최저기온은 21도이고 최고기온은 28도로 예보됐다',
    '2026년 6월 21일 부산의 최대 강수확률은 60%로 예보됐다',
    '2026년 6월 21일 제주의 최고기온은 27도로 예보됐다',
  ]
});
assert.equal(structured.evidenceUsable,true);

const videos=normalizeRelatedVideos([
  {id:'a',title:'내일 전국 날씨 전망',channel:'공식 기상 채널',channelTrusted:true,relevanceScore:90,url:'https://www.youtube.com/watch?v=a',publishedAt:new Date().toISOString()},
  {id:'b',title:'게임 방송',channel:'게임',url:'https://www.youtube.com/watch?v=b',publishedAt:new Date().toISOString()},
],'내일 날씨');
assert.deepEqual(videos.map(v=>v.id),['a']);

const bundle=mergeResearchBundle({
  topicTitle:'내일 전국 날씨',plan,structuredEvidence:[structured],relatedVideos:videos,
  newsBundle:{relatedNews:[{title:'내일 날씨 전망 기사',source:'테스트뉴스',link:'https://news.example.com/weather',publishedAt:'2026-06-20T00:00:00Z'}],discoveryCount:1,maxAgeHours:36}
});
const completeness=researchCompleteness(bundle);
assert.equal(completeness.evidenceCount,1);
assert.ok(completeness.factCount>=3);
assert.equal(completeness.relatedVideoCount,1);
assert.equal(bundle.detailedReady,true);
assert.ok(bundle.promptText.includes('[구조화된 확인 사실]'));
console.log('research pipeline tests passed');
