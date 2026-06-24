import pkg from '../../package.json';

export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    appVersion:pkg.version,
    contentVersion:128,
    trendCacheVersion:48,
    engine:'fixed-keyword-content-stop-control-v8025-admin-runtime-recovery-v8026-bounded-retry-v8027-completion-recovery-v8028-accuracy-first-fact-ledger-v8029-stop-and-feed-recovery-v8030-top20-stage-durability-v8031-durable-run-snapshot-v8032',
    feedFallback:'auto-repair-published-feed-indexes-source-of-truth-force-rebuild-with-schema-validation-source-content-fallback-force-index-rebuild-visible-count-verification-v8030-top20-stage-durability-v8031-durable-run-snapshot-v8032',
    navigationFlow:'top-summary-card-to-feed-detail',
    publicCopyPolicy:'hide-research-window-phrases',
    instagramPolicy:'cover-feed-sections-insight-promo',
    publicTopPolicy:'fixed_keyword_content_v16_top20',
    topKeywordPolicy:'v8020-relative-ranking-fixed-20',
    keywordExtractionPolicy:'v8022-single-representative-entity',
    contentPolicy:'keyword-identity-or-current-issue',
    stopControl:'admin-immediate-cancel-stop-flag-task-stop-and-qstash-publication-block-v8030-top20-stage-durability-v8031-durable-run-snapshot-v8032',
    adminRuntime:'missing-component-recovery-and-fail-safe-ssr',
    retryPolicy:'initial-20-once-then-failed-only-small-qstash-retry-plus-finalize-pending-guard',
    automaticKeywordAttempts:2,
    manualKeywordAttempts:3,
    retryBatchSize:6,
    maxKeywordAttempts:3,
    maxRunSteps:18,
    maxRunMinutes:60,
    researchWindowHours:36,
    qualityGate:'fact-id-semantic-number-date-inference-validation-and-deterministic-repair',
    completionRecovery:'preserve-ready-stages-and-repair-only-from-verified-fact-ledger',
    feedSummaryPolicy:'verified-fact-sentences-only-no-object-coercion',
    relatedVideoPolicy:'direct-topic-relevance-trusted-channel-up-to-30-days',
    sourceDeduplication:'canonical-url-once-across-related-news-and-sources',
    feedReadPolicy:'index-first-then-published-content-source-of-truth-fallback',
    activeRunControl:'admin-current-run-id-and-immediate-cancel',
    publicTopCount:20,
    stageDurability:'dual-write-run-snapshot-and-publication-stage-with-self-healing-read',
    genericFactPolicy:'remove-generic-facts-and-rebuild-from-concrete-ledger-facts',
  });
}
