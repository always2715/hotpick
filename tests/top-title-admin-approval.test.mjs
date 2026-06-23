import assert from 'node:assert/strict';
import { buildNeutralTopTitleParts, applyManualCandidateApproval } from '../lib/trends.js';
import { researchCandidateRejectionReasons, selectVisibleTrendPool } from '../lib/trendSelectionPolicy.js';

const drama=buildNeutralTopTitleParts('신입사원 강회장',[
  '신입사원 강회장 8회 예고편 공개, 주말 방송 예정',
  '신입사원 강회장 시청률 자체 최고 기록',
], '', '', {categoryHint:'entertainment'});
assert.notEqual(drama.topTopic,'시장·가격 변동');
assert.equal(drama.topKeyword,'신입사원 강회장');
assert.ok(['방송 내용 공개','시청률 변화','방송·작품 소식'].includes(drama.topTopic));

const player=buildNeutralTopTitleParts('성영탁',[
  'KIA 성영탁 9회 마무리 투수로 등판해 세이브',
  '성영탁 탈삼진 3개 호투로 승리 지켜',
], '', '', {categoryHint:'sports'});
assert.notEqual(player.topTopic,'시장·가격 변동');
assert.ok(['경기 활약','경기 결과','출전 상황'].includes(player.topTopic));

const actor=buildNeutralTopTitleParts('앤 해서웨이',[
  '앤 해서웨이 신작 영화 출연 확정',
], '', '', {categoryHint:'entertainment'});
assert.equal(actor.topKeyword,'앤 해서웨이','한국어 한 글자 인명 토큰을 보존해야 합니다.');
assert.equal(actor.topTopic,'출연 소식');

const falseMarket=buildNeutralTopTitleParts('드라마 제목',[
  '시청률 상승과 주연 배우 활약으로 화제',
], '', '', {categoryHint:'entertainment'});
assert.notEqual(falseMarket.topTopic,'시장·가격 변동','일반 상승 표현을 시장 가격 사건으로 분류하면 안 됩니다.');

const rejected={
  keyword:'성영탁',rawKeyword:'성영탁',eventKey:'성영탁-현재-상황',trendKey:'성영탁',
  topKeyword:'성영탁',topTopic:'현재 상황',topTitle:'성영탁',displayTitle:'성영탁',
  category:'general',categoryConfidence:0.2,topTopicSupport:0,eventCoherence:20,
  rankingScore:40,rankingGrade:'D',googleRank:5,relatedArticles:[{title:'성영탁 마무리 투수 등판 호투'}],
};
assert.ok(researchCandidateRejectionReasons(rejected).length>0);
const approved=applyManualCandidateApproval(rejected,[{
  key:'성영탁현재상황',keyword:'성영탁',eventKey:'성영탁-현재-상황',approved:true,
  overrides:{topKeyword:'성영탁',topTopic:'경기 활약',topTitle:'성영탁 · 경기 활약',category:'sports',searchQuery:'성영탁 경기 활약'},
}]);
assert.equal(approved.manualApproved,true);
assert.equal(approved.displayTitle,'성영탁 · 경기 활약');
assert.equal(approved.category,'sports');
const selected=selectVisibleTrendPool([approved]);
assert.equal(selected.length,1,'관리자 승인 후보는 자동 탈락 조건을 우회해 조사 대상에 포함되어야 합니다.');
assert.equal(selected[0].publicTopPolicy,'research_pending_v3');

console.log('top title and admin approval tests passed');
