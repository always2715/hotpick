import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessTrendRunCompatibility, CURRENT_TREND_ENGINE_VERSION } from '../lib/trendEnginePolicy.js';
import { isPersistedPublishedContentForFeed, upgradeTrustedPersistedFeedRecord } from '../lib/feedRecoveryPolicy.js';

assert.equal(CURRENT_TREND_ENGINE_VERSION,'8.0.39');
assert.equal(assessTrendRunCompatibility({engineVersion:'8.0.37'}).compatible,true,'동일 TOP25→TOP20 구조의 v8.0.37 실행은 재개 가능해야 합니다.');
assert.equal(assessTrendRunCompatibility({engineVersion:'8.0.38'}).compatible,true);
assert.equal(assessTrendRunCompatibility({engineVersion:'8.0.39'}).compatible,true);
assert.equal(assessTrendRunCompatibility({engineVersion:'8.0.36'}).compatible,false,'구형 구조 실행은 차단해야 합니다.');
assert.equal(assessTrendRunCompatibility({engineVersion:'legacy',enginePolicy:'ranked_candidate_pool_v17_top20_from25',generationPoolCount:25,publicTopCount:20}).compatible,true,'정확한 정책 메타데이터가 있으면 패치 버전 문자열과 무관하게 재개할 수 있어야 합니다.');
assert.equal(assessTrendRunCompatibility({engineVersion:'8.0.39',generationPoolCount:20,publicTopCount:20}).compatible,false);

const publishedContent={
  slug:'published-item',status:'published',visibility:'published',hasContent:true,
  blog:'공식 자료와 신뢰 출처를 바탕으로 작성된 상세 본문입니다. 충분한 길이의 본문이 저장돼 있습니다.',
  feedTitle:'기존 정상 공개 피드 제목',card:{summary:'기존에 정상 공개된 콘텐츠의 핵심 사실을 설명하는 충분한 길이의 요약입니다.'},
};
assert.equal(isPersistedPublishedContentForFeed(publishedContent),true);
assert.equal(isPersistedPublishedContentForFeed({...publishedContent,visibility:'hidden_feed'}),false);
assert.equal(isPersistedPublishedContentForFeed({...publishedContent,status:'review_required'}),false);

const legacyIndex=upgradeTrustedPersistedFeedRecord({
  slug:'legacy-feed',status:'published',feedTitle:'기존 피드 제목',summary:'기존 피드 목록에 저장된 충분한 길이의 요약 정보입니다.',hasContent:true,
});
assert.equal(legacyIndex.publicReady,true,'이전에 공개된 신뢰 피드 인덱스는 새 플래그 누락만으로 사라지면 안 됩니다.');
assert.equal(legacyIndex.feedReady,true);
const legacyWithoutFlags=upgradeTrustedPersistedFeedRecord({
  slug:'legacy-feed-no-flags',status:'published',feedTitle:'플래그 없는 기존 피드 제목',summary:'publicReady와 feedReady가 없지만 이전에 공개된 충분한 길이의 피드 요약입니다.',
});
assert.equal(legacyWithoutFlags.publicReady,true,'구형 피드가 hasContent/publicReady 플래그 누락만으로 0건 처리되면 안 됩니다.');
assert.equal(legacyWithoutFlags.feedReady,true);
assert.equal(upgradeTrustedPersistedFeedRecord({...legacyIndex,visibility:'private'}).visibility,'private');

const kv=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
assert.match(kv,/preservePublished=true/,'피드 인덱스 복구는 기존 공개 콘텐츠 보존 모드를 기본으로 사용해야 합니다.');
assert.match(kv,/loadCurrentTopSnapshotFeedRows/,'콘텐츠 인덱스 장애 시 현재 공개 TOP 스냅샷 비상 fallback이 필요합니다.');
assert.match(kv,/repairPublishedFeedIndexesInternal\(r,\{topOnly:false,force:true\}\)/,'전체 피드가 비었을 때 TOP만이 아니라 누적 공개 콘텐츠 전체를 복구해야 합니다.');
assert.match(kv,/upgradeTrustedPersistedFeedRecord/,'레거시 공개 피드 플래그를 안전하게 복원해야 합니다.');

const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(refresh,/assessTrendRunCompatibility/);
assert.doesNotMatch(refresh,/engineVersion\|\|'?'\)\s*&&\s*String\(run\.engineVersion\)!=='8\.0\.37'/);
assert.match(refresh,/repairPublishedFeedIndexes\(\{topOnly:true,force:true\}\)/,'실패 실행은 기본 비파괴 피드 복구를 호출해야 합니다.');

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/non-destructive-published-feed-recovery-plus-top-snapshot-emergency-fallback-v8039/);

console.log('STELLATE v8.0.39 run compatibility and non-destructive feed recovery tests: PASS');
