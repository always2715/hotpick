import assert from 'node:assert/strict';
import fs from 'node:fs';
import { feedDraftIsReady } from '../lib/feedPolicy.js';

const content={
  slug:'feed-ready',status:'review_required',visibility:'private',contentMode:'detailed',contentType:'detailed',hasContent:true,
  topKeyword:'테스트 서비스',topTopic:'새 기능 공개',topTitle:'테스트 서비스 · 새 기능 공개',displayTitle:'테스트 서비스 · 새 기능 공개',
  feedTitle:'테스트 서비스 · 새 기능 공개',detailTitle:'테스트 서비스 · 새 기능 공개',titleStatus:'ready',titleReady:true,
  blog:'## 키워드 기본정보\n테스트 서비스의 현재 맥락을 설명합니다.\n\n## 이슈사항\n최근 36시간 이내 새 기능 공개가 확인됐습니다.\n\n## 온라인 동향\n온라인 반응은 사실 영역과 분리합니다.\n\n## STELLATE 인사이트\n확인된 사실을 중심으로 의미를 정리합니다.',
  card:{feedTitle:'테스트 서비스 · 새 기능 공개',detailTitle:'테스트 서비스 · 새 기능 공개',summary:'테스트 서비스가 최근 36시간 안에 새 기능을 공개한 사실이 확인됐습니다.',why:'서비스 이용 방식에 영향을 주는 변경입니다.',points:['새 기능 공개','최근 36시간 확인','출처 기반 정리']},
  groundingScore:70,copyrightRisk:{passed:true},
  evidenceSources:[{source:'연합뉴스',domain:'yna.co.kr',sourceType:'trusted_news',link:'https://www.yna.co.kr/test'}],
  factLedger:{facts:[{id:'F1',status:'confirmed',sourceType:'trusted_news',sourceIds:['S1']}],conflicts:[]},
};
assert.equal(feedDraftIsReady(content),true,'상세·제목·요약이 완성되면 공개 전 단계에서도 피드 초안이 준비되어야 합니다.');
assert.equal(feedDraftIsReady({...content,titleReady:false}),false);
assert.equal(feedDraftIsReady({...content,card:{...content.card,summary:'짧음'}}),false);

const kv=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
assert.match(kv,/repairPublishedFeedIndexesInternal/,'공개 콘텐츠에서 피드 인덱스를 복구하는 경로가 필요합니다.');
assert.match(kv,/feedIndexState/,'피드 set 하나만 보지 않고 실제 인덱스 전체를 점검해야 합니다.');
assert.match(kv,/ATOMIC_PUBLICATION_FEED_INCOMPLETE/,'TOP30 공개 후 피드 30건을 검증해야 합니다.');
assert.match(kv,/feedDraft,feedReady:feedDraftIsReady/,'상세 생성 단계에서 피드 초안을 함께 저장해야 합니다.');
assert.match(kv,/if\(all\.length===0.*repairPublishedFeedIndexesInternal/s,'피드 조회가 비어 있으면 자동 복구 후 재조회해야 합니다.');

const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(refresh,/repairPublishedFeedIndexes\(\{topOnly:true,force:true\}\)/,'갱신 실패 시 기존 공개 TOP 피드를 자동 복구해야 합니다.');
assert.match(refresh,/feedDraftIsReady\(content\|\|\{\}\)/,'후보 완료 조건에 피드 초안 준비가 포함되어야 합니다.');
assert.match(refresh,/feedPublished:\s*Number\(committed\.feedPublishedCount\|\|0\)/,'완료 기록에 실제 공개 피드 수를 저장해야 합니다.');

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/auto-repair-published-feed-indexes/);
console.log('v8.0.14 feed publication and recovery tests passed');
