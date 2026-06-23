import assert from 'node:assert/strict';
import { buildOnlineReactionSummary, buildOnlineReactionRankingSignal, splitOnlineReactionInputs, onlineReactionInputPolicy } from '../lib/onlineReactionPipeline.js';
import { mergeResearchBundle } from '../lib/researchPipeline.js';

const now=new Date().toISOString();
const inputs=[
  {type:'blog',title:'편리해질 것 같아 기대된다',link:'https://blog.naver.com/a',publishedAt:now,author:'A'},
  {type:'community',title:'실제 적용 오류가 걱정된다',link:'https://theqoo.net/b',publishedAt:now,account:'B'},
  {type:'social',title:'추가 일정이 언제인지 궁금하다',link:'https://x.com/c',publishedAt:now,nickname:'C'},
  {type:'reference',title:'공식 발표 자료',link:'https://www.kisa.or.kr/notice/1',publishedAt:now,sourceType:'official'},
];
const split=splitOnlineReactionInputs(inputs);
assert.equal(split.online.length,3);
assert.equal(split.factual.length,1);
const unknownDate=buildOnlineReactionSummary([
  {type:'blog',title:'날짜 없는 반응 1',link:'https://blog.naver.com/unknown1'},
  {type:'community',title:'날짜 없는 반응 2',link:'https://theqoo.net/unknown2'},
  {type:'social',title:'날짜 없는 반응 3',link:'https://x.com/unknown3'},
]);
assert.equal(unknownDate.summary,'의미 있게 취합할 수 있는 온라인 반응이 충분하지 않습니다.','게시 시각을 확인할 수 없는 온라인 자료는 최근 36시간 반응으로 사용하지 않습니다.');

const summary=buildOnlineReactionSummary(inputs);
assert.deepEqual(Object.keys(summary).sort(),['notice','summary']);
assert.equal(summary.summary.includes('기대'),true);
assert.equal(JSON.stringify(summary).includes('blog.naver.com'),false);
assert.equal(JSON.stringify(summary).includes('author'),false);

const policy=onlineReactionInputPolicy();
for(const key of ['useForFactLedger','useForRecentTrends','useForNewsSummary','useForStellateInsight','useForQualityGrade','useForCacheRefresh','includeInSources','displayRawContent'])assert.equal(policy[key],false);
assert.equal(policy.useForRanking,true);
assert.equal(policy.rankingWeightMax,10);
const rankingSignal=buildOnlineReactionRankingSignal(inputs);
assert.ok(rankingSignal.score>0&&rankingSignal.score<=10);
assert.equal(rankingSignal.rankingOnly,true);

const bundle=mergeResearchBundle({
  topicTitle:'서비스 변경',plan:{detailedMinFacts:3},
  newsBundle:{items:[],relatedNews:[],relatedContent:inputs,discoveryCount:0,maxAgeHours:36},
  officialEvidence:[],structuredEvidence:[],relatedContent:[],relatedVideos:[],
});
assert.equal(bundle.relatedContent.some(item=>String(item.link||'').includes('blog.naver.com')),false);
assert.equal(bundle.factLedger.sources.some(item=>String(item.url||'').includes('blog.naver.com')),false);
assert.equal(bundle.onlineReactions,undefined);
assert.ok(bundle.onlineReactionRanking.score>0);
assert.equal(JSON.stringify(bundle.factLedger).includes('blog.naver.com'),false);
console.log('online reaction separation tests passed');
