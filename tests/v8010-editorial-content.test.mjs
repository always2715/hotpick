import assert from 'node:assert/strict';
import fs from 'node:fs';
import { derivePostResearchTitle } from '../lib/editorialTitle.js';
import { buildVerifiedFallback } from '../lib/editorialContent.js';
import { buildRelatedNews, buildRelatedContent, sanitizeExternalLinksForStorage } from '../lib/contentArchitecture.js';

const ledger={
  facts:[
    {id:'F1',text:'앤 해서웨이가 셋째 아이 임신 소식을 직접 발표했다.',subject:'앤 해서웨이',predicate:'발표했다',values:[],sourceIds:['S1','S2'],status:'confirmed'},
    {id:'F2',text:'출산 예정일과 아이의 성별은 공개되지 않았다.',subject:'앤 해서웨이',predicate:'',values:[],sourceIds:['S1'],status:'single_source'},
  ],
  sources:[{id:'S1',source:'A뉴스',domain:'a.example',url:'https://a.example/source',sourceType:'trusted_news'},{id:'S2',source:'B뉴스',domain:'b.example',url:'https://b.example/source',sourceType:'trusted_news'}],
  uncertainties:['출산 예정일과 성별은 공개되지 않았습니다.'],conflicts:[],
};

const title=derivePostResearchTitle('앤 해서웨이',{shortTitle:'셋째 임신 발표',summary:'앤 해서웨이가 셋째 임신 사실을 공개했습니다.'},ledger,[]);
assert.equal(title.topTitle,'앤 해서웨이 · 셋째 임신 발표');
assert.equal(title.topTopic,'셋째 임신 발표');

const genericTitle=derivePostResearchTitle('앤 해서웨이',{shortTitle:'수치 변화',summary:'앤 해서웨이가 셋째 아이 임신 소식을 직접 발표했습니다.'},ledger,[]);
assert.equal(genericTitle.topTitle,'앤 해서웨이 · 셋째 임신 발표','포괄 제목 대신 상세 사실에서 사건명을 만들어야 합니다.');

const fallback=buildVerifiedFallback('앤 해서웨이',ledger,36,'standard');
assert.equal(fallback.shortTitle,'셋째 임신 발표');
assert.equal(fallback.feedTitle,'앤 해서웨이 · 셋째 임신 발표');
assert.match(fallback.blog,/셋째 아이 임신 소식을 직접 발표했습니다/);
assert.match(fallback.blog,/출산 예정일과 아이의 성별은 공개되지 않았습니다/);
assert.doesNotMatch(fallback.blog,/수치 변화|상태 변화|시장 가격 변동/);

const apiSource=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(apiSource,/먼저 전체 상세 내용을 작성한 뒤/);
assert.match(apiSource,/derivePostResearchTitle\(topicTitle,pkg/);
assert.match(apiSource,/COPYRIGHT_REWRITE_FALLBACK/);
assert.doesNotMatch(apiSource,/buildLatestNewsFallback/);
assert.match(apiSource,/selectCuratedThumbnailForContent/);
assert.match(apiSource,/preferredImageMeta\|\|existingContent\?\.imageMeta/);
assert.doesNotMatch(apiSource,/preferredImageMeta\|\|videoImageMeta\|\|sourceImageMeta/);

const news=buildRelatedNews([
  {title:'앤 해서웨이, 셋째 임신 발표…D라인 공개',link:'https://a.example/one',source:'A',publishedAt:'2026-06-21T01:00:00Z'},
  {title:'앤 해서웨이 셋째 임신 발표, 직접 영상 공개',link:'https://b.example/two',source:'B',publishedAt:'2026-06-21T02:00:00Z'},
  {title:'앤 해서웨이의 새로운 영화 출연 확정',link:'https://c.example/three',source:'C',publishedAt:'2026-06-21T03:00:00Z'},
  {title:'앤 해서웨이 신작 영화 캐스팅 확정',link:'https://d.example/four',source:'D',publishedAt:'2026-06-21T04:00:00Z'},
], '앤 해서웨이');
assert.equal(news.length,2,'같은 사건의 제목 변형은 하나로 병합해야 합니다.');
assert.equal(news[0].displayTitle,'앤 해서웨이, 셋째 임신 발표…D라인 공개');
const stored=sanitizeExternalLinksForStorage(news);
assert.equal(stored[0].displayTitle,'앤 해서웨이, 셋째 임신 발표…D라인 공개');
assert.equal(stored[0].transientOriginalTitle,undefined);

const content=buildRelatedContent([
  {title:'앤 해서웨이, 셋째 임신 발표…D라인 공개',link:'https://a.example/one',source:'A',type:'reference'},
  {title:'별도 공식 프로필',link:'https://official.example/profile',source:'공식',type:'reference'},
], '앤 해서웨이');
assert.ok(content.length<=3);

const refreshJob=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(refreshJob,/const thumbnail=imageMeta\?\.thumbUrl\|\|imageMeta\?\.imageUrl\|\|null/);
assert.doesNotMatch(refreshJob,/videoThumb/);
assert.match(refreshJob,/const publicationRows = readyRows/);
assert.doesNotMatch(refreshJob,/validCarryoverRows|combinePublicationRows|shouldCommitProgressiveRecovery/);
const detailPage=fs.readFileSync(new URL('../pages/feed/[slug].js',import.meta.url),'utf8');
assert.match(detailPage,/const relatedNews=dedupeSources\(Array\.isArray\(content\.relatedNews\)\?content\.relatedNews:\[\]\)\.slice\(0,3\)/);
assert.match(detailPage,/item\.displayTitle\|\|item\.title\|\|item\.label/);
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/contentVersion:136/);
assert.match(version,/trendCacheVersion:53/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
console.log('v8.0.12 post-research title compatibility tests passed');
