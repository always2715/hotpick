import { rankIdentityScore } from './rankMovement.js';

export const MAX_PREVIOUS_TOP_CARRYOVER = 5;
export const MIN_FRESH_PUBLICATION_COUNT = 15;

function rowTrend(row={}) {
  return row?.trend || row || {};
}

function rankOf(row={}, fallback=999) {
  const trend=rowTrend(row);
  return Number(trend?.selectionRank || trend?.sourceRank || trend?.rank || fallback);
}

export function samePublicationIdentity(left={}, right={}) {
  return rankIdentityScore(rowTrend(left), rowTrend(right)) >= 70;
}

export function carryoverTrendCandidates(freshRows=[], previousRows=[], limit=MAX_PREVIOUS_TOP_CARRYOVER) {
  const fresh=(Array.isArray(freshRows)?freshRows:[]).filter(Boolean);
  const previous=(Array.isArray(previousRows)?previousRows:[])
    .filter(Boolean)
    .sort((a,b)=>Number(a?.rank||999)-Number(b?.rank||999));
  const selected=[];
  const max=Math.max(0,Number(limit||0));
  for(const trend of previous){
    if(selected.length>=max)break;
    if(fresh.some(row=>samePublicationIdentity(row,trend)))continue;
    if(selected.some(row=>samePublicationIdentity(row,trend)))continue;
    selected.push(trend);
  }
  return selected;
}

export function buildHybridPublicationRows(freshRows=[], carryoverRows=[], targetCount=20) {
  const target=Math.max(1,Number(targetCount||20));
  const fresh=(Array.isArray(freshRows)?freshRows:[])
    .filter(Boolean)
    .sort((a,b)=>rankOf(a)-rankOf(b))
    .slice(0,target);
  const needed=Math.max(0,target-fresh.length);
  const carryovers=[];
  for(const row of (Array.isArray(carryoverRows)?carryoverRows:[])){
    if(carryovers.length>=needed)break;
    if(!row)continue;
    if(fresh.some(freshRow=>samePublicationIdentity(freshRow,row)))continue;
    if(carryovers.some(saved=>samePublicationIdentity(saved,row)))continue;
    carryovers.push(row);
  }
  const rows=[...fresh,...carryovers].slice(0,target);
  return {
    rows,
    freshRows:fresh,
    carryoverRows:carryovers,
    freshCount:fresh.length,
    carryoverCount:carryovers.length,
    complete:rows.length===target,
    mode:carryovers.length?'fresh_plus_previous_carryover':'fresh_only',
  };
}
