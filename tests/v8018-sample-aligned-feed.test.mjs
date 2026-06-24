import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFeedSummaryCard, fullFeedTitle } from '../lib/feedFirstPipeline.js';
import { ensurePromoCard } from '../lib/instagram.js';

const blog=`## A사 스마트폰 X1은 어떤 제품인가
A사 스마트폰 X1은 A사가 새롭게 선보인 프리미엄 스마트폰입니다. 사진 보정과 음성 요약 기능을 제공합니다.

## 출시 일정과 주요 발표 내용
A사는 국내 사전 판매와 정식 출시 일정을 공개했습니다. 사전 구매 고객을 위한 혜택도 함께 발표했습니다.

## STELLATE 인사이트
제품 공개를 넘어 실제 구매 일정과 주요 기능이 함께 구체화됐다는 점이 핵심입니다.`;
const feedTitle=fullFeedTitle('A사 스마트폰 X1','국내 출시 일정 공개');
const card=buildFeedSummaryCard({keyword:'A사 스마트폰 X1',feedTitle,blog});
assert.equal(card.previewLabel,'요약 정보');
assert.equal(card.infoLine,'A사 스마트폰 X1에 대한 정보');
assert.equal(card.summaryLabel,'요약 정보');
assert.equal(card.pointsLabel,'주요 내용');
assert.equal(card.ctaLabel,'상세 정보 피드 보기');
assert.ok(card.summary.includes('사전 판매'));
assert.ok(card.points.length>=3&&card.points.length<=5);
assert.ok(card.listSummary.length<=100);

const content={
  keyword:'A사 스마트폰 X1',topKeyword:'A사 스마트폰 X1',feedTitle,blog,card,
  factLedger:{facts:[{id:'F1',text:'국내 사전 판매 일정 공개'},{id:'F2',text:'정식 출시 일정 공개'},{id:'F3',text:'사전 구매 혜택 발표'}]},
  claimMap:[
    {text:'A사는 국내 사전 판매와 정식 출시 일정을 공개했습니다.',claimIds:['F1','F2']},
    {text:'사전 구매 고객을 위한 혜택도 함께 발표했습니다.',claimIds:['F3']},
    {text:'제품 공개를 넘어 실제 구매 일정과 주요 기능이 함께 구체화됐다는 점이 핵심입니다.',claimIds:['F1']},
  ],
  sourceItems:[{source:'A사 공식 뉴스룸'}],
};
const cards=ensurePromoCard([],content);
assert.equal(cards[0].type,'cover');
assert.equal(cards[1].type,'feed_section');
assert.equal(cards.at(-2).type,'insight');
assert.equal(cards.at(-1).type,'promo');
assert.equal(cards.some(row=>row.headline==='핵심 내용'),false);
assert.ok(cards.length>=5&&cards.length<=6);

const home=fs.readFileSync(new URL('../pages/index.js',import.meta.url),'utf8');
const preview=fs.readFileSync(new URL('../pages/[slug].js',import.meta.url),'utf8');
const feed=fs.readFileSync(new URL('../pages/feed/[slug].js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(home,/top-separator">·<\/span>/);
assert.match(home,/rank-summary/);
assert.match(preview,/요약 정보/);
assert.match(preview,/주요 내용/);
assert.match(preview,/상세 정보 피드 보기/);
assert.match(preview,/에 대한 정보/);
assert.doesNotMatch(feed,/많이 궁금해하는 점/);
assert.doesNotMatch(feed,/trust-summary/);
assert.doesNotMatch(feed,/floating-recommendation/);
assert.match(feed,/TOP \$\{previous\.rank\} · 이전 글/);
assert.match(feed,/TOP \$\{next\.rank\} · 다음 글/);
assert.match(api,/upgradeStoredStageContent/);
assert.match(api,/buildFactBasedStageCandidate/);
assert.match(api,/CONTENT_KEYWORD_NOT_READY/);
assert.match(api,/CONTENT_KEYWORD_NOT_READY/);
assert.match(api,/selected-v8018/);
assert.match(api,/selected-v8017/);
assert.match(refresh,/previewSummary:content\.card\?\.listSummary/);
assert.match(refresh,/TOP_POLICY_VERSION/);
assert.match(version,/contentVersion:131/);
assert.match(version,/trendCacheVersion:50/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
console.log('v8.0.18 sample-aligned TOP, summary card, feed, fallback, image, and Instagram tests passed');
