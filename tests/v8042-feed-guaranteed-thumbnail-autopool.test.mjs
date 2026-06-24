import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV='test';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const kv=await import('../lib/kv.js');
const poolService=await import('../lib/thumbnailPoolService.js');

class FakeRedis {
  constructor(seed={}){this.values=new Map(Object.entries(seed));this.hashes=new Map();this.sets=new Map();this.zsets=new Map();this.lists=new Map();}
  async get(k){return this.values.get(k)??null;}
  async set(k,v){this.values.set(k,v);return 'OK';}
  async del(...keys){for(const k of keys){this.values.delete(k);this.hashes.delete(k);this.sets.delete(k);this.zsets.delete(k);this.lists.delete(k);}return keys.length;}
  async mget(...keys){return keys.map(k=>this.values.get(k)??null);}
  async hlen(k){return this.hashes.get(k)?.size||0;}
  async hget(k,f){return this.hashes.get(k)?.get(f)??null;}
  async hmget(k,...fields){const h=this.hashes.get(k)||new Map();return fields.map(f=>h.get(f)??null);}
  async hvals(k){return [...(this.hashes.get(k)||new Map()).values()];}
  async hset(k,obj){const h=this.hashes.get(k)||new Map();for(const [f,v] of Object.entries(obj||{}))h.set(f,v);this.hashes.set(k,h);return Object.keys(obj||{}).length;}
  async hdel(k,...fields){const h=this.hashes.get(k)||new Map();let n=0;for(const f of fields)if(h.delete(f))n++;return n;}
  async smembers(k){return [...(this.sets.get(k)||new Set())];}
  async sadd(k,...members){const s=this.sets.get(k)||new Set();members.flat().forEach(m=>s.add(m));this.sets.set(k,s);return members.flat().length;}
  async srem(k,...members){const s=this.sets.get(k)||new Set();let n=0;for(const m of members.flat())if(s.delete(m))n++;return n;}
  async sismember(k,m){return (this.sets.get(k)||new Set()).has(m)?1:0;}
  async zcard(k){return this.zsets.get(k)?.size||0;}
  async zscore(k,m){return this.zsets.get(k)?.get(m)??null;}
  async zadd(k,payload){const z=this.zsets.get(k)||new Map();const list=Array.isArray(payload)?payload:[payload];for(const row of list)if(row?.member!=null)z.set(row.member,Number(row.score||0));this.zsets.set(k,z);return list.length;}
  async zrem(k,...members){const z=this.zsets.get(k)||new Map();let n=0;for(const m of members.flat())if(z.delete(m))n++;return n;}
  async zrange(k,start,stop,{rev=false}={}){let rows=[...(this.zsets.get(k)||new Map()).entries()].sort((a,b)=>a[1]-b[1]);if(rev)rows.reverse();const end=stop<0?undefined:stop+1;return rows.slice(start,end).map(([m])=>m);}
  async lrange(k,start,stop){const a=this.lists.get(k)||[];const end=stop<0?undefined:stop+1;return a.slice(start,end);}
  async lpush(k,...values){const a=this.lists.get(k)||[];a.unshift(...values);this.lists.set(k,a);return a.length;}
  async rpush(k,...values){const a=this.lists.get(k)||[];a.push(...values);this.lists.set(k,a);return a.length;}
  async ltrim(k,start,stop){const a=this.lists.get(k)||[];this.lists.set(k,a.slice(start,stop<0?undefined:stop+1));return 'OK';}
  async lset(k,index,value){const a=this.lists.get(k)||[];a[index]=value;this.lists.set(k,a);return 'OK';}
}

