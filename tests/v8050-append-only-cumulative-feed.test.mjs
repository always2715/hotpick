import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __setRedisClientForTests, queryFeedPosts, getContent } from '../lib/kv.js';

process.env.NODE_ENV='test';

class FakeRedis {
  constructor(){this.strings=new Map();this.hashes=new Map();this.sets=new Map();this.zsets=new Map();this.lists=new Map();}
  async get(k){return this.strings.get(k)??null;}
  async set(k,v){this.strings.set(k,v);return 'OK';}
  async mget(...keys){return keys.map(k=>this.strings.get(k)??null);}
  async incr(k){const v=Number(this.strings.get(k)||0)+1;this.strings.set(k,v);return v;}
  async del(...keys){for(const k of keys.flat()){this.strings.delete(k);this.hashes.delete(k);this.sets.delete(k);this.zsets.delete(k);this.lists.delete(k);}return 1;}
  async hlen(k){return this.hashes.get(k)?.size||0;}
  async hget(k,f){return this.hashes.get(k)?.get(f)??null;}
  async hmget(k,...fields){return fields.map(f=>this.hashes.get(k)?.get(f)??null);}
  async hvals(k){return [...(this.hashes.get(k)?.values()||[])];}
  async hset(k,obj){if(!this.hashes.has(k))this.hashes.set(k,new Map());for(const [f,v] of Object.entries(obj||{}))this.hashes.get(k).set(f,v);return Object.keys(obj||{}).length;}
  async hdel(k,...fields){let n=0;const h=this.hashes.get(k);for(const f of fields.flat())if(h?.delete(f))n++;return n;}
  async smembers(k){return [...(this.sets.get(k)||new Set())];}
  async sadd(k,...members){if(!this.sets.has(k))this.sets.set(k,new Set());for(const v of members.flat())this.sets.get(k).add(v);return members.flat().length;}
  async srem(k,...members){let n=0;const s=this.sets.get(k);for(const m of members.flat())if(s?.delete(m))n++;return n;}
  async sismember(k,m){return this.sets.get(k)?.has(m)?1:0;}
  async zcard(k){return this.zsets.get(k)?.size||0;}
  async zscore(k,m){return this.zsets.get(k)?.get(m)??null;}
  async zrange(k,start,stop,{rev=false}={}){const rows=[...(this.zsets.get(k)||new Map()).entries()].sort((a,b)=>rev?b[1]-a[1]:a[1]-b[1]);return rows.slice(start,stop+1).map(([m])=>m);}
  async zadd(k,payload){if(!this.zsets.has(k))this.zsets.set(k,new Map());const rows=Array.isArray(payload)?payload:[payload];for(const {score,member} of rows)this.zsets.get(k).set(member,Number(score));return rows.length;}
  async zrem(k,...members){let n=0;const z=this.zsets.get(k);for(const m of members.flat())if(z?.delete(m))n++;return n;}
  async lrange(k,start,stop){return (this.lists.get(k)||[]).slice(start,stop+1);}
  async lpush(k,...values){const list=this.lists.get(k)||[];list.unshift(...values);this.lists.set(k,list);return list.length;}
  async rpush(k,...values){const list=this.lists.get(k)||[];list.push(...values);this.lists.set(k,list);return list.length;}
  async ltrim(k,start,stop){this.lists.set(k,(this.lists.get(k)||[]).slice(start,stop+1));return 'OK';}
  async lset(k,index,value){const list=this.lists.get(k)||[];list[index]=value;this.lists.set(k,list);return 'OK';}
  async scan(){return ['0',[]];}
}

