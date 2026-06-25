import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FEED_DETAIL_MIN_CHARS,
  FEED_DETAIL_TARGET_CHARS,
  FEED_DETAIL_RECOMMENDED_MIN_CHARS,
  FEED_DETAIL_RECOMMENDED_MAX_CHARS,
  isFeedDetailLengthValid,
  isFeedDetailLengthRecommended,
  feedDetailLengthGuidance,
} from '../lib/feedLengthPolicy.js';

assert.equal(FEED_DETAIL_MIN_CHARS,1000);
assert.equal(FEED_DETAIL_TARGET_CHARS,5000);
assert.equal(FEED_DETAIL_RECOMMENDED_MIN_CHARS,3500);
assert.equal(FEED_DETAIL_RECOMMENDED_MAX_CHARS,6000);
assert.equal(isFeedDetailLengthValid('가'.repeat(999)),false,'1,000자 미만은 공개 최소선 미달이어야 합니다.');
assert.equal(isFeedDetailLengthValid('가'.repeat(1000)),true,'1,000자는 통과해야 합니다.');
assert.equal(isFeedDetailLengthValid('가'.repeat(2200)),true,'근거가 적은 콘텐츠는 5,000자 미만이어도 통과해야 합니다.');
assert.equal(isFeedDetailLengthValid('가'.repeat(7500)),true,'5,000자 권장은 하드 상한이 아니어야 합니다.');
assert.equal(isFeedDetailLengthRecommended('가'.repeat(5000)),true);
assert.equal(feedDetailLengthGuidance('가'.repeat(1200)),'concise_supported');
assert.equal(feedDetailLengthGuidance('가'.repeat(5000)),'recommended_range');

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const api=fs.readFileSync(path.join(root,'lib/api.js'),'utf8');
const publication=fs.readFileSync(path.join(root,'lib/publicationPolicy.js'),'utf8');
const architecture=fs.readFileSync(path.join(root,'lib/contentArchitecture.js'),'utf8');
const version=fs.readFileSync(path.join(root,'pages/api/version.js'),'utf8');
assert.match(api,/약 5,000자를 권장|target\.toLocaleString/);
assert.match(api,/같은 사실을 반복하거나 일반론·추측·전망을 추가하면 안 됩니다/);
assert.match(api,/feedDetailLengthPolicy:'v8046-min1000-target5000-recovery'/);
assert.match(publication,/feedBodyLength<FEED_DETAIL_MIN_CHARS/);
assert.doesNotMatch(publication,/feedBodyLength>FEED_DETAIL/);
assert.match(architecture,/!enforceFlexibleFeedLength&&length>maximumLength/);
assert.match(version,/minimum-1000-recommended-around-5000-no-padding-v8046/);
assert.match(version,/contentVersion:136/);
console.log('STELLATE v8.0.47 flexible feed length policy tests: PASS');
