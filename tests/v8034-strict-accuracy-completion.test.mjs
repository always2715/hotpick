import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { validateGeneratedPackageAccuracy } from '../lib/contentAccuracy.js';
import { validateTopCandidateKeyword } from '../lib/editorialTitle.js';

const source=(id,type='trusted_news')=>({id,title:`${id} 확인 자료`,source:'검증 매체',url:`https://example.com/${id.toLowerCase()}`,domain:'example.com',sourceType:type});

assert.equal(validateTopCandidateKeyword('여야 징벌적').valid,false,'주체+관형어로 끝난 기사 제목 조각은 TOP20 후보에서 제외해야 합니다.');
assert.equal(validateTopCandidateKeyword('김대규').valid,true);
assert.equal(validateTopCandidateKeyword('강득구').valid,true);

const cases=[
  {
    keyword:'김대규',
    ledger:{sources:[source('S1')],facts:[{id:'F1',text:'김대규 감독은 구단 운영 방향과 다음 경기 준비 계획을 설명했다.',scope:'issue',sourceIds:['S1'],sourceType:'trusted_news',status:'confirmed'}],conflicts:[]},
  },
  {
    keyword:'강득구',
    ledger:{sources:[source('S1','official'),source('S2')],facts:[
      {id:'PF1',text:'강득구는 대한민국 국회의원이다.',scope:'profile',sourceIds:['S1'],sourceType:'official',status:'confirmed'},
      {id:'F1',text:'강득구 의원은 교육 정책과 관련한 입장을 밝혔다.',scope:'issue',sourceIds:['S2'],sourceType:'trusted_news',status:'confirmed'},
    ],conflicts:[]},
  },
];

for(const row of cases){
  const pkg=buildVerifiedFallback(row.keyword,row.ledger,36,'standard');
  const accuracy=validateGeneratedPackageAccuracy(pkg,row.ledger);
  assert.equal(accuracy.passed,true,`${row.keyword}: ${accuracy.problems.join(' / ')}`);
  assert.equal(pkg.titleReady,true,`${row.keyword} 최소 사실형 패키지는 최종 제목까지 준비돼야 합니다.`);
  assert.match(pkg.topTitle,new RegExp(`^${row.keyword} · .{4,18}$`));
  assert.match(pkg.accuracyProjection,/^fact_ledger_literal_v(?:2|3_editorial|4_precise_editorial)$/);
  assert.ok(pkg.blog.includes(row.keyword));
}

const badRevision={
  sections:[{heading:'전망',paragraphs:[{text:'강득구 의원의 정책은 2027년에 큰 영향을 미칠 전망입니다.',claimIds:['F1']}]}],
  qa:[],instagramCards:[],
};
assert.equal(validateGeneratedPackageAccuracy(badRevision,cases[1].ledger).passed,false,'근거에 없는 날짜와 전망을 포함한 수정안은 계속 차단해야 합니다.');

const apiSource=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const refreshSource=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const versionSource=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(apiSource,/const revisedAccuracy=validateGeneratedPackageAccuracy\(revisedPkg,factLedger\)/,'AI 수정안은 채택 전에 정확성 검사를 통과해야 합니다.');
assert.match(apiSource,/const strictPkg=buildVerifiedFallback\(topicTitle,factLedger,sourceWindowHours,contentTier\)/,'마지막 정확성 실패 시 Fact Ledger 결정론적 재작성 경로가 있어야 합니다.');
assert.match(apiSource,/aiStatus='verified_literal_fallback'/,'결정론적 정확성 복구 성공 상태를 기록해야 합니다.');
assert.match(refreshSource,/STRICT_CONTENT_ACCURACY_FAILED\|NO_ACCURATE_CONTENT/,'정확성 실패가 남으면 한 번에 영구 실패시키지 말고 제한된 추가 조사를 허용해야 합니다.');
assert.match(versionSource,/contentVersion:137/);
assert.match(versionSource,/trendCacheVersion:54/);
assert.match(versionSource,/publicTopCount:20/);

console.log('STELLATE v8.0.34 strict accuracy completion tests: PASS');
