import assert from 'node:assert/strict';
import { validateTopCandidateKeyword } from '../lib/editorialTitle.js';
import { researchCandidateEntryRejectionReasons } from '../lib/trendSelectionPolicy.js';
import { selectStableTop30 } from '../lib/top30Selection.js';
import { buildIndependentResearchTrend, shouldRetryCandidate } from '../lib/trendRefreshJob.js';

assert.equal(validateTopCandidateKeyword('이기려고 한').valid,false,'관형형으로 끝난 기사 조각은 후보 키워드가 될 수 없습니다.');
assert.equal(validateTopCandidateKeyword('기자수첩 인천시장직 인수위는 심판자').valid,false,'기자수첩 라벨이 붙은 기사 제목 조각은 후보 키워드가 될 수 없습니다.');
assert.ok(researchCandidateEntryRejectionReasons({keyword:'이기려고 한',displayTitle:'이기려고 한'}).length>0);
assert.ok(researchCandidateEntryRejectionReasons({keyword:'기자수첩 인천시장직 인수위는 심판자',displayTitle:'기자수첩 인천시장직 인수위는 심판자'}).length>0);

const base=(keyword,score)=>({keyword,topKeyword:keyword,rawKeyword:keyword,displayTitle:keyword,rankingScore:score,selectionScore:score,googleRank:score,category:'general',candidateType:'event',causeStatus:'confirmed',independentSources:1,officialSources:0,eventCoherence:70,keywordUsable:true,interestSignals:['search','news'],rankingComponents:{search:10,newsVelocity:5},eventKey:`event-${keyword}`});
const pool=[base('이기려고 한',100),base('기자수첩 인천시장직 인수위는 심판자',99),...Array.from({length:27},(_,index)=>base(`정상후보${index+1}`,98-index))];
const selected=selectStableTop30(pool,{limit:25}).rows;
assert.equal(selected.length,25,'명백한 문장 조각을 제외해도 다음 상대순위 후보로 25개 풀을 채워야 합니다.');
assert.equal(selected.some(row=>row.keyword==='이기려고 한'),false);
assert.equal(selected.some(row=>row.keyword.startsWith('기자수첩')),false);
assert.equal(selected.some(row=>row.keyword==='정상후보25'),true,'제외된 문장 조각 대신 다음 순위 후보가 승격돼야 합니다.');

assert.equal(shouldRetryCandidate({code:'INSUFFICIENT_KEYWORD_EVIDENCE',message:'키워드의 정체 또는 현재 이슈를 설명할 확인 자료를 확보하지 못했습니다.'}),true,'근거 부족은 1회 영구 실패가 아니라 확장 조사 재시도 대상이어야 합니다.');

const research=buildIndependentResearchTrend({
  keyword:'이기려고 한',topKeyword:'이기려고 한',rawKeyword:'이기려고 한',slug:'broken-fragment',rank:3,
  relatedArticles:[
    {title:'홍길동 감독, 결승에서 이기려고 한 전략 공개'},
    {title:'홍길동 감독 경기 전략 인터뷰'},
  ],
  keywordCandidates:[],researchAttempt:2,
},2);
assert.equal(research.keyword,'홍길동','기사 제목은 사실 근거로 쓰지 않되 반복 확인된 대표 엔티티를 검색 힌트로 사용해야 합니다.');
assert.equal(research.originalRankedKeyword,'이기려고 한');
assert.ok(research.identityHints.includes('홍길동'));
assert.ok(research.sourceTitleHints.length>=2);
assert.equal(research.researchIsolation.topDiscoveryLinksUsed,false);

const apiSource=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../lib/api.js',import.meta.url),'utf8'));
assert.match(apiSource,/researchCheckpoint:true/,'근거 부족 예외도 실행별 stage 체크포인트를 남겨야 합니다.');
assert.match(apiSource,/resolveTop30Keyword\(\{/,'독립 조사 결과로 대표 키워드를 다시 검증해야 합니다.');

const adminActionSource=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../pages/api/admin-action.js',import.meta.url),'utf8'));
assert.match(adminActionSource, /candidatePoolRebuildRequired/, 'old fixed pools containing invalid fragments must not be resumed');
assert.match(adminActionSource, /researchCandidateEntryRejectionReasons\(candidate\)/, 'resume must revalidate saved fixed candidates');

console.log('v8.0.52 candidate evidence recovery tests passed');
