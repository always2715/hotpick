import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizePublicText, sanitizePublicContent, containsPublicResearchWindow } from '../lib/publicCopy.js';
import { ensurePromoCard, validateInstagramCards } from '../lib/instagram.js';

const original={
  slug:'sample-topic',status:'published',visibility:'published',contentMode:'detailed',contentType:'detailed',hasContent:true,
  topTitle:'샘플 서비스 · 새 기능 공개',feedTitle:'샘플 서비스 · 새 기능 공개',detailTitle:'샘플 서비스 · 새 기능 공개',displayTitle:'샘플 서비스 · 새 기능 공개',
  blog:'## 샘플 서비스를 이해하는 핵심\n샘플 서비스는 이용 절차를 제공하는 서비스입니다.\n\n## 새 기능으로 달라지는 점\n최근 36시간 안에 새 기능 공개가 확인됐으며 이용 방식이 일부 변경됐습니다.\n지원 대상과 적용 일정도 함께 안내됐습니다.\n\n## STELLATE 인사이트\n이번 변화는 사용 절차를 단순화하고 지원 범위를 구체화했다는 점에서 의미가 있습니다.',
  card:{feedTitle:'샘플 서비스 · 새 기능 공개',detailTitle:'샘플 서비스 · 새 기능 공개',summary:'샘플 서비스가 최근 36시간 안에 새 기능과 적용 일정을 공개했습니다.',why:'사용 절차가 단순해지고 지원 범위가 구체화됐다는 점이 핵심입니다.',points:['새 기능과 적용 일정 공개','이용 방식 일부 변경','지원 대상 구체화']},
  claimMap:[
    {text:'새 기능 공개가 확인됐으며 이용 방식이 일부 변경됐습니다.',claimIds:['F1']},
    {text:'지원 대상과 적용 일정도 함께 안내됐습니다.',claimIds:['F2']},
    {text:'이번 변화는 사용 절차를 단순화하고 지원 범위를 구체화했다는 점에서 의미가 있습니다.',claimIds:['F3']},
  ],
  factLedger:{facts:[{id:'F1',text:'새 기능과 이용 방식 변경'},{id:'F2',text:'지원 대상과 적용 일정 안내'},{id:'F3',text:'사용 절차 단순화'}]},
  sourceItems:[{source:'샘플 서비스 공식자료'}],
};

assert.equal(sanitizePublicText('최근 36시간 안에 새 기능이 공개됐습니다.'),'새 기능이 공개됐습니다.');
const safe=sanitizePublicContent(original);
assert.equal(containsPublicResearchWindow(`${safe.blog} ${safe.card.summary}`),false,'상세·피드 공개 문구에서 조사 시간 범위가 제거되어야 합니다.');
assert.match(safe.blog,/## 새 기능으로 달라지는 점/);

const cards=ensurePromoCard([],safe);
assert.ok(cards.length>=5&&cards.length<=6);
assert.equal(cards[0].type,'cover');
assert.equal(cards.at(-1).type,'promo');
assert.equal(cards.some(card=>containsPublicResearchWindow(`${card.headline} ${card.body}`)),false);
assert.match(cards.find(card=>card.type==='insight').body,/사용 절차/);
assert.equal(validateInstagramCards(cards,safe).passed,true);

const home=fs.readFileSync(new URL('../pages/index.js',import.meta.url),'utf8');
const preview=fs.readFileSync(new URL('../pages/[slug].js',import.meta.url),'utf8');
const feedList=fs.readFileSync(new URL('../pages/feed.js',import.meta.url),'utf8');
const feedDetail=fs.readFileSync(new URL('../pages/feed/[slug].js',import.meta.url),'utf8');
const category=fs.readFileSync(new URL('../pages/category/[cat].js',import.meta.url),'utf8');
assert.match(home,/href=\{`\/\$\{item\.slug\}`\}/,'TOP 목록은 요약형 미리보기로 이동해야 합니다.');
assert.match(preview,/상세 정보 피드 보기/);
assert.match(preview,/href=\{`\/feed\/\$\{content\.slug\}`\}/);
assert.match(feedList,/href=\{`\/feed\/\$\{post\.slug\}`\}/,'피드 목록은 상세 콘텐츠로 바로 이동해야 합니다.');
assert.match(category,/href=\{`\/feed\/\$\{post\.slug\}`\}/);
assert.match(feedDetail,/키워드 기본정보|parseBlog/);
assert.match(feedDetail,/연관 뉴스/);
assert.match(feedDetail,/관련 영상/);

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/contentVersion:136/);
assert.match(version,/trendCacheVersion:53/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/hide-research-window-phrases/);
assert.match(version,/cover-feed-sections-insight-promo/);
console.log('v8.0.15 preview, feed detail, public copy, and Instagram tests passed');
