import { PUBLIC_TOP_COUNT, TOP_GENERATION_POOL_COUNT, TOP_POLICY_VERSION } from './topConfig.js';

export const CURRENT_TREND_ENGINE_VERSION = '8.0.43';
export const COMPATIBLE_TREND_ENGINE_VERSIONS = new Set(['8.0.37', '8.0.38', '8.0.39', '8.0.40', '8.0.41', '8.0.42', '8.0.43']);

function positiveNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function assessTrendRunCompatibility(run = {}) {
  const engineVersion = String(run?.engineVersion || '').trim();
  const enginePolicy = String(run?.enginePolicy || run?.publicTopPolicy || '').trim();
  const generationPoolCount = positiveNumber(run?.generationPoolCount);
  const publicTopCount = positiveNumber(run?.publicTopCount || run?.targetTopCount);
  const reasons = [];

  if (enginePolicy && enginePolicy !== TOP_POLICY_VERSION) reasons.push('TOP 생성·공개 정책이 현재 버전과 다름');
  if (generationPoolCount && generationPoolCount !== TOP_GENERATION_POOL_COUNT) reasons.push(`생성 후보 수 ${generationPoolCount}개`);
  if (publicTopCount && publicTopCount !== PUBLIC_TOP_COUNT) reasons.push(`공개 TOP 수 ${publicTopCount}개`);

  const versionCompatible = COMPATIBLE_TREND_ENGINE_VERSIONS.has(engineVersion);
  const policyCompatible = Boolean(enginePolicy === TOP_POLICY_VERSION)
    && (!generationPoolCount || generationPoolCount === TOP_GENERATION_POOL_COUNT)
    && (!publicTopCount || publicTopCount === PUBLIC_TOP_COUNT);

  if (!versionCompatible && !policyCompatible) {
    reasons.push(engineVersion ? `호환되지 않는 엔진 버전 ${engineVersion}` : '엔진 버전·정책 정보 없음');
  }

  return {
    compatible: reasons.length === 0 && (versionCompatible || policyCompatible),
    engineVersion,
    enginePolicy,
    generationPoolCount,
    publicTopCount,
    reasons: [...new Set(reasons)],
  };
}

export function currentTrendEngineMetadata() {
  return {
    engineVersion: CURRENT_TREND_ENGINE_VERSION,
    enginePolicy: TOP_POLICY_VERSION,
    generationPoolCount: TOP_GENERATION_POOL_COUNT,
    publicTopCount: PUBLIC_TOP_COUNT,
  };
}
