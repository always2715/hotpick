import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveTop30Keyword, validateEditorialKeyword } from '../lib/editorialTitle.js';
import { extractNewsDiscoveryKeyword } from '../lib/trends.js';

function resolve(rawKeyword, sourceTitles){
  return resolveTop30Keyword({
    topKeyword:rawKeyword,
    keyword:rawKeyword,
    rawKeyword,
    sourceTitles,
  });
}

const park=resolve('가수 박서진 전국투어 콘서트 서울 공연 일정 공개',[
  '박서진, 전국투어 서울 공연 일정 공개',
  '가수 박서진 콘서트 예매 시작',
  '박서진 전국투어 서울 공연 예매 일정',
]);
assert.equal(park.keyword,'박서진');
assert.doesNotMatch(park.keyword,/가수|공연|콘서트|예매|일정/);

const phone=resolve('삼성전자 갤럭시 Z 폴드 신제품 공개',[
  '갤럭시 Z 폴드 신제품 공개 일정',
  '삼성전자, 갤럭시 Z 폴드 공개',
  '갤럭시 Z 폴드 사전예약',
]);
assert.equal(phone.keyword,'갤럭시 Z 폴드');
assert.notEqual(phone.keyword,'갤럭시 Z');

const son=resolve('손흥민 토트넘 이적 관련 공식 입장',[
  '손흥민 이적 관련 입장',
  '토트넘 손흥민 거취 보도',
  '손흥민 공식 입장',
]);
assert.equal(son.keyword,'손흥민');
assert.notEqual(son.keyword,'손흥민 토트넘');

const actor=resolve('배우 김수현 새 드라마 출연 확정',[
  '김수현 새 드라마 출연 확정',
  '배우 김수현 차기작 공개',
  '김수현 주연 드라마',
]);
assert.equal(actor.keyword,'김수현');

const subway=resolve('서울시 지하철 요금 개편',[
  '서울 지하철 요금 개편 발표',
  '서울시 지하철 요금 조정',
  '서울 지하철 요금 인상',
]);
assert.equal(subway.keyword,'서울 지하철');


const series=resolve('넷플릭스 오징어 게임 시즌 3 공개 일정',[
  '오징어 게임 시즌 3 공개',
  '넷플릭스 오징어 게임 시즌 3',
  '오징어 게임 시즌 3 예고편',
]);
assert.equal(series.keyword,'오징어 게임 시즌 3');

const multi=resolve('박서진 장윤정 합동 무대 공개',[
  '박서진 장윤정 합동 무대 공개',
  '박서진 특별 무대 화제',
  '장윤정 박서진 합동 공연',
]);
assert.equal(multi.keyword,'박서진');

assert.equal(validateEditorialKeyword('가수 박서진').valid,false);
assert.equal(validateEditorialKeyword('박서진 콘서트').valid,false);
assert.equal(validateEditorialKeyword('박서진 및 장윤정').valid,false);
assert.equal(validateEditorialKeyword('갤럭시 Z 폴드').valid,true);

assert.equal(extractNewsDiscoveryKeyword('가수 박서진, 전국투어 콘서트 서울 공연 일정 공개'),'박서진');
assert.equal(extractNewsDiscoveryKeyword('삼성전자, 갤럭시 Z 폴드 신제품 공개'),'갤럭시 Z 폴드');

const trends=fs.readFileSync(new URL('../lib/trends.js',import.meta.url),'utf8');
const editorial=fs.readFileSync(new URL('../lib/editorialTitle.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(trends,/resolveTop30Keyword\(\{/);
assert.match(editorial,/ENTITY_ROLE_PREFIXES/);
assert.match(editorial,/ENTITY_TRAILING_NOISE/);
assert.match(editorial,/PRODUCT_ROOTS/);
assert.match(editorial,/multiple_entities/);
assert.match(version,/contentVersion:130/);
assert.match(version,/trendCacheVersion:50/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/fixed_keyword_content_v16_top20/);
console.log('STELLATE v8.0.22 single representative keyword tests: PASS');
