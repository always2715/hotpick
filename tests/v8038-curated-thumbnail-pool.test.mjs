import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildThumbnailPoolSeeds, THUMBNAIL_POOL_TARGET_SIZE, THUMBNAIL_POOL_CATEGORIES, RECENT_THUMBNAIL_REUSE_WINDOW } from '../lib/thumbnailPoolCatalog.js';
import { buildThumbnailContext, determineThumbnailPoolCategory, selectThumbnailFromPool, scoreThumbnailPoolItem, hasFixedThumbnail } from '../lib/thumbnailPool.js';

const seeds=buildThumbnailPoolSeeds();
assert.equal(THUMBNAIL_POOL_TARGET_SIZE,100);
assert.equal(Object.keys(THUMBNAIL_POOL_CATEGORIES).length,10);
assert.equal(seeds.length,100);
for(const [category] of Object.entries(THUMBNAIL_POOL_CATEGORIES))assert.equal(seeds.filter(row=>row.category===category).length,10);
assert.equal(RECENT_THUMBNAIL_REUSE_WINDOW,20);

assert.equal(determineThumbnailPoolCategory({category:'economy',topTitle:'원·달러 환율 급등, 금융시장 변동성 확대'}),'finance');
assert.equal(determineThumbnailPoolCategory({category:'tech',topTitle:'생성형 AI 서비스 신규 기능 공개'}),'tech_ai');
assert.equal(determineThumbnailPoolCategory({category:'life',topTitle:'수도권 집중호우로 출근길 혼잡'}),'environment');
assert.equal(determineThumbnailPoolCategory({category:'entertainment',topTitle:'공연 티켓 예매 일정 공개'}),'culture');

const make=(id,moodTitle,moods,subjects,tone='neutral')=>({
  id,category:'finance',categoryLabel:'경제·금융',moodTitle,moods,subjects,tone,usableFor:[...moods,...subjects],avoidFor:[],
  imageUrl:`https://images.unsplash.com/photo-${id}`,thumbUrl:`https://images.unsplash.com/photo-${id}?w=400`,enabled:true,usageCount:0,lastUsedAt:null,
});
const pool=[
  make('finance_001','불확실성 속의 금융시장',['하락','분석'],['환율','시장'],'negative'),
  make('finance_002','상승을 기다리는 시장',['성장'],['투자','시장'],'positive'),
  make('finance_003','숫자로 읽는 경제 흐름',['분석'],['금융','데이터'],'neutral'),
];
const content={slug:'won-dollar',category:'economy',topTitle:'원·달러 환율 급등, 금융시장 변동성 확대',card:{summary:'환율 상승과 시장 불안이 이어졌습니다.'}};
const context=buildThumbnailContext(content);
assert.equal(context.category,'finance');
assert.ok(scoreThumbnailPoolItem(pool[0],context)>scoreThumbnailPoolItem(pool[1],context));
const first=selectThumbnailFromPool({content,pool,recentUsage:[]});
assert.equal(first.thumbnailImageId,'finance_001');
assert.equal(first.thumbnailSelectionType,'curated-pool');
assert.equal(first.source,'unsplash');
const second=selectThumbnailFromPool({content:{...content,slug:'won-dollar-2'},pool,recentUsage:[{thumbnailImageId:'finance_001'}]});
assert.notEqual(second.thumbnailImageId,'finance_001','최근 20개에 사용된 이미지는 사용 가능한 대안이 있으면 제외해야 합니다.');
const sameScreen=selectThumbnailFromPool({content:{...content,slug:'won-dollar-3'},pool,recentUsage:[],usedIds:['finance_001']});
assert.notEqual(sameScreen.thumbnailImageId,'finance_001','같은 TOP 화면의 동일 이미지는 중복되면 안 됩니다.');
const manual={...first,thumbnailSelectionType:'manual'};
assert.equal(hasFixedThumbnail(manual),true);
assert.deepEqual(selectThumbnailFromPool({content,pool,recentUsage:[],existingImageMeta:manual}),{...manual,preserved:true});

const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(api,/const IMAGE_SELECTOR_VERSION = 'v6-curated-pool-100'/);
assert.match(api,/selectCuratedThumbnailForContent/);
assert.match(api,/콘텐츠별 실시간 검색을 하지 않고 Redis의 사전 풀 안에서만 선택합니다/);
assert.doesNotMatch(api,/api\.unsplash\.com\/search\/photos/,'콘텐츠 생성 경로에서 Unsplash 실시간 검색을 호출하면 안 됩니다.');
const service=fs.readFileSync(new URL('../lib/thumbnailPoolService.js',import.meta.url),'utf8');
assert.match(service,/bootstrapThumbnailPool/);
assert.match(service,/썸네일 저장소\/API 오류가 콘텐츠 생성·검증·TOP 공개 성공 여부에 영향을 주면 안 됩니다/);
assert.match(service,/api\.unsplash\.com\/search\/photos/,'Unsplash 검색은 관리자 풀 구축 경로에만 있어야 합니다.');
const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(refresh,/RESEARCH_POOL_LIMIT/);
assert.match(refresh,/publicationRows\.slice\(0, TARGET_TOP_COUNT\)/);
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/thumbnailPoolSize:100/);
assert.match(version,/thumbnailRankingIsolation:true/);
assert.match(version,/automatic-pool-preflight-and-missing-slot-fill-no-content-keyword-search-v8042/);
console.log('STELLATE v8.0.38 curated thumbnail pool tests: PASS');
