import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixedTop30ContentRejectionReasons, isFixedTop30ContentReady } from '../lib/publicationPolicy.js';
import { publicTopRejectionReasons } from '../lib/trendSelectionPolicy.js';

const source={source:'연합뉴스',domain:'yna.co.kr',sourceType:'trusted_news',link:'https://www.yna.co.kr/test'};
const fact={id:'F1',text:'테스트 서비스가 새 기능을 공개했습니다.',status:'single_source',sourceIds:['S1'],sourceType:'trusted_news'};
const content={
  status:'review_required',visibility:'private',reviewRequired:true,
  publicationDecision:{publishable:false,reasons:['편집 진단']},
  contentMode:'detailed',contentType:'detailed',hasContent:true,
  blog:'## 키워드 기본정보\n테스트 서비스의 기본 정보를 설명합니다.\n\n## 이슈사항\n최근 36시간 안에 새 기능 공개가 확인됐습니다.\n\n## 온라인 동향\n온라인 반응은 별도 참고 정보입니다.\n\n## STELLATE 인사이트\n확인된 사실을 중심으로 정리했습니다.',
  card:{summary:'테스트 서비스가 최근 36시간 안에 새 기능을 공개한 사실이 확인됐습니다.',why:'서비스 이용 방식에 영향을 주는 변경입니다.',points:['새 기능 공개','최근 36시간 확인','출처 기반 정리']},
  topKeyword:'테스트 서비스',topTopic:'새 기능 공개',topTitle:'테스트 서비스 · 새 기능 공개',
  feedTitle:'테스트 서비스 · 새 기능 공개',detailTitle:'테스트 서비스 · 새 기능 공개',displayTitle:'테스트 서비스 · 새 기능 공개',
  titleReady:true,titleStatus:'ready',groundingScore:70,aiStatus:'claude',
  copyrightRisk:{passed:false,maxSimilarity:0.6,longPhraseMatches:1},
  evidenceSources:[source],factLedger:{facts:[fact],conflicts:[]},
};
assert.deepEqual(fixedTop30ContentRejectionReasons(content),[],'편집 검토 상태와 경미한 유사도만으로 고정 TOP30 콘텐츠를 탈락시키면 안 됩니다.');
assert.equal(isFixedTop30ContentReady(content),true);

assert.deepEqual(publicTopRejectionReasons({
  publicTopPolicy:'fixed_top30_content_pipeline_v5',publicReady:true,verifiedFactCount:1,verifiedEvidenceCount:1,contentReady:true,mainVisible:true,
}),[],'저장 정책명과 공개 조회 필터가 일치해야 TOP30이 화면에서 줄지 않습니다.');
assert.deepEqual(publicTopRejectionReasons({
  publicTopPolicy:'strict_atomic_top30_v4',publicReady:true,verifiedFactCount:1,verifiedEvidenceCount:1,contentReady:true,mainVisible:true,
}),[],'v8.0.12에서 저장된 정상 TOP도 하위 호환으로 표시되어야 합니다.');


const refresh=fs.readFileSync(new URL('../lib/trendRefreshJob.js',import.meta.url),'utf8');
assert.match(refresh,/prepareSelectedTopCandidates\(\(prepared\.trends \|\| \[\]\)\.slice\(0, TARGET_TOP_COUNT\)/);
assert.doesNotMatch(refresh,/TOP_RESEARCH_CANDIDATE_LIMIT/);
assert.match(refresh,/fixedTop20Flow:\s*true/);
assert.match(refresh,/isFixedKeywordFeedReady/);
assert.match(refresh,/top20_fixed_content_incomplete/);
assert.doesNotMatch(refresh,/buildDeterministicSafetyContent/);

const api=fs.readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
assert.match(api,/fixedTop20Flow&&contentIsReady\(stageCandidate\)&&isFixedKeywordFeedReady\(stageCandidate\)/);
assert.match(api,/contentPipeline:\['top20_keyword_selection','independent_keyword_search','feed_first_content','feed_derived_summary'\]/);

const version=fs.readFileSync(new URL('../pages/api/version.js',import.meta.url),'utf8');
assert.match(version,/fixed-keyword-content-stop-control-v8025/);
assert.match(version,/fixed_keyword_content_v16_top20/);
console.log('v8.0.13 fixed TOP20 compatibility tests passed under v8.0.25');
