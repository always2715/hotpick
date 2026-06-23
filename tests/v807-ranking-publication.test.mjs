import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOnlineReactionRankingSignal, onlineReactionInputPolicy } from '../lib/onlineReactionPipeline.js';
import { evaluateTrendCandidate } from '../lib/rankingEngine.js';
import { decidePublication } from '../lib/contentPolicy.js';
import { isAutomaticPublicationReady, sanitizePublicCopy } from '../lib/publicationPolicy.js';

const now=new Date().toISOString();
const reactionItems=[
  {type:'blog',title:'기대 반응 1',description:'서비스 변화가 기대된다는 반응',link:'https://blog.naver.com/a',publishedAt:now},
  {type:'blog',title:'기대 반응 2',description:'새 기능이 편리하다는 반응',link:'https://blog.naver.com/b',publishedAt:now},
  {type:'cafe',title:'우려 반응 1',description:'적용 오류가 걱정된다는 반응',link:'https://cafe.naver.com/c',publishedAt:now},
  {type:'cafe',title:'질문 반응 1',description:'적용 일정이 궁금하다는 반응',link:'https://cafe.naver.com/d',publishedAt:now},
];
const signal=buildOnlineReactionRankingSignal(reactionItems);
assert.ok(signal.score>=4&&signal.score<=10);
assert.equal(onlineReactionInputPolicy().useForRanking,true);

const common={keyword:'테스트 서비스 변경',trafficValue:10000,googleRank:5,articles:[
  {title:'테스트 서비스 변경 내용 공개',link:'https://yna.co.kr/a',publishedAt:now},
],relatedNews:[],categoryConfidence:.8};
const without=evaluateTrendCandidate({...common,communitySignal:0});
const withOnline=evaluateTrendCandidate({...common,communitySignal:10});
assert.equal(withOnline.score,Math.min(100,without.score+10));
assert.equal(withOnline.components.onlineReaction,10);

const fact={id:'F1',text:'테스트 서비스가 새 기능을 공개했습니다.',status:'single_source',sourceIds:['S1'],sourceType:'trusted_news'};
const source={id:'S1',title:'테스트 서비스 기능 업데이트 안내',description:'회사 측은 이용 흐름을 바꾸는 기능 업데이트와 적용 일정을 안내했다.',link:'https://yna.co.kr/test',domain:'yna.co.kr',sourceType:'trusted_news',evidenceUsable:true,contentUsable:true};
const content={
  aiStatus:'verified_fallback',contentTier:'standard',contentMode:'detailed',contentType:'detailed',hasContent:true,
  blog:'## 키워드 한눈에 보기\n테스트 서비스와 관련한 기능 변경 사실이 신뢰 자료에서 확인됐습니다.',
  claimMap:[{text:'테스트 서비스와 관련한 기능 변경 사실이 신뢰 자료에서 확인됐습니다.',claimIds:['F1']}],
  card:{summary:'테스트 서비스가 새 기능을 공개한 사실이 확인됐습니다. 주요 변경 내용은 공식 안내와 신뢰할 수 있는 보도를 통해 확인할 수 있습니다.',why:'서비스 이용 방식에 영향을 줄 수 있는 변경입니다.',points:['새 기능 공개']},
  qa:[],instagramCards:[],topKeyword:'테스트 서비스',topTopic:'새 기능 공개',topTitle:'테스트 서비스 · 새 기능 공개',feedTitle:'테스트 서비스 · 새 기능 공개',detailTitle:'테스트 서비스 · 새 기능 공개',displayTitle:'테스트 서비스 · 새 기능 공개',titleStatus:'ready',titleReady:true,
  copyrightRisk:{passed:true,maxSimilarity:0,longPhraseMatches:0},groundingScore:100,
  evidenceSources:[source],sourceItems:[source],factLedger:{facts:[fact],conflicts:[]},
};
const decision=decidePublication({content,sourceItems:[source],ledger:content.factLedger,qualityScore:20,category:'tech'});
const final={...content,status:decision.status,visibility:decision.visibility,reviewRequired:decision.reviewRequired,publicationDecision:decision};
assert.equal(decision.publishable,true,'낮은 편집 품질점수만으로 검토 대기로 보내면 안 됩니다.');
assert.equal(isAutomaticPublicationReady(final),true,'신뢰 근거 1개와 연결 사실 1개는 자동 공개되어야 합니다.');
const publicCopy=sanitizePublicCopy({...final,onlineReactionRanking:signal,onlineReactionInput:onlineReactionInputPolicy()});
assert.equal(publicCopy.onlineReactionRanking,undefined);
assert.equal(publicCopy.onlineReactionInput,undefined);

const conflictDecision=decidePublication({content,sourceItems:[source],ledger:{facts:[fact],conflicts:[{reason:'수치 충돌'}]},qualityScore:100,category:'tech'});
assert.equal(conflictDecision.reviewRequired,true,'실제 사실 충돌은 관리자 검토로 보내야 합니다.');

const detailSource=fs.readFileSync(new URL('../pages/feed/[slug].js',import.meta.url),'utf8');
const apiSource=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(apiSource,/온라인 반응은 내부 참고 데이터로 유지하되 피드 본문/,'온라인 반응은 순위 보조 신호로만 격리해야 합니다.');
assert.doesNotMatch(apiSource,/chunks\.push\(`## 온라인 동향`\)/,'온라인 반응을 피드 본문 섹션으로 노출하면 안 됩니다.');
const kvSource=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
assert.doesNotMatch(kvSource,/onlineReactions:/,'온라인 반응 요약은 공개 피드 데이터에 저장하지 않습니다.');
const refreshSource=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.doesNotMatch(refreshSource,/hasGeneratedContent\?'review':'pending'/,'TOP30 키워드는 검토·대기 상태로 탈락시키지 않아야 합니다.');
assert.match(refreshSource,/KEYWORD_CONTENT_EXHAUSTED/,'제한된 추가 검색 후에는 기술 실패 코드로 종료해야 합니다.');
assert.doesNotMatch(refreshSource,/shouldCommitProgressiveRecovery/,'TOP 30 미완성 목록을 부분 공개하면 안 됩니다.');
assert.match(refreshSource,/publicationRows\.length !== TARGET_TOP_COUNT/,'30건이 아니면 기존 TOP을 유지해야 합니다.');
console.log('v8.0.7 ranking-only online reaction and auto-publication tests passed');
