import { PUBLIC_TOP_COUNT } from './topConfig.js';
import { researchCandidateEntryRejectionReasons } from './trendSelectionPolicy.js';
import { tokenSimilarity } from './rankingEngine.js';

const BASE_CAPS={entertainment:8,sports:6,economy:7,tech:7,ai:7,life:7,politics:7,general:7,travel:5,trend:5};
const BUCKET_ORDER=['fresh','rising','followup','ongoing','interest','maintained'];

function clean(value=''){return String(value||'').toLowerCase().replace(/[^0-9a-z가-힣\s]/gi,' ').replace(/\s+/g,' ').trim();}
function identity(item={}){return clean(`${item.topKeyword||item.keyword||item.rawKeyword||''}|${item.topTopic||''}`);}
function sigs(item={}){return Array.isArray(item.eventSignatures)?item.eventSignatures.filter(Boolean):[];}
function overlapCount(a=[],b=[]){const set=new Set(a);return b.filter(value=>set.has(value)).length;}


function detectionAccuracy(item={}) {
  const signals=new Set((Array.isArray(item.interestSignals)?item.interestSignals:[]).filter(Boolean));
  if(Number(item.independentSources||0)>0)signals.add('independent_news');
  if(Number(item.officialSources||0)>0)signals.add('official');
  if(Number(item.rankingComponents?.search||0)>0)signals.add('search');
  if(Number(item.youtubeSupport||0)>0)signals.add('youtube');
  if(Number(item.communityCount||0)>0)signals.add('community');
  const keyword=clean(item.topKeyword||item.keyword||'');
  const coherence=Number(item.eventCoherence||0);
  const sources=Number(item.independentSources||0);
  const official=Number(item.officialSources||0);
  const keywordConfidence=Number(item.keywordConfidence||0);
  let adjustment=Math.min(18,Math.max(0,signals.size-1)*4)+Math.min(10,sources*3)+Math.min(8,official*4);
  if(coherence>=70)adjustment+=8;else if(coherence>0&&coherence<35)adjustment-=10;
  if(keywordConfidence>=70)adjustment+=5;else if(keywordConfidence>0&&keywordConfidence<35)adjustment-=7;
  if(!keyword||keyword.length<2||/^(?:뉴스|이슈|화제|사건|사고|영상|오늘|실시간)$/.test(keyword))adjustment-=24;
  const personalOnly=Number(item.youtubeSupport||0)>0&&sources===0&&official===0&&!signals.has('search')&&!signals.has('community');
  if(personalOnly)adjustment-=18;
  const score=Math.max(0,Math.min(130,Number(item.rankingScore||0)+adjustment));
  return {score,adjustment,signalDiversity:signals.size,signals:[...signals],personalOnly};
}

export function classifyCandidateBucket(item={}) {
  if(item.manualApproved===true)return 'fresh';
  if(item.previousSeed===true&&Number(item.rankingScore||0)<20)return 'maintained';
  const hasEvent=String(item.candidateType||'')==='event'||String(item.causeStatus||'')==='confirmed';
  const previous=Number(item.previousRank||0)>0;
  const search=Number(item.rankingComponents?.search||0);
  const velocity=Number(item.rankingComponents?.newsVelocity||0);
  if(!hasEvent)return previous?'ongoing':'interest';
  if(previous&&(velocity>=4||Number(item.independentSources||0)>0))return 'followup';
  if(previous)return 'ongoing';
  if(search>=12||velocity>=6)return 'rising';
  return 'fresh';
}

export function isLooseSameCandidate(left={},right={}) {
  const leftIdentity=identity(left),rightIdentity=identity(right);
  if(leftIdentity&&leftIdentity===rightIdentity)return true;
  const a=sigs(left),b=sigs(right),overlap=overlapCount(a,b);
  if(overlap>=2)return true;
  const sameTopic=clean(left.topTopic||'')&&clean(left.topTopic||'')===clean(right.topTopic||'');
  const keywordSimilarity=tokenSimilarity(left.topKeyword||left.keyword||'',right.topKeyword||right.keyword||'');
  return Boolean(sameTopic&&keywordSimilarity>=0.9&&overlap>=1);
}

function withCaps(rows=[],limit=PUBLIC_TOP_COUNT,caps=null){
  const selected=[];const categoryCounts={};
  for(const item of rows){
    if(selected.length>=limit)break;
    if(selected.some(existing=>isLooseSameCandidate(existing,item)))continue;
    const category=String(item.category||'general');
    const cap=caps?Number(caps[category]??caps.general??limit):limit;
    if((categoryCounts[category]||0)>=cap)continue;
    selected.push(item);categoryCounts[category]=(categoryCounts[category]||0)+1;
  }
  return selected;
}

function orderedRows(candidates=[]){
  const normalized=(Array.isArray(candidates)?candidates:[])
    .filter(item=>item?.manualApproved===true||researchCandidateEntryRejectionReasons(item).length===0)
    .map(item=>{const accuracy=detectionAccuracy(item);return {...item,selectionBucket:classifyCandidateBucket(item),selectionScore:accuracy.score,detectionAdjustment:accuracy.adjustment,signalDiversity:accuracy.signalDiversity,detectionSignals:accuracy.signals,personalYoutubeOnly:accuracy.personalOnly};})
    .filter(item=>item.personalYoutubeOnly!==true);
  const rows=[];
  for(const bucket of BUCKET_ORDER){
    rows.push(...normalized.filter(item=>item.selectionBucket===bucket)
      .sort((a,b)=>Number(b.manualApproved===true)-Number(a.manualApproved===true)||Number((b.selectionScore??b.rankingScore) || 0)-Number((a.selectionScore??a.rankingScore) || 0)||Number(b.rankingScore||0)-Number(a.rankingScore||0)||Number(a.googleRank||999)-Number(b.googleRank||999)));
  }
  return rows;
}

export function selectStableTop30(candidates=[], {limit=PUBLIC_TOP_COUNT}={}) {
  const target=Math.max(1,Math.min(PUBLIC_TOP_COUNT,Number(limit||PUBLIC_TOP_COUNT)));
  const ordered=orderedRows(candidates);
  let selected=withCaps(ordered,target,BASE_CAPS);
  let capPhase='base';
  if(selected.length<target){
    const expanded=Object.fromEntries(Object.entries(BASE_CAPS).map(([key,value])=>[key,value+2]));
    selected=withCaps(ordered,target,expanded);capPhase='expanded';
  }
  if(selected.length<target){selected=withCaps(ordered,target,null);capPhase='disabled';}
  selected=selected.slice(0,target).sort((a,b)=>Number((b.selectionScore??b.rankingScore) || 0)-Number((a.selectionScore??a.rankingScore) || 0)||Number(b.rankingScore||0)-Number(a.rankingScore||0)||BUCKET_ORDER.indexOf(a.selectionBucket)-BUCKET_ORDER.indexOf(b.selectionBucket)||Number(a.googleRank||999)-Number(b.googleRank||999));
  const bucketCounts=Object.fromEntries(BUCKET_ORDER.map(bucket=>[bucket,selected.filter(item=>item.selectionBucket===bucket).length]));
  return {
    rows:selected.map((item,index)=>({...item,rank:index+1,selectionBucket:item.selectionBucket||classifyCandidateBucket(item)})),
    diagnostics:{target,available:ordered.length,finalTopCount:selected.length,categoryCapPhase:capPhase,bucketCounts,usedPreviousTopCount:bucketCounts.maintained||0},
  };
}
