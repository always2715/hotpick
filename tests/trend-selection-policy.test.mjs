import assert from 'node:assert/strict';
import { isLimitedTrendCandidate, isPublicTopCandidate, publicTopRejectionReasons, researchCandidateRejectionReasons, researchCandidateEntryRejectionReasons, selectVisibleTrendPool, isSamePublicEvent } from '../lib/trendSelectionPolicy.js';

const strict={keyword:'삼성전자 실적',rawKeyword:'삼성전자 실적',topKeyword:'삼성전자',topTopic:'실적 발표',displayTitle:'삼성전자 · 실적 발표',mainVisible:true,rankingEligible:true,rankingScore:82,rankingGrade:'B',independentSources:2,officialSources:0,eventCoherence:75,category:'economy',categoryConfidence:0.82,newestArticleHours:2,googleRank:2};
const generic={keyword:'한정 검증',topKeyword:'한정 검증',topTopic:'현재 상황',mainVisible:false,rankingScore:62,rankingGrade:'C',independentSources:1,eventCoherence:58,newestArticleHours:4,googleRank:1};
const noSource={keyword:'검색어만 급등',topKeyword:'검색어',topTopic:'제품 출시',mainVisible:false,rankingScore:70,rankingGrade:'C',independentSources:0,eventCoherence:70,newestArticleHours:2,rankingReasons:['최근 36시간 동일 사건 기사 없음']};
const videoTitle={keyword:'진짜 떴습니다 스파이더맨 예고편 리뷰',rawKeyword:'진짜 떴습니다 스파이더맨 예고편 리뷰',topKeyword:'스파이더맨',topTopic:'방송·작품 소식',mainVisible:true,rankingEligible:true,rankingScore:80,rankingGrade:'B',independentSources:1,officialSources:0,eventCoherence:73,category:'entertainment',categoryConfidence:0.8};
const unsupportedVideo={keyword:'스파이더맨 예고편 리뷰',rawKeyword:'스파이더맨 예고편 리뷰',topKeyword:'스파이더맨',topTopic:'현재 상황',rankingScore:65,independentSources:0,officialSources:0,relatedArticles:[]};

assert.equal(isLimitedTrendCandidate(generic),false);
assert.equal(researchCandidateRejectionReasons(strict).length,0);
assert.ok(researchCandidateRejectionReasons(generic).some(reason=>reason.includes('구체적 사건')));
assert.ok(researchCandidateRejectionReasons(noSource).some(reason=>reason.includes('조사 시작')));
assert.ok(researchCandidateRejectionReasons(videoTitle).some(reason=>reason.includes('영상')));
assert.equal(researchCandidateEntryRejectionReasons(generic).length,0,'일반 사건명은 조사 후 구체화할 수 있어 초기 단계에서 탈락시키지 않습니다.');
assert.equal(researchCandidateEntryRejectionReasons(noSource).length,0,'초기 뉴스 근거가 없어도 멀티소스 조사 대상으로 유지합니다.');
assert.equal(researchCandidateEntryRejectionReasons(videoTitle).length,0,'독립 출처 신호가 있는 영상형 후보는 조사할 수 있습니다.');
assert.equal(researchCandidateEntryRejectionReasons(unsupportedVideo).length,0,'영상형 후보도 멀티소스 조사 전에 자동 탈락시키지 않습니다.');

const selected=selectVisibleTrendPool([generic,noSource,strict,videoTitle,unsupportedVideo]);
assert.deepEqual(selected.map(item=>item.keyword),['삼성전자 실적','진짜 떴습니다 스파이더맨 예고편 리뷰','검색어만 급등','스파이더맨 예고편 리뷰','한정 검증']);
assert.equal(selected[0].publicTopPolicy,'research_pending_v3');
assert.equal(selected[0].visibility,'private');
assert.equal(isPublicTopCandidate(selected[0]),false,'조사 후보는 상세 검증 전 공개할 수 없습니다.');

const published={...selected[0],visibility:'published',mainVisible:true,publicTopPolicy:'atomic_verified_event_v3',publicReady:true,contentReady:true,verifiedFactCount:3,verifiedEvidenceCount:2};
assert.equal(isPublicTopCandidate(published),true);
assert.equal(isPublicTopCandidate({...published,publicReady:false}),false);
assert.ok(publicTopRejectionReasons({...published,verifiedFactCount:0}).some(reason=>reason.includes('없음')));

const sameA={eventKey:'event-1',topKeyword:'동궁',topTopic:'방송·작품 소식'};
const sameB={eventKey:'event-1',topKeyword:'동궁 넷플릭스',topTopic:'방송·작품 소식'};
assert.equal(isSamePublicEvent(sameA,sameB),true);
const different={eventKey:'event-2',topKeyword:'동궁',topTopic:'출연진 발표'};
assert.equal(isSamePublicEvent(sameA,different),false,'같은 주체의 다른 사건은 제목 유사도만으로 병합하지 않습니다.');
console.log('trend selection v8 tests passed');
