import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __setRedisClientForTests, queryFeedPosts } from '../lib/kv.js';
import { compactTopPreviewContent, TOP_PREVIEW_MAX_CHARS } from '../lib/topPreviewPolicy.js';
import { FEED_DETAIL_MIN_CHARS, FEED_DETAIL_TARGET_CHARS, FEED_DETAIL_RECOMMENDED_MIN_CHARS, FEED_DETAIL_RECOMMENDED_MAX_CHARS, isFeedDetailLengthValid, isFeedDetailLengthRecommended } from '../lib/feedLengthPolicy.js';

process.env.NODE_ENV='test';

class FakeRedis {
  constructor(){this.strings=new Map();this.hashes=new Map();this.sets=new Map();this.zsets=new Map();this.lists=new Map();}
  async get(k){return this.strings.get(k)??null;}
  async set(k,v){this.strings.set(k,v);return 'OK';}
  async mget(...keys){return keys.map(k=>this.strings.get(k)??null);}
  async hlen(k){return this.hashes.get(k)?.size||0;}
  async hget(k,f){return this.hashes.get(k)?.get(f)??null;}
  async hmget(k,...fields){return fields.map(f=>this.hashes.get(k)?.get(f)??null);}
  async hvals(k){return [...(this.hashes.get(k)?.values()||[])];}
  async hset(k,obj){if(!this.hashes.has(k))this.hashes.set(k,new Map());for(const [f,v] of Object.entries(obj||{}))this.hashes.get(k).set(f,v);return 1;}
  async smembers(k){return [...(this.sets.get(k)||new Set())];}
  async sadd(k,member,...members){if(!this.sets.has(k))this.sets.set(k,new Set());for(const v of [member,...members])this.sets.get(k).add(v);return 1;}
  async sismember(k,m){return this.sets.get(k)?.has(m)?1:0;}
  async zcard(k){return this.zsets.get(k)?.size||0;}
  async zscore(k,m){return this.zsets.get(k)?.get(m)??null;}
  async zrange(k,start,stop,{rev=false}={}){const rows=[...(this.zsets.get(k)||new Map()).entries()].sort((a,b)=>rev?b[1]-a[1]:a[1]-b[1]);return rows.slice(start,stop+1).map(([m])=>m);}
  async lrange(k,start,stop){return (this.lists.get(k)||[]).slice(start,stop+1);}
  async scan(cursor,{match}={}){const prefix=String(match||'').replace(/\*$/,'');const keys=[...this.strings.keys()].filter(k=>k.startsWith(prefix));return ['0',keys];}
  async zadd(k,{score,member}){if(!this.zsets.has(k))this.zsets.set(k,new Map());this.zsets.get(k).set(member,Number(score));return 1;}
  async expire(){return 1;}
}

const NS='stellate:v7';
const redis=new FakeRedis();
const now=Date.now();
const top=[];
for(let i=1;i<=45;i++){
  const slug=`feed-${i}`;
  const content={
    slug,keyword:`키워드 ${i}`,displayTitle:`키워드 ${i}`,feedTitle:`키워드 ${i} · 확인된 사건`,detailTitle:`키워드 ${i} 상세`,
    card:{summary:`키워드 ${i}에 대해 확인된 핵심 사실을 충분히 설명하는 요약 문장입니다.`,why:'확인된 배경과 일정 정보를 정리했습니다.',points:['확인 사실 1','확인 사실 2','확인 사실 3']},
    blog:`## 기본정보\n${'확인된 사실을 바탕으로 작성한 상세 설명입니다. '.repeat(8)}`,
    status:'published',visibility:'published',hasContent:true,hasNews:true,publicReady:true,feedReady:true,contentVersion:133,
    category:'general',feedSeq:i,generatedAt:new Date(now-i*1000).toISOString(),updatedAt:new Date(now-i*1000).toISOString(),
  };
  redis.strings.set(`${NS}:content:${slug}`,JSON.stringify(content));
  if(!redis.sets.has(`${NS}:content:index`))redis.sets.set(`${NS}:content:index`,new Set());
  redis.sets.get(`${NS}:content:index`).add(slug);
  if(i<=20){
    top.push({slug,rank:i,keyword:content.keyword,displayTitle:content.displayTitle,feedTitle:content.feedTitle,category:'general',updatedAt:content.updatedAt,publicReady:true,contentReady:true});
    const feedItem={...content,feedIndexSchemaVersion:3,sourceUpdatedAt:content.updatedAt,sourceContentVersion:133,summary:content.card.summary,previewSummary:content.card.summary,thumbnail:null,viewCount:0};
    if(!redis.hashes.has(`${NS}:feed:items`))redis.hashes.set(`${NS}:feed:items`,new Map());
    redis.hashes.get(`${NS}:feed:items`).set(slug,JSON.stringify(feedItem));
    if(!redis.zsets.has(`${NS}:feed:index:latest`))redis.zsets.set(`${NS}:feed:index:latest`,new Map());
    redis.zsets.get(`${NS}:feed:index:latest`).set(slug,now-i*1000);
  }
}
redis.strings.set(`${NS}:trends:latest`,JSON.stringify(top));
redis.strings.set(`${NS}:trends:updated_at`,'2026-06-25T00:00:00.000Z');
redis.strings.set(`${NS}:feed:index:schema`,JSON.stringify({version:3,trendsUpdatedAt:'2026-06-25T00:00:00.000Z'}));

