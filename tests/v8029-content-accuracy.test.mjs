import assert from 'node:assert/strict';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { buildFeedSummaryCard } from '../lib/feedFirstPipeline.js';
import { sanitizeEvidenceForStorage, sanitizeLedgerForStorage } from '../lib/contentArchitecture.js';
import { validateGeneratedPackageAccuracy } from '../lib/contentAccuracy.js';
import { normalizeRelatedVideos } from '../lib/researchPipeline.js';

const now=new Date().toISOString();
const ledger={
  version:4,
  sources:[
    {id:'S1',title:'공식 서비스 출시 안내',source:'공식기관',url:'https://example.go.kr/notice?id=1&utm_source=test',domain:'example.go.kr',sourceType:'official',publishedAt:now},
    {id:'S2',title:'같은 공식 서비스 출시 안내',source:'공식기관',url:'https://example.go.kr/notice?id=1',domain:'example.go.kr',sourceType:'official',publishedAt:now},
  ],
  facts:[
    {id:'F1',text:'공식기관은 2026년 6월 24일 신규 서비스를 출시한다고 발표했습니다.',scope:'issue',sourceIds:['S1','S2'],sourceType:'official',status:'confirmed',confidence:1},
    {id:'PF1',text:'테스트 서비스는 온라인 정보 제공 서비스입니다.',scope:'profile',sourceIds:['S1'],sourceType:'official',status:'confirmed',confidence:1},
  ],
  confirmedFacts:['F1','PF1'],conflicts:[],uncertainties:[],
};

const storedLedger=sanitizeLedgerForStorage(ledger);
assert.equal(storedLedger.version,4);
assert.equal(storedLedger.sources.length,1,'동일 canonical URL 출처는 한 건만 저장해야 합니다.');
assert.equal(storedLedger.facts[0].text,'공식기관은 2026년 6월 24일 신규 서비스를 출시한다고 발표했습니다.','실제 Fact 문장을 일반화 문구로 바꾸면 안 됩니다.');
assert.ok(!storedLedger.facts.some(fact=>/수치 변화|상태 변화|확인 사실이 확인/.test(fact.text)));

const evidence=sanitizeEvidenceForStorage([
  {title:'공식 서비스 출시 안내',source:'공식기관',link:'https://example.go.kr/notice?id=1&utm_source=a',sourceType:'official',publishedAt:now},
  {title:'중복 제목',source:'공식기관',link:'https://example.go.kr/notice?id=1',sourceType:'official',publishedAt:now},
],'테스트 서비스');
assert.equal(evidence.length,1);
assert.equal(evidence[0].title,'공식 서비스 출시 안내');

const pkg=buildVerifiedFallback('테스트 서비스',storedLedger,36,'standard');
const accuracy=validateGeneratedPackageAccuracy(pkg,storedLedger);
assert.equal(accuracy.passed,true,accuracy.problems.join(' / '));
const card=buildFeedSummaryCard({keyword:'테스트 서비스',feedTitle:pkg.topTitle,blog:pkg.blog,sections:pkg.sections,factLedger:storedLedger});
assert.ok(card.summary.includes('2026년 6월 24일'));
assert.ok(!card.summary.includes('[object Object]'));
assert.ok(!card.points.some(point=>point.includes('[object Object]')));
assert.ok(!/관심이 증가|핵심 정보를 정리/.test(card.summary));

const badPackage={sections:[{heading:'현재 이슈',paragraphs:[{text:'이 서비스는 2027년에 시장을 완전히 바꿀 전망입니다.',claimIds:['F1']}]}],qa:[],instagramCards:[]};
const badAccuracy=validateGeneratedPackageAccuracy(badPackage,storedLedger);
assert.equal(badAccuracy.passed,false,'근거에 없는 날짜·전망은 차단해야 합니다.');

const videos=normalizeRelatedVideos([
  {id:'trusted1',title:'테스트 서비스 공식 출시 발표',channel:'테스트 서비스 공식',url:'https://www.youtube.com/watch?v=trusted1',publishedAt:now,thumbnail:'https://img.example/trusted.jpg',channelTrusted:true,relevanceScore:90},
  {id:'personal1',title:'테스트 서비스 써봤습니다',channel:'개인 브이로그',url:'https://www.youtube.com/watch?v=personal1',publishedAt:now,thumbnail:'https://img.example/personal.jpg',channelTrusted:false,relevanceScore:40},
],'테스트 서비스');
assert.equal(videos.length,1);
assert.equal(videos[0].id,'trusted1');

console.log('v8.0.29 content accuracy tests passed');
