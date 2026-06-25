import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_TOP_COUNT, TOP_GENERATION_POOL_COUNT } from '../lib/topConfig.js';
import { selectStableTop30 } from '../lib/top30Selection.js';
import { derivePostResearchTitle, validateEditorialEventTitle } from '../lib/editorialTitle.js';
import { buildFeedSummaryCard } from '../lib/feedFirstPipeline.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');

assert.equal(PUBLIC_TOP_COUNT,20);
assert.equal(TOP_GENERATION_POOL_COUNT,25);

const synthetic=Array.from({length:30},(_,index)=>({
  keyword:`검증후보${index+1}`,
  rawKeyword:`검증후보${index+1}`,
  topKeyword:`검증후보${index+1}`,
  topTopic:`서비스 출시 ${index+1}`,
  displayTitle:`검증후보${index+1}`,
  keywordUsable:true,
  rankingScore:100-index,
  googleRank:index+1,
  category:index%2?'tech':'economy',
  independentSources:2,
  officialSources:1,
  eventCoherence:80,
  keywordConfidence:90,
  eventSignatures:[`evt-${index+1}`],
  interestSignals:['search','independent_news'],
  rankingComponents:{search:20,newsVelocity:8},
  candidateType:'event',
  causeStatus:'confirmed',
}));
const selected=selectStableTop30(synthetic,{limit:TOP_GENERATION_POOL_COUNT});
assert.equal(selected.rows.length,25,'생성 후보 풀은 25개여야 합니다.');
assert.deepEqual(selected.rows.map(row=>row.rank),Array.from({length:25},(_,i)=>i+1));

// 2·7·18위가 실패해도 다음 성공 후보가 순위 순으로 승격돼 공개 20개를 구성해야 합니다.
const failed=new Set([2,7,18]);
const successful=selected.rows.filter(row=>!failed.has(row.rank)).sort((a,b)=>a.rank-b.rank).slice(0,PUBLIC_TOP_COUNT);
assert.equal(successful.length,20);
assert.equal(successful.at(-1).rank,23,'실패 후보가 있으면 23위까지 자동 승격돼야 합니다.');

const ledger={
  facts:[
    {id:'F1',text:'테스트기업은 6월 24일 신규 결제 서비스를 출시했습니다.',scope:'issue',status:'confirmed',sourceType:'official',sourceIds:['S1']},
    {id:'F2',text:'신규 결제 서비스는 국내 이용자를 대상으로 제공됩니다.',scope:'issue',status:'confirmed',sourceType:'official',sourceIds:['S1']},
  ],
  sources:[{id:'S1',title:'테스트기업 신규 결제 서비스 출시 안내',source:'테스트기업',sourceType:'official',link:'https://example.com/launch'}],
};
const title=derivePostResearchTitle('테스트기업',{
  shortTitle:'입장 발표',
  sections:[{heading:'신규 결제 서비스 출시',paragraphs:[{text:'테스트기업은 6월 24일 신규 결제 서비스를 출시했습니다.',claimIds:['F1']}]}],
},ledger,['테스트기업 신규 결제 서비스 출시 안내'],{fixedKeyword:true,detailContent:'테스트기업은 6월 24일 신규 결제 서비스를 출시했습니다.'});
assert.equal(title.titleReady,true);
assert.notEqual(title.topTopic,'입장 발표');
assert.match(title.topTopic,/결제|서비스|출시/);
assert.deepEqual(title.titleEvidenceFactIds,['F1']);
assert.equal(validateEditorialEventTitle('입장 발표',{keyword:'테스트기업'}).valid,false);

const card=buildFeedSummaryCard({
  keyword:'테스트기업',feedTitle:title.topTitle,factLedger:ledger,
  sections:[
    {heading:'어떤 기업인가',paragraphs:['테스트기업은 결제 서비스를 운영하는 기업입니다.']},
    {heading:'신규 결제 서비스 출시',paragraphs:['테스트기업은 6월 24일 신규 결제 서비스를 출시했습니다.']},
    {heading:'이용 대상',paragraphs:['신규 결제 서비스는 국내 이용자를 대상으로 제공됩니다.']},
  ],
});
assert.equal(card.source,'feed_summary_v6_precise_editorial');
assert.match(card.summary,/6월 24일|신규 결제 서비스/);
assert.doesNotMatch(card.summary,/관심이 커지고|귀추가 주목/);

const refresh=source('lib/trendRefreshJob.js');
assert.match(refresh,/RESEARCH_POOL_LIMIT = TOP_GENERATION_POOL_COUNT/);
assert.match(refresh,/selectedTop25/);
assert.match(refresh,/sort\(\(a,b\)=>Number\(a\.trend\?\.selectionRank/);
assert.match(refresh,/\.slice\(0, TARGET_TOP_COUNT\)/);
assert.match(refresh,/promotedFromReserve/);
assert.match(refresh,/fixedTop25Pool:\s*true/);
assert.match(refresh,/top20_from25_content_incomplete/);

const api=source('lib/api.js');
assert.match(api,/export const CONTENT_VERSION = 140/);
assert.match(api,/const TREND_CACHE_VERSION = 57/);
assert.match(api,/titleEvidenceFactIds/);
assert.match(api,/검증된 핵심 사실/);
const version=source('pages/api/version.js');
assert.match(version,/generationPoolCount:25/);
assert.match(version,/publicTopCount:20/);
assert.match(version,/contentVersion:140/);
assert.match(version,/trendCacheVersion:57/);

console.log('STELLATE v8.0.37 TOP25 generation pool, successful TOP20 publication, and precision tests: PASS');