__setRedisClientForTests(redis);
const result=await queryFeedPosts({limit:20,offset:0,scope:'all',topSlugs:top.map(x=>x.slug)});
assert.equal(result.items.length,20,'첫 페이지는 20개를 반환해야 합니다.');
assert.equal(result.total,45,'피드 총계는 현재 TOP20이 아니라 누적 공개 45개여야 합니다.');
const second=await queryFeedPosts({limit:20,offset:20,scope:'all',topSlugs:top.map(x=>x.slug)});
assert.equal(second.items.length,20,'두 번째 페이지에도 과거 누적 피드가 표시되어야 합니다.');
const third=await queryFeedPosts({limit:20,offset:40,scope:'all',topSlugs:top.map(x=>x.slug)});
assert.equal(third.items.length,5,'마지막 페이지까지 누적 피드가 유지되어야 합니다.');

const preview=compactTopPreviewContent({summary:'요약 '.repeat(180),why:'맥락 '.repeat(120),points:Array.from({length:5},(_,i)=>`포인트 ${i+1} `.repeat(30))});
assert.ok(preview.characterCount<=TOP_PREVIEW_MAX_CHARS,'TOP 클릭 요약정보는 1000자 이내여야 합니다.');
assert.equal(FEED_DETAIL_MIN_CHARS,1000);
assert.equal(FEED_DETAIL_TARGET_CHARS,5000);
assert.equal(FEED_DETAIL_RECOMMENDED_MIN_CHARS,3500);
assert.equal(FEED_DETAIL_RECOMMENDED_MAX_CHARS,6000);
assert.equal(isFeedDetailLengthValid('가'.repeat(999)),false);
assert.equal(isFeedDetailLengthValid('가'.repeat(1000)),true);
assert.equal(isFeedDetailLengthValid('가'.repeat(2500)),true);
assert.equal(isFeedDetailLengthValid('가'.repeat(7000)),true);
assert.equal(isFeedDetailLengthRecommended('가'.repeat(5000)),true);
assert.equal(isFeedDetailLengthRecommended('가'.repeat(2000)),false);

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const kv=fs.readFileSync(path.join(root,'lib/kv.js'),'utf8');
assert.match(kv,/options\.scope==='top'\)return rows\.slice/,'전체 피드는 최신 인덱스 20건에서 조기 반환하면 안 됩니다.');
assert.match(kv,/scanPersistedContentSlugs/,'과거 content 원본 키를 검색해 누적 피드를 복구해야 합니다.');
const publication=fs.readFileSync(path.join(root,'lib/publicationPolicy.js'),'utf8');
assert.match(publication,/FEED_DETAIL_MIN_CHARS/);
assert.doesNotMatch(publication,/feedBodyLength>FEED_DETAIL/,'5,000자 권장은 공개 상한으로 강제하면 안 됩니다.');

console.log('STELLATE v8.0.47 cumulative feed and content length policy tests: PASS');
