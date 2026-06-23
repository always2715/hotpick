import { isFixedKeywordFeedReady } from './publicationPolicy.js';

const TARGET_TOP_COUNT=30;

function normalizedFeedTokens(value='') {
  return new Set(String(value||'').toLowerCase().replace(/[^0-9a-zㄱ-힣\s]/g,' ').split(/\s+/).filter(token=>token.length>1).filter(token=>!['입니다','습니다','있습니다','관련','대한','현재','이번','해당','통해'].includes(token)));
}

function normalizedKey(value='') {
  return String(value||'').toLowerCase().replace(/[^0-9a-zㄱ-힣]/g,'');
}

function setOverlap(left=new Set(),right=new Set()) {
  if(!left.size||!right.size)return 0;
  let common=0;left.forEach(value=>{if(right.has(value))common+=1;});
  return common/Math.max(1,Math.min(left.size,right.size));
}

function factKeys(content={}) {
  return new Set((Array.isArray(content?.factLedger?.facts)?content.factLedger.facts:[])
    .map(fact=>normalizedKey(fact?.text||fact?.claim||''))
    .filter(value=>value.length>=8));
}

function sourceKeys(content={}) {
  const rows=Array.isArray(content?.evidenceSources)?content.evidenceSources:Array.isArray(content?.sourceItems)?content.sourceItems:[];
  return new Set(rows.map(row=>String(row?.canonicalUrl||row?.link||row?.url||'').trim().toLowerCase()).filter(Boolean));
}

export function tokenSimilarity(a='',b='') {
  const left=normalizedFeedTokens(a),right=normalizedFeedTokens(b);
  if(!left.size||!right.size)return 0;
  let common=0;left.forEach(token=>{if(right.has(token))common+=1;});
  return common/Math.max(1,left.size+right.size-common);
}

// 같은 문서 구조를 사용하는 것과 실제로 동일한 콘텐츠가 재사용된 것은 구분해야 합니다.
// TOP30 피드는 공통 섹션 구조를 사용하므로 단순 토큰 유사도만으로 항목을 탈락시키지 않습니다.
export function assessFeedDuplicateRisk(left={},right={}) {
  const similarity=tokenSimilarity(left?.blog||'',right?.blog||'');
  const leftKeyword=normalizedKey(left?.topKeyword||left?.keyword||left?.displayTitle||'');
  const rightKeyword=normalizedKey(right?.topKeyword||right?.keyword||right?.displayTitle||'');
  const sameKeyword=Boolean(leftKeyword&&rightKeyword&&leftKeyword===rightKeyword);
  const sameFingerprint=Boolean(left?.fingerprint&&right?.fingerprint&&String(left.fingerprint)===String(right.fingerprint));
  const factOverlap=setOverlap(factKeys(left),factKeys(right));
  const sourceOverlap=setOverlap(sourceKeys(left),sourceKeys(right));
  const structuralSimilarity=similarity>=0.78;
  const severe=similarity>=0.92&&(sameFingerprint||sameKeyword||factOverlap>=0.8||sourceOverlap>=0.8);
  return {
    similarity:Number(similarity.toFixed(3)),
    structuralSimilarity,
    severe,
    sameKeyword,
    sameFingerprint,
    factOverlap:Number(factOverlap.toFixed(3)),
    sourceOverlap:Number(sourceOverlap.toFixed(3)),
  };
}

export function assessResearchBackedFeedSet(rows=[],targetCount=TARGET_TOP_COUNT) {
  const list=(Array.isArray(rows)?rows:[]).map(row=>row?.content||row).filter(Boolean);
  const titles=list.map(content=>String(content.feedTitle||content.topTitle||'').trim()).filter(Boolean);
  const titleKeys=new Set(titles.map(title=>title.toLowerCase().replace(/[^0-9a-zㄱ-힣]/g,'')));
  const genericTemplateCount=list.filter(content=>/현재 검색과 콘텐츠에서 관심이 늘고 있는 주제|지금 확인된 관심 흐름|관심 증가 자체만 확인된 단계|관련 관심 증가/i.test(`${content.feedTitle||''} ${content.blog||''}`)).length;
  const dGradeCount=list.filter(content=>String(content.contentGrade||'').toUpperCase()==='D').length;
  const unsupportedCount=list.filter(content=>!isFixedKeywordFeedReady(content)).length;
  const duplicatePairs=[];
  const severeDuplicatePairs=[];
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
    const risk=assessFeedDuplicateRisk(list[i],list[j]);
    if(risk.structuralSimilarity)duplicatePairs.push({left:i+1,right:j+1,...risk});
    if(risk.severe)severeDuplicatePairs.push({left:i+1,right:j+1,...risk});
  }
  const healthy=list.length===targetCount&&genericTemplateCount===0&&dGradeCount===0&&unsupportedCount===0&&titleKeys.size>=Math.min(targetCount,27)&&severeDuplicatePairs.length===0;
  return {
    healthy,count:list.length,uniqueTitleCount:titleKeys.size,genericTemplateCount,dGradeCount,unsupportedCount,
    duplicatePairCount:duplicatePairs.length,duplicatePairs:duplicatePairs.slice(0,10),
    severeDuplicatePairCount:severeDuplicatePairs.length,severeDuplicatePairs:severeDuplicatePairs.slice(0,10),
    assessmentMode:'fixed_keyword_feed_v828',
  };
}
