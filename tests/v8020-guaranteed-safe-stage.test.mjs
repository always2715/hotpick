import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTrendBrief } from '../lib/contentArchitecture.js';
import { isResearchBackedFeedReady, researchBackedFeedRejectionReasons } from '../lib/publicationPolicy.js';

const generic=buildTrendBrief({
  topicTitle:'가수 박서진',
  trendMeta:{keyword:'가수 박서진',category:'entertainment',rank:1},
  newsBundle:{relatedNews:[],relatedContent:[],relatedVideos:[],maxAgeHours:36},
});
assert.equal(isResearchBackedFeedReady(generic),false,'관심 증가 고정문은 더 이상 TOP30 완료 콘텐츠로 인정하면 안 됩니다.');
assert.ok(researchBackedFeedRejectionReasons(generic).some(reason=>/관심 증가|검색 근거/.test(reason)));

const job=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.doesNotMatch(job,/buildDeterministicSafetyContent/);
assert.doesNotMatch(job,/persistDeterministicSafetyStage/);
assert.doesNotMatch(job,/FINALIZE_SAFETY_FALLBACK_PASSES/);
assert.match(job,/assessResearchBackedFeedSet/);
assert.match(job,/확정된 TOP30 키워드 중 상세·피드·제목/);
assert.match(job,/prepared\.trends\s*\|\|\s*\[\]/);
assert.doesNotMatch(job,/prepared\.researchPool\s*\|\|\s*prepared\.trends/);
console.log('STELLATE v8.0.20 fallback regression is blocked under v8.0.21: PASS');
