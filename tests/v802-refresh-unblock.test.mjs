import assert from 'node:assert/strict';
import { buildFactLedger, decidePublication } from '../lib/contentPolicy.js';

const sources=[
  {
    title:'카카오 서비스 장애 발생 뒤 복구 완료',
    description:'카카오는 20일 오전 서비스 장애가 발생했다고 발표했다. 카카오는 같은 날 오후 서비스 복구를 완료했다고 밝혔다. 회사는 21일 후속 점검을 진행할 계획이라고 설명했다.',
    link:'https://yna.co.kr/view/test-a',source:'연합뉴스',sourceType:'trusted_news',evidenceUsable:true,contentUsable:true,publishedAt:'2026-06-20T02:00:00.000Z',
  },
  {
    title:'카카오 접속 장애 복구, 추가 점검 예정',
    description:'카카오 서비스에서 20일 오전 접속 장애가 발생했다. 서비스는 이날 오후 복구됐으며 카카오는 21일 추가 점검을 시행할 예정이다.',
    link:'https://kbs.co.kr/news/test-b',source:'KBS',sourceType:'trusted_news',evidenceUsable:true,contentUsable:true,publishedAt:'2026-06-20T03:00:00.000Z',
  },
];
const ledger=buildFactLedger(sources);
const confirmed=ledger.facts.filter(fact=>fact.status==='confirmed');
assert.ok(ledger.facts.length>=3,'두 독립 언론의 검색 메타데이터에서 핵심 사실을 구성해야 합니다.');
assert.ok(confirmed.length>=3,'문장이 완전히 같지 않아도 같은 사건을 다룬 독립 출처 2곳이면 사건 맥락 교차 확인이 가능해야 합니다.');

const sensitiveContent={
  contentTier:'standard',
  feedTitle:'기준금리 발표 이후 금융시장 변동 정리',detailTitle:'기준금리 발표와 금융시장 반응에서 확인된 변화',displayTitle:'기준금리 · 정책 변화',topTitle:'기준금리 · 정책 변화',
  blog:'## 키워드 한눈에 보기\n기준금리 발표 내용이 확인됐습니다.\n\n## 최근 36시간 주요 동향\n공식 발표 이후 시장 수치가 집계됐습니다.\n\n## STELLATE 인사이트\n확인된 수치와 후속 발표를 살펴봐야 합니다.',
  card:{summary:'기준금리 발표 내용과 발표 이후 확인된 시장 수치를 정리했습니다. 공식 발표와 독립 보도를 통해 현재 확인 가능한 변화를 설명합니다.',why:'공식 발표 이후 시장 변화가 확인됐습니다.',points:['기준금리 발표','시장 수치 확인','후속 발표 일정']},
  claimMap:[],qa:[],instagramCards:[],
};
const decision=decidePublication({content:sensitiveContent,sourceItems:sources,ledger,qualityScore:90,category:'economy'});
assert.equal(decision.sensitive,true,'금융 주제의 민감도 표시는 유지합니다.');
assert.equal(decision.reasons.some(reason=>reason.includes('민감 주제')),false,'민감 주제라는 이유만으로 자동 탈락시키면 안 됩니다.');
console.log('v8.0.2 refresh unblock tests passed');
