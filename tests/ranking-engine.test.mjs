import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateTrendCandidate, clusterEventArticles, articleSignatureSet, tokens } from '../lib/rankingEngine.js';

const now=new Date().toISOString();
const fixtures=JSON.parse(await readFile(new URL('./golden/ranking-fixtures.json',import.meta.url),'utf8'));
for(const fixture of fixtures){
  const articles=(fixture.articles||[]).map(row=>({...row,publishedAt:row.publishedAt||now}));
  const result=evaluateTrendCandidate({...fixture,articles,categoryConfidence:.9});
  assert.equal(result.eligible,fixture.expectedEligible,`${fixture.name}: eligibility mismatch (${result.hardReasons.join(', ')})`);
}

const cluster=clusterEventArticles('수소',[
  {title:'수소차 신제품 발표',link:'https://a.example.com/a',publishedAt:now},
  {title:'수소 발전소 사고 조사',link:'https://b.example.com/b',publishedAt:now},
  {title:'수소 관련주 상승',link:'https://c.example.com/c',publishedAt:now},
]);
assert.ok(cluster.clusters.length>=2,'ambiguous generic keyword should form multiple clusters');
// v7.7.0: 사건 중복 병합(기사 겹침) 회귀 테스트
function wouldMerge(a,b){
  const A=articleSignatureSet(a),B=articleSignatureSet(b);
  const overlap=A.filter(x=>B.includes(x)).length, minLen=Math.min(A.length,B.length);
  return overlap>=2 || (overlap>=1 && minLen>=2 && overlap/minLen>=0.5);
}
const sameEventA=[{title:'카카오 서비스 장애 발생',link:'https://a/1',source:'A'},{title:'카카오톡 먹통 데이터센터',link:'https://b/2',source:'B'},{title:'카카오 복구 상황',link:'https://c/3',source:'C'}];
const sameEventB=[{title:'카카오톡 먹통 데이터센터',link:'https://b/2',source:'B'},{title:'카카오 복구 상황',link:'https://c/3',source:'C'}];
assert.equal(wouldMerge(sameEventA,sameEventB),true,'같은 사건/다른 검색어는 병합되어야 함');
const diffEvent=[{title:'전혀 다른 사건 보도',link:'https://x/9',source:'X'}];
assert.equal(wouldMerge(sameEventA,diffEvent),false,'단일출처 무관 사건은 병합되면 안 됨');
assert.deepEqual(tokens('앤 해서웨이'),['앤','해서웨이'],'다중 한국어 인명에서 한 글자 이름 토큰을 보존해야 합니다.');
console.log('ranking-engine dedup tests passed');

console.log(`ranking-engine golden tests passed (${fixtures.length} fixtures)`);
