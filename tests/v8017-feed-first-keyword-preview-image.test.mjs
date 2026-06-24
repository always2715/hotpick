import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveTop30Keyword } from '../lib/editorialTitle.js';
import { selectStableTop30 } from '../lib/top30Selection.js';
import { buildFeedSummaryCard, fullFeedTitle, feedHeadlineFromTitle } from '../lib/feedFirstPipeline.js';
import { ensurePromoCard, validateInstagramCards } from '../lib/instagram.js';
import { containsPublicResearchWindow } from '../lib/publicCopy.js';

const samsung=resolveTop30Keyword({
  rawKeyword:'삼성전자 주가가 크게 상승한 이유',
  sourceTitles:['삼성전자 주가 상승, 반도체 기대 반영','삼성전자 외국인 매수 확대','삼성전자 반도체 투자 계획'],
});
assert.equal(samsung.keyword,'삼성전자');
const iphone=resolveTop30Keyword({
  rawKeyword:'아이폰 18 공개 일정 관련 소식',
  sourceTitles:['아이폰 18 공개 일정 전망','애플 아이폰 18 신제품 정보','아이폰 18 출시 관련 보도'],
});
assert.equal(iphone.keyword,'아이폰 18');

const accurate=[];
for(let i=0;i<34;i++)accurate.push({
  keyword:`정상키워드${i}`,topKeyword:`정상키워드${i}`,topTopic:`사건 ${i}`,candidateType:'event',causeStatus:'confirmed',
  rankingScore:70-i/2,keywordConfidence:85,eventCoherence:82,independentSources:2,officialSources:i<8?1:0,
  interestSignals:['search','news'],rankingComponents:{search:12,newsVelocity:7},category:i<20?'entertainment':'tech',eventSignatures:[`event-${i}`],
});
accurate.push({keyword:'영상',topKeyword:'영상',topTopic:'',candidateType:'interest',causeStatus:'unconfirmed',rankingScore:100,keywordConfidence:10,eventCoherence:10,youtubeSupport:1,interestSignals:['youtube'],category:'general',eventSignatures:['weak-video']});
const selection=selectStableTop30(accurate);
assert.equal(selection.rows.length,20,'검출 정확도 보정을 적용해도 TOP20은 유지되어야 합니다.');
assert.equal(selection.rows.some(row=>row.topKeyword==='영상'),false,'개인 영상 하나뿐인 불완전 키워드는 충분한 정상 후보보다 앞서면 안 됩니다.');

const blog=`피드에서 확인된 내용을 정리했습니다.\n\n## 아이폰 18을 이해하는 핵심\n아이폰 18은 애플의 차세대 스마트폰 제품군입니다.\n\n## 공개 일정이 구체화됐습니다\n공개 일정 관련 발표가 확인됐습니다. 가격은 아직 공식적으로 확인되지 않았습니다.\n\n## STELLATE 인사이트\n현재 핵심은 확인된 일정과 아직 확인되지 않은 가격 정보를 구분해서 보는 것입니다.`;
const feedTitle=fullFeedTitle('아이폰 18','공개 일정 구체화');
assert.equal(feedHeadlineFromTitle('아이폰 18',feedTitle),'공개 일정 구체화');
const card=buildFeedSummaryCard({keyword:'아이폰 18',feedTitle,blog});
assert.equal(card.previewLabel,'요약 정보');
assert.match(card.summary,/공개 일정/);
assert.equal(containsPublicResearchWindow(`${card.summary} ${card.why} ${card.points.join(' ')}`),false);

const content={
  keyword:'아이폰 18',feedTitle,topTitle:feedTitle,blog,card,
  factLedger:{facts:[{id:'F1',text:'공개 일정 관련 발표가 확인됐습니다.'},{id:'F2',text:'가격은 아직 공식적으로 확인되지 않았습니다.'}]},
  claimMap:[{text:'공개 일정 관련 발표가 확인됐습니다.',claimIds:['F1']},{text:'가격은 아직 공식적으로 확인되지 않았습니다.',claimIds:['F2']}],
  sourceItems:[{source:'공식 발표'}],imageMeta:{source:'official',imageUrl:'https://img.example.com/iphone.jpg'},
};
const cards=ensurePromoCard([],content);
assert.equal(cards[0].type,'cover');
assert.equal(cards.at(-1).type,'promo');
assert.ok(cards.length>=5&&cards.length<=6);
assert.equal(validateInstagramCards(cards,content).passed,true);

const home=fs.readFileSync(new URL('../pages/index.js',import.meta.url),'utf8');
const preview=fs.readFileSync(new URL('../pages/[slug].js',import.meta.url),'utf8');
const detail=fs.readFileSync(new URL('../pages/feed/[slug].js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(home,/top-separator">·<\/span>/);
assert.match(home,/item\.feedHeadline\|\|item\.feedTitle/);
assert.match(preview,/요약 정보/);
assert.match(preview,/상세 정보 피드 보기/);
assert.match(detail,/TOP \$\{previous\.rank\} · 이전 글/);
assert.match(detail,/TOP \$\{next\.rank\} · 다음 글/);
assert.match(detail,/compact-sources/);
assert.match(api,/selected-v8017/);
assert.match(api,/Upstash\/직전 정상 이미지 값을 지우지 않습니다/);
assert.match(api,/feed_first_content/);
assert.match(refresh,/TOP_POLICY_VERSION/);
assert.match(version,/contentVersion:131/);
assert.match(version,/trendCacheVersion:50/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
console.log('v8.0.17 compatibility tests passed under v8.0.20');
