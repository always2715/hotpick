import assert from 'node:assert/strict';
import fs from 'node:fs';

const refreshJob=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
const kv=fs.readFileSync(new URL('../lib/kv.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
const research=fs.readFileSync(new URL('../lib/researchPipeline.js',import.meta.url),'utf8');
const online=fs.readFileSync(new URL('../lib/onlineReactionPipeline.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../pages/feed/[slug].js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');

// TOP은 새 실행에서 검증 완료된 20건이 모두 준비될 때만 교체합니다.
assert.match(refreshJob,/TARGET_TOP_COUNT\s*=\s*PUBLIC_TOP_COUNT/);
assert.match(refreshJob,/const publicationRows=hybridPublication\.rows/);
assert.match(refreshJob,/if \(publicationRows\.length !== TARGET_TOP_COUNT\)/);
assert.doesNotMatch(refreshJob,/shouldCommitProgressiveRecovery|validCarryoverRows|combinePublicationRows/);
assert.match(kv,/ATOMIC_PUBLICATION_REQUIRES_TOP20/);
assert.match(kv,/ATOMIC_PUBLICATION_REQUIRES_20_CONTENTS/);
assert.match(kv,/stable_top30/);
assert.match(kv,/trends\.length !== PUBLIC_TOP_COUNT|trends\.length!==PUBLIC_TOP_COUNT/);

// 상세 생성은 TOP 발견 자료를 넘기지 않고 확정 키워드만 사용합니다.
assert.match(refreshJob,/buildIndependentResearchTrend/);
assert.match(refreshJob,/researchKeyword[,\s]/);
assert.match(refreshJob,/topDiscoveryContextUsed:\s*sourceTitles\.length>0\?'identity_hints_only':false/);
assert.match(refreshJob,/topDiscoveryLinksUsed:\s*false/);
assert.match(refreshJob,/topDiscoveryImageUsed:\s*false/);
assert.match(refreshJob,/independentTrend\.keyword,\s*\n\s*trend\.imageMeta\|\|trend\.thumbnail\|\|null,\s*\n\s*independentTrend/);
assert.match(api,/const cacheKey=`v848:a\$\{researchAttempt\}:\$\{identityHints\.join/);
assert.match(api,/const independentContext=\{keyword:topicTitle,topKeyword:topicTitle,researchKeyword:topicTitle,researchAttempt,identityHints\}/);
assert.match(api,/researchIsolation=\{keywordOnly:true,topDiscoveryContextUsed:false,onlineSeparated:true,windowHours:36,researchAttempt,expandedResearch:researchAttempt>1\}/);
assert.match(api,/resolveTop30Keyword\(\{/);

// 상세 본문과 제목의 생성 순서를 강제하고 온라인 반응을 사실 영역에서 분리합니다.
assert.match(api,/let rendered=renderBlogPackage\(pkg,onlineTrend,\{keyword:topicTitle,eventTitle:pkg\.shortTitle\|\|''\}\)/);
assert.match(api,/detailContent:rendered\.factualBlog/);
assert.match(api,/contentPipeline:\['top25_ranked_generation_pool','successful_top20_publication','independent_keyword_search','feed_first_content','feed_derived_summary'\]/);
assert.match(api,/naturalFeedHeading\('basic'/);
assert.match(api,/naturalFeedHeading\('issues'/);
assert.match(api,/naturalFeedHeading\('insight'/);
assert.match(api,/온라인 반응은 내부 참고 데이터로 유지하되 피드 본문/);
assert.match(online,/useForFactLedger:false/);
assert.match(online,/useForRecentTrends:false/);
assert.match(online,/useForStellateInsight:false/);
assert.match(online,/recentWithin36Hours/);
assert.match(research,/strict_published_within_36h/);

// 화면에 연관 뉴스 3개, 관련 영상 2개, 출처를 표시합니다.
assert.match(api,/relatedNews:relatedNews\.slice\(0,3\)/);
assert.match(api,/\.filter\(v=>v\?\.id&&v\?\.title\)\.slice\(0,2\)/);
assert.match(page,/const relatedNews=dedupeSources\(Array\.isArray\(content\.relatedNews\)\?content\.relatedNews:\[\]\)\.slice\(0,3\)/);
assert.match(page,/\.slice\(0,2\)/);
assert.match(page,/>관련 영상</);
assert.match(page,/>자료 출처</);
assert.doesNotMatch(page,/related-content-section/);

assert.match(version,/contentVersion:138/);
assert.match(version,/trendCacheVersion:55/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/ranked_candidate_pool_v17_top20_from25/);

console.log('v8.0.12 atomic TOP20 and independent detail pipeline tests passed');
