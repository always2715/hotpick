import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectStableTop30, isLooseSameCandidate } from '../lib/top30Selection.js';
import { deriveContentGrade } from '../lib/contentGrade.js';
import { buildTrendBrief } from '../lib/contentArchitecture.js';
import { isPublicContentReady } from '../lib/publicationPolicy.js';
import { publicTopRejectionReasons } from '../lib/trendSelectionPolicy.js';
import { isCurrentPublicTop } from '../lib/topContentPolicy.js';
import { containsPublicResearchWindow } from '../lib/publicCopy.js';

const source=(id,type='trusted_news',domain=`source${id}.example.com`)=>({id:`S${id}`,source:`출처${id}`,sourceType:type,domain,url:`https://${domain}/${id}`});
const fact=(id,type='announcement',sourceId=`S${id}`)=>({id:`F${id}`,text:`검증된 사실 ${id}`,type,status:'confirmed',sourceIds:[sourceId],sourceType:'trusted_news'});
assert.equal(deriveContentGrade({factLedger:{facts:[fact(1)],sources:[source(1)]}}).grade,'C');
assert.equal(deriveContentGrade({factLedger:{facts:[fact(1),fact(2),fact(3)],sources:[source(1)]}}).grade,'B');
assert.equal(deriveContentGrade({factLedger:{facts:[fact(1,'schedule'),fact(2,'metric'),fact(3),fact(4),fact(5)],sources:[source(1,'official','official.example.com'),source(2,'trusted_news','news.example.com')]}}).grade,'A');
assert.equal(deriveContentGrade({factLedger:{facts:[],sources:[]}}).grade,'D');

assert.equal(isLooseSameCandidate({topKeyword:'손흥민',topTopic:'경기 출전',eventSignatures:['a']},{topKeyword:'손흥민',topTopic:'이적 관련 보도',eventSignatures:['b']}),false,'같은 주체라도 행동이 다르면 별도 후보여야 합니다.');

const candidates=[];
for(let i=0;i<18;i++)candidates.push({keyword:`신규 ${i}`,topKeyword:`신규 ${i}`,topTopic:'신규 발표',candidateType:'event',causeStatus:'confirmed',rankingScore:100-i,category:'entertainment',rankingComponents:{search:20,newsVelocity:10},eventSignatures:[`fresh-${i}`]});
for(let i=0;i<6;i++)candidates.push({keyword:`후속 ${i}`,topKeyword:`후속 ${i}`,topTopic:'일정 변경',candidateType:'event',causeStatus:'confirmed',previousRank:i+1,rankingScore:70-i,category:'sports',rankingComponents:{search:5,newsVelocity:5},eventSignatures:[`follow-${i}`]});
for(let i=0;i<4;i++)candidates.push({keyword:`관심 ${i}`,topKeyword:`관심 ${i}`,topTopic:'',candidateType:'interest',causeStatus:'unconfirmed',rankingScore:50-i,category:'trend',rankingComponents:{search:8,newsVelocity:0},eventSignatures:[`interest-${i}`]});
for(let i=0;i<5;i++)candidates.push({keyword:`유지 ${i}`,topKeyword:`유지 ${i}`,topTopic:'',candidateType:'interest',causeStatus:'unconfirmed',previousSeed:true,previousRank:20+i,rankingScore:10-i,category:'general',rankingComponents:{search:0,newsVelocity:0},eventSignatures:[`maintained-${i}`]});
const selected=selectStableTop30(candidates);
assert.equal(selected.rows.length,20);
assert.equal(selected.diagnostics.finalTopCount,20);
assert.ok(['base','expanded','disabled'].includes(selected.diagnostics.categoryCapPhase),'카테고리 상한을 적용하되 TOP20 완성을 우선해야 합니다.');

const d=buildTrendBrief({topicTitle:'원인 미확인 키워드',category:{label:'일반'},trendMeta:{keyword:'원인 미확인 키워드',category:'general'},newsBundle:{relatedNews:[],relatedContent:[],maxAgeHours:36}});
assert.equal(d.contentGrade,'D');
assert.equal(d.candidateType,'interest');
assert.equal(d.causeStatus,'unconfirmed');
assert.equal(isPublicContentReady(d),true);
assert.equal(containsPublicResearchWindow(`${d.topTitle} ${d.blog} ${d.card.summary}`),false);

const publicD={rank:20,visibility:'published',publicTopPolicy:'relative_top30_graded_content_v6',publicReady:true,contentReady:true,mainVisible:true,contentGrade:'D',candidateType:'interest',verifiedFactCount:0,verifiedEvidenceCount:0};
assert.deepEqual(publicTopRejectionReasons(publicD),[]);
assert.equal(isCurrentPublicTop(publicD),true);

const trends=fs.readFileSync(new URL('../lib/trends.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(trends,/TOP_DISCOVERY_POOL_LIMIT = 240/);
assert.match(trends,/selectStableTop30/);
assert.match(trends,/fetchCommunityTrends/);
assert.match(trends,/rawCollected/);
assert.match(refresh,/isFixedKeywordFeedReady/);
assert.match(refresh,/TOP_POLICY_VERSION/);
assert.match(api,/!isTopBriefEligible\(trendMeta\) && !fixedTop20Flow/);
assert.match(api,/CONTENT_KEYWORD_NOT_READY/);
assert.doesNotMatch(refresh,/buildDeterministicSafetyContent/);
console.log('v8.0.16 relative discovery and TOP20 public graded content tests passed');