const NS='stellate:v7';
const redis=new FakeRedis();
const now=Date.now();
const top=[];
for(let i=1;i<=45;i++){
  const slug=`archive-${i}`;
  const updatedAt=new Date(now-i*1000).toISOString();
  const feed={
    slug,keyword:`키워드 ${i}`,displayTitle:`키워드 ${i}`,feedTitle:`키워드 ${i} 확인된 사건`,detailTitle:`키워드 ${i} 상세`,
    previewSummary:`키워드 ${i}에 관해 확인된 핵심 사실과 일정을 설명하는 충분한 요약입니다.`,summary:`키워드 ${i}에 관해 확인된 핵심 사실과 일정을 설명하는 충분한 요약입니다.`,
    category:'general',feedSeq:i,status:'published',visibility:'published',hasContent:true,hasNews:true,publicReady:true,feedReady:true,
    contentVersion:138,sourceContentVersion:138,feedIndexSchemaVersion:4,generatedAt:updatedAt,updatedAt,
    archiveFirstPublishedAt:updatedAt,archivedFeed:true,
  };
  if(!redis.hashes.has(`${NS}:feed:archive:items`))redis.hashes.set(`${NS}:feed:archive:items`,new Map());
  redis.hashes.get(`${NS}:feed:archive:items`).set(slug,JSON.stringify(feed));
  if(!redis.hashes.has(`${NS}:feed:archive:contents`))redis.hashes.set(`${NS}:feed:archive:contents`,new Map());
  redis.hashes.get(`${NS}:feed:archive:contents`).set(slug,JSON.stringify({...feed,card:{summary:feed.summary,feedTitle:feed.feedTitle},blog:`## 상세\n${'확인된 정보입니다. '.repeat(80)}`,titleReady:true,titleStatus:'ready',topKeyword:`키워드 ${i}`,topTopic:'확인된 사건',topTitle:`키워드 ${i} · 확인된 사건`,contentMode:'detailed'}));
  if(!redis.zsets.has(`${NS}:feed:archive:index:latest`))redis.zsets.set(`${NS}:feed:archive:index:latest`,new Map());
  redis.zsets.get(`${NS}:feed:archive:index:latest`).set(slug,now-i*1000);
  if(i<=20){
    top.push({slug,rank:i,keyword:feed.keyword,displayTitle:feed.displayTitle,feedTitle:feed.feedTitle,updatedAt,publicReady:true,contentReady:true});
    if(!redis.hashes.has(`${NS}:feed:items`))redis.hashes.set(`${NS}:feed:items`,new Map());
    redis.hashes.get(`${NS}:feed:items`).set(slug,JSON.stringify(feed));
    if(!redis.zsets.has(`${NS}:feed:index:latest`))redis.zsets.set(`${NS}:feed:index:latest`,new Map());
    redis.zsets.get(`${NS}:feed:index:latest`).set(slug,now-i*1000);
  }
}
redis.strings.set(`${NS}:trends:latest`,JSON.stringify(top));
redis.strings.set(`${NS}:trends:updated_at`,'2026-06-25T00:00:00.000Z');
redis.strings.set(`${NS}:feed:index:schema`,JSON.stringify({version:4,trendsUpdatedAt:'2026-06-25T00:00:00.000Z'}));
redis.strings.set(`${NS}:feed:cumulative:migration:v8050`,JSON.stringify({version:1,archiveCount:45,sourceCount:45}));

// 과거 live content가 이후 생성 실패로 private/failed가 되어도 공개 당시 archive snapshot은 유지돼야 합니다.
redis.strings.set(`${NS}:content:archive-45`,JSON.stringify({slug:'archive-45',status:'failed',visibility:'private',lastError:'후속 생성 실패'}));

__setRedisClientForTests(redis);
const all=await queryFeedPosts({limit:20,offset:0,scope:'all',topSlugs:top.map(x=>x.slug)});
assert.equal(all.total,45,'전체 피드는 현재 TOP20이 아니라 별도 누적 보존소의 45건을 반환해야 합니다.');
const past=await queryFeedPosts({limit:30,offset:0,scope:'past',topSlugs:top.map(x=>x.slug)});
assert.equal(past.total,25,'지난 피드는 현재 TOP20을 제외한 누적 25건이어야 합니다.');
const archived=await getContent('archive-45');
assert.ok(archived,'live content가 실패 상태여도 공개 당시 archive content를 읽어야 합니다.');
assert.match(archived.blog,/확인된 정보/);

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const kv=fs.readFileSync(path.join(root,'lib/kv.js'),'utf8');
assert.match(kv,/feedArchiveItems/);
assert.match(kv,/feedArchiveContents/);
assert.match(kv,/writeCumulativeFeedArchive\(r, feedItem, stored\)/);
assert.match(kv,/tx\.hset\(K\.feedArchiveItems/);
assert.match(kv,/loadCumulativeArchiveRows/);
assert.match(kv,/options\.scope!==['"]top['"]/);
assert.match(kv,/const archived=parse\(await r\.hget\(K\.feedArchiveContents,slug\)/);

console.log('STELLATE v8.0.52 append-only cumulative feed archive tests: PASS');
