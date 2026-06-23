import assert from 'node:assert/strict';
import { isPublicContentReady, publicContentRejectionReasons, sanitizePublicCopy, containsForbiddenPublicCopy } from '../lib/publicationPolicy.js';

function validContent(){
  return {
    slug:'verified-event',status:'published',visibility:'published',contentMode:'detailed',contentType:'detailed',hasContent:true,
    topKeyword:'카카오',topTopic:'서비스 장애 복구',topTitle:'카카오 · 서비스 장애 복구',displayTitle:'카카오 · 서비스 장애 복구',feedTitle:'카카오 · 서비스 장애 복구',detailTitle:'카카오 · 서비스 장애 복구',titleStatus:'ready',titleReady:true,titleSource:'fact_ledger_fallback',
    blog:'## 키워드 한눈에 보기\n카카오가 서비스 장애 복구를 발표했습니다.\n\n## 최근 36시간 주요 동향\n복구 상태와 점검 일정이 확인됐습니다.\n\n## STELLATE 인사이트\n공식 점검 결과를 추가로 확인해야 합니다.',
    card:{feedTitle:'카카오 · 서비스 장애 복구',detailTitle:'카카오 · 서비스 장애 복구',summary:'카카오가 서비스 장애 복구와 후속 점검 일정을 공식 발표했습니다. 서비스 이용자는 최신 앱 상태와 공식 공지를 확인해야 합니다.',why:'서비스 이용자는 최신 앱 상태와 공식 공지를 확인해야 합니다.',points:['장애 발생 시점 확인','복구 완료 발표','후속 점검 일정']},
    qa:[],instagramCards:[],groundingScore:95,copyrightRisk:{passed:true},
    evidenceSources:[
      {sourceType:'trusted_news',domain:'yna.co.kr',link:'https://yna.co.kr/a'},
      {sourceType:'trusted_news',domain:'kbs.co.kr',link:'https://kbs.co.kr/b'},
    ],
    factLedger:{facts:[
      {id:'F1',status:'confirmed',sourceType:'trusted_news'},
      {id:'F2',status:'confirmed',sourceType:'trusted_news'},
      {id:'F3',status:'confirmed',sourceType:'trusted_news'},
    ]},
  };
}
const valid=validContent();
assert.equal(isPublicContentReady(valid),true,'신뢰 근거와 연결된 사실이 있으면 공개 준비가 가능합니다.');
assert.deepEqual(publicContentRejectionReasons(valid),[]);

const forbidden={...valid,card:{...valid.card,why:'B등급 후보로 기본 브리핑을 생성했습니다.'}};
assert.equal(containsForbiddenPublicCopy(forbidden),true);
assert.equal(isPublicContentReady(forbidden),false);
assert.ok(publicContentRejectionReasons(forbidden).some(reason=>reason.includes('내부 진단')));

const singleSource={...valid,evidenceSources:[valid.evidenceSources[0]],factLedger:{facts:[{id:'F1',status:'single_source',sourceIds:['S1']}]}};
assert.equal(isPublicContentReady(singleSource),true,'신뢰 출처 1개와 연결 사실 1개는 자동 공개할 수 있어야 합니다.');
const noEvidence={...valid,evidenceSources:[],factLedger:{facts:[]}};
assert.equal(isPublicContentReady(noEvidence),false);
assert.ok(publicContentRejectionReasons(noEvidence).some(reason=>reason.includes('근거')));

const publicView=sanitizePublicCopy({...valid,rankingGrade:'B',rankingScore:77,publicationReasons:['내부'],aiError:'internal',onlineReactionRanking:{score:10},onlineReactionInput:{useForRanking:true}});
assert.equal(publicView.rankingGrade,undefined);
assert.equal(publicView.rankingScore,undefined);
assert.equal(publicView.publicationReasons,undefined);
assert.equal(publicView.aiError,undefined);
assert.equal(publicView.onlineReactionRanking,undefined);
assert.equal(publicView.onlineReactionInput,undefined);
console.log('v8 publication policy tests passed');
