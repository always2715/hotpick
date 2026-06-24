import assert from 'node:assert/strict';
import fs from 'node:fs';
import { naturalFeedHeading, buildFeedSummaryCard, fullFeedTitle } from '../lib/feedFirstPipeline.js';

const parkBlog=`## 박서진은 어떤 가수인가
박서진은 트로트 장르를 중심으로 활동하는 가수입니다. 방송과 공연 무대를 통해 이름을 알렸습니다.

## 전국투어 공연 예매 일정 공개
박서진의 전국투어 공연 일정과 티켓 예매 정보가 공개됐습니다. 공연 개최 지역과 일정, 예매 시작 시점이 안내됐습니다. 공식 예매처와 공연 회차도 함께 확인할 수 있습니다.

## STELLATE 인사이트
이번 이슈의 핵심은 팬들이 실제로 예매할 수 있는 일정과 공연 정보가 구체화됐다는 점입니다.`;

assert.equal(naturalFeedHeading('basic','',{keyword:'박서진',profileText:'박서진은 트로트 가수입니다.'}),'박서진은 어떤 가수인가');
assert.equal(naturalFeedHeading('basic','',{keyword:'갤럭시 Z 폴드',profileText:'갤럭시 Z 폴드는 삼성전자의 스마트폰 제품입니다.'}),'갤럭시 Z 폴드는 어떤 제품인가');
assert.equal(naturalFeedHeading('issues','',{keyword:'박서진',eventTitle:'전국투어 공연 예매 일정 공개'}),'전국투어 공연 예매 일정 공개');

const title=fullFeedTitle('박서진','전국투어 공연 예매 일정 공개');
assert.equal(title,'박서진 · 전국투어 공연 예매 일정 공개');
const card=buildFeedSummaryCard({keyword:'박서진',feedTitle:title,blog:parkBlog});
assert.equal(card.infoLine,'박서진에 대한 정보');
assert.equal(card.summaryLabel,'요약 정보');
assert.equal(card.pointsLabel,'주요 내용');
assert.equal(card.ctaLabel,'상세 정보 피드 보기');
assert.equal(card.source,'feed_summary_v5_editorial');
assert.ok(card.summaryParagraphs.length>=1&&card.summaryParagraphs.length<=2);
assert.match(card.summary,/전국투어|예매/);
assert.ok(card.points.length>=3&&card.points.length<=5);
assert.doesNotMatch(card.points.join(' '),/추가 내용은 상세 정보 피드/);
assert.doesNotMatch(card.points.join(' '),/방송과 공연 무대를 통해 이름/);
assert.doesNotMatch(card.points.join(' '),/확인할 수$/);

const job=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(job,/prepareSelectedTopCandidates\(\(prepared\.trends \|\| \[\]\)\.slice\(0, TARGET_TOP_COUNT\),runId,TARGET_TOP_COUNT\)/);
assert.doesNotMatch(job,/prepared\.researchPool/);
assert.doesNotMatch(job,/TOP_RESEARCH_CANDIDATE_LIMIT/);
assert.doesNotMatch(job,/status:\s*'skipped'/);
assert.match(job,/21위 이하 후보로 교체하지 않습니다/);
assert.match(job,/TOP_POLICY_VERSION/);

const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(api,/첫 번째는 ‘박서진은 어떤 가수인가’/);
assert.match(api,/실제 요약정보 카드는 전체 피드 작성 후/);
assert.match(api,/CONTENT_VERSION = 131/);
assert.match(api,/TREND_CACHE_VERSION = 50/);

const preview=fs.readFileSync(new URL('../pages/[slug].js',import.meta.url),'utf8');
assert.match(preview,/summaryParagraphs/);
assert.match(preview,/상세 정보 피드 보기/);

const admin=fs.readFileSync(new URL('../pages/admin.js',import.meta.url),'utf8');
assert.match(admin,/TOP 키워드 20개 선확정/);
assert.match(admin,/21위 이하 후보 교체 없음/);
assert.match(admin,/재시도 대기 \{run\.retryWait\|\|0\}/);
assert.doesNotMatch(admin,/<p>전체 \{total\}.*후순위 생략/);


const adminAction=fs.readFileSync(new URL('../pages/api/admin-action.js',import.meta.url),'utf8');
assert.match(adminAction,/needsFixedTop20Migration/);
assert.match(adminAction,/candidates\.length!==PUBLIC_TOP_COUNT/);
assert.match(adminAction,/candidate\?\.fixedTop20!==true/);
assert.match(adminAction,/manual_explicit_retry/);
assert.match(adminAction,/retryableCount/);

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/contentVersion:131/);
assert.match(version,/trendCacheVersion:50/);
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/fixed_keyword_content_v16_top20/);
console.log('STELLATE v8.0.31 fixed TOP20 and sample-aligned feed compatibility tests: PASS');
