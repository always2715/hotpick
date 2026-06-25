import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { buildFeedSummaryCard } from '../lib/feedFirstPipeline.js';

const ledger={
  sources:[
    {id:'S1',source:'공식기관',domain:'official.example',url:'https://official.example/a',sourceType:'official'},
    {id:'S2',source:'신뢰언론',domain:'news.example',url:'https://news.example/b',sourceType:'trusted_news'},
  ],
  facts:[
    {id:'PF1',text:'테스트서비스는 이용자에게 일정 정보를 제공하는 서비스입니다.',scope:'profile',status:'confirmed',sourceIds:['S1'],sourceType:'official'},
    {id:'PF2',text:'테스트서비스는 모바일과 웹에서 사용할 수 있습니다.',scope:'profile',status:'confirmed',sourceIds:['S1'],sourceType:'official'},
    {id:'F1',text:'운영사는 6월 24일 신규 기능을 공개했습니다.',scope:'issue',status:'confirmed',sourceIds:['S1','S2'],sourceType:'official'},
    {id:'F2',text:'신규 기능은 일정 알림과 저장 기능을 포함합니다.',scope:'issue',status:'confirmed',sourceIds:['S1','S2'],sourceType:'official'},
    {id:'F3',text:'해당 기능은 7월 1일부터 순차 적용될 예정입니다.',scope:'issue',status:'confirmed',sourceIds:['S1'],sourceType:'official'},
    {id:'F4',text:'기존 이용자는 별도 신청 없이 기능을 사용할 수 있습니다.',scope:'issue',status:'confirmed',sourceIds:['S1'],sourceType:'official'},
  ],
  conflicts:[],uncertainties:[],
};

const fallback=buildVerifiedFallback('테스트서비스',ledger,36,'full');
assert.ok(fallback.sections.length>=3,'사실이 충분하면 3개 이상의 역할이 다른 섹션을 구성해야 합니다.');
assert.ok(!fallback.sections.some(section=>section.heading==='출처에서 확인된 내용'),'출처 반복형 소제목을 사용하면 안 됩니다.');
const paragraphTexts=fallback.sections.flatMap(section=>section.paragraphs.map(row=>row.text));
assert.equal(new Set(paragraphTexts).size,paragraphTexts.length,'동일한 본문 문단을 다른 섹션에서 반복하면 안 됩니다.');

const card=buildFeedSummaryCard({keyword:'테스트서비스',feedTitle:'테스트서비스 · 신규 기능 공개',blog:fallback.blog,sections:fallback.sections,factLedger:ledger});
assert.ok(card.summary.length>=45,'요약은 단일 짧은 문장이 아니라 핵심 사실을 충분히 설명해야 합니다.');
assert.ok(card.points.length>=3&&card.points.length<=5,'핵심 포인트는 서로 다른 3~5개여야 합니다.');
assert.ok(card.listSummary.length<=150,'피드 목록 요약은 읽기 좋은 길이로 제한해야 합니다.');
assert.equal(card.source,'feed_summary_v6_precise_editorial');

const app=fs.readFileSync(new URL('../pages/_app.js',import.meta.url),'utf8');
const footer=fs.readFileSync(new URL('../components/SiteFooter.js',import.meta.url),'utf8');
const detail=fs.readFileSync(new URL('../pages/feed/[slug].js',import.meta.url),'utf8');
const feed=fs.readFileSync(new URL('../pages/feed.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');

assert.match(app,/SiteFooter/);
assert.match(footer,/Powered by Upstash Redis · QStash/);
assert.match(detail,/editorial-summary-card/);
assert.match(detail,/자주 묻는 내용/);
assert.match(detail,/검증 출처/);
assert.match(detail,/video\?\.title&&\(video\?\.id\|\|video\?\.url\)/);
assert.match(feed,/feed-excerpt/);
assert.match(feed,/feed-trust/);
assert.match(api,/섹션은 3~5개/);
assert.match(api,/같은 Fact를 문장만 바꿔 여러 섹션에서 반복하지 마세요/);
assert.match(api,/export const CONTENT_VERSION = 140/);
assert.match(version,/contentVersion:140/);

console.log('STELLATE v8.0.35 editorial product quality tests: PASS');