const NS='stellate:v7';
const slug='feed-direct-recovery-test';
const now='2026-06-24T12:00:00.000Z';
const trend={slug,rank:1,keyword:'피드 복구',topKeyword:'피드 복구',displayTitle:'피드 복구 · 상세 원본 직접 표시',feedTitle:'피드 상세 원본 직접 복구 확인',category:'tech',updatedAt:now};
const content={
  slug,status:'published',visibility:'published',category:'tech',keyword:'피드 복구',topKeyword:'피드 복구',
  displayTitle:'피드 복구 · 상세 원본 직접 표시',feedTitle:'피드 상세 원본 직접 복구 확인',
  card:{feedTitle:'피드 상세 원본 직접 복구 확인',listSummary:'피드 인덱스가 모두 비어 있어도 현재 TOP 상세 콘텐츠 원본을 직접 읽어 목록을 복구합니다.',summary:'현재 TOP 상세 원본을 기준으로 피드 목록을 구성합니다.'},
  blog:'이 테스트 본문은 피드 Hash, ZSET, 콘텐츠 인덱스가 없는 상태에서도 상세 콘텐츠 원본을 읽어 피드 목록에 표시되는지 검증하기 위한 충분한 길이의 본문입니다.',
  generatedAt:now,updatedAt:now,contentVersion:133,
};
const fake=new FakeRedis({
  [`${NS}:trends:latest`]:JSON.stringify([trend]),
  [`${NS}:trends:updated_at`]:now,
  [`${NS}:content:${slug}`]:JSON.stringify(content),
});
kv.__setRedisClientForTests(fake);
const feed=await kv.queryFeedPosts({limit:20,offset:0,category:'all',scope:'all',sort:'latest',search:'',topSlugs:[slug]});
assert.equal(feed.total,1,'feed must recover one row directly from current TOP content');
assert.equal(feed.items[0].slug,slug);
assert.match(feed.items[0].previewSummary,/피드 인덱스가 모두 비어/);

const poolItem={id:'tech_001',category:'IT·AI',categoryKey:'tech',moodTitle:'데이터가 흐르는 공간',moods:['분석'],subjects:['데이터센터'],tone:'neutral',usableFor:['기술'],avoidFor:[],unsplashPhotoId:'photo-test',photographerName:'Tester',sourceUrl:'https://unsplash.com/photos/photo-test',imageUrl:'https://images.unsplash.com/photo-test',thumbUrl:'https://images.unsplash.com/photo-test?w=640',enabled:true};
await fake.set(`${NS}:thumbnail_pool:v1`,JSON.stringify({version:'v1-100-curated',targetSize:100,items:[poolItem],complete:false,updatedAt:now}));
delete process.env.UNSPLASH_ACCESS_KEY;
const pool=await poolService.ensureThumbnailPoolReady();
assert.equal(pool.ready,true,'partial curated pool must be usable');
assert.equal(pool.complete,false,'partial pool must not be reported as complete');
assert.equal(pool.items.length,1);

const kvSource=fs.readFileSync(path.join(projectRoot,'lib/kv.js'),'utf8');
const serviceSource=fs.readFileSync(path.join(projectRoot,'lib/thumbnailPoolService.js'),'utf8');
const refreshSource=fs.readFileSync(path.join(projectRoot,'lib/trendRefreshJob.js'),'utf8');
const adminSource=fs.readFileSync(path.join(projectRoot,'pages/api/admin-action.js'),'utf8');
const indexSource=fs.readFileSync(path.join(projectRoot,'pages/index.js'),'utf8');
const feedSource=fs.readFileSync(path.join(projectRoot,'pages/feed.js'),'utf8');
assert.match(kvSource,/loadCurrentTopContentFeedRows/);
assert.match(kvSource,/FEED_CURRENT_TOP_MERGED/);
assert.match(serviceSource,/ensureThumbnailPoolReady/);
assert.match(refreshSource,/backfillMissingTopThumbnails/);
assert.match(adminSource,/Unsplash 사전 썸네일 이미지 풀 구축 및 현재 TOP 누락 이미지 적용/);
assert.doesNotMatch(indexSource,/cat\.emoji \|\| '🔥'/);
assert.doesNotMatch(feedSource,/cat\.emoji \|\| '🔥'/);

kv.__setRedisClientForTests(null);
console.log('STELLATE v8.0.42 guaranteed feed recovery and thumbnail auto-pool tests: PASS');
