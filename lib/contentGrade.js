import { FEED_DETAIL_MIN_CHARS, FEED_DETAIL_TARGET_CHARS, FEED_DETAIL_RECOMMENDED_MIN_CHARS, FEED_DETAIL_RECOMMENDED_MAX_CHARS } from './feedLengthPolicy.js';
const USABLE_SOURCE_TYPES = new Set(['official','authorized','trusted_news','independent']);

function clean(value='') { return String(value || '').replace(/\s+/g,' ').trim(); }
function sourceRows(evidenceSources=[], factLedger={}) {
  const direct=Array.isArray(evidenceSources)?evidenceSources:[];
  const ledger=Array.isArray(factLedger?.sources)?factLedger.sources:[];
  const rows=[...direct,...ledger];
  const seen=new Set();
  return rows.filter(row=>{
    const type=String(row?.sourceType||'');
    if(!USABLE_SOURCE_TYPES.has(type))return false;
    const key=String(row?.url||row?.link||row?.domain||row?.source||row?.id||'').trim();
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
}

function factRows(factLedger={}) {
  return (Array.isArray(factLedger?.facts)?factLedger.facts:[]).filter(fact=>{
    if(String(fact?.scope||'issue')==='profile')return false;
    const text=clean(fact?.text||fact?.claim||'');
    const linked=(Array.isArray(fact?.sourceIds)&&fact.sourceIds.length>0)||USABLE_SOURCE_TYPES.has(String(fact?.sourceType||''));
    return Boolean(text&&linked);
  });
}

function materialFactCount(facts=[]) {
  return facts.filter(fact=>{
    const type=String(fact?.type||fact?.claimType||'').toLowerCase();
    const text=clean(fact?.text||fact?.claim||'');
    return /schedule|date|number|price|amount|change|state|launch|result/.test(type)
      || /\d|일정|날짜|가격|요금|수치|변경|시행|출시|복구|종료|결과/.test(text);
  }).length;
}

export function deriveContentGrade({factLedger={},evidenceSources=[]}={}) {
  const facts=factRows(factLedger);
  const sources=sourceRows(evidenceSources,factLedger);
  const official=sources.filter(row=>row.sourceType==='official').length;
  const domains=new Set(sources.map(row=>String(row?.domain||'').trim()).filter(Boolean));
  const materialFacts=materialFactCount(facts);
  let grade='D';
  if(facts.length>=5&&sources.length>=2&&domains.size>=2&&(official>=1||materialFacts>=2))grade='A';
  else if(facts.length>=3&&sources.length>=1)grade='B';
  else if(facts.length>=1&&sources.length>=1)grade='C';
  const contentScore=Math.min(100,Math.round(facts.length*12+sources.length*9+official*8+materialFacts*5));
  return {grade,contentScore,factCount:facts.length,sourceCount:sources.length,officialCount:official,independentSourceCount:domains.size,materialFactCount:materialFacts};
}

export function contentLengthRange() {
  return {min:FEED_DETAIL_MIN_CHARS,target:FEED_DETAIL_TARGET_CHARS,recommendedMin:FEED_DETAIL_RECOMMENDED_MIN_CHARS,recommendedMax:FEED_DETAIL_RECOMMENDED_MAX_CHARS};
}


export function isInterestContentGrade(grade='') { return String(grade||'').toUpperCase()==='D'; }
