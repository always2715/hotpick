import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_PREVIOUS_TOP_CARRYOVER,
  MIN_FRESH_PUBLICATION_COUNT,
  carryoverTrendCandidates,
  buildHybridPublicationRows,
} from '../lib/partialTopPublication.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const fresh=Array.from({length:19},(_,index)=>({trend:{slug:`fresh-${index+1}`,eventKey:`fresh-${index+1}`,selectionRank:index+1},content:{slug:`fresh-${index+1}`}}));
const previous=Array.from({length:20},(_,index)=>({slug:`old-${index+1}`,eventKey:`old-${index+1}`,rank:index+1}));
const candidates=carryoverTrendCandidates(fresh,previous,previous.length);
const carryoverRows=candidates.slice(0,1).map(trend=>({trend,content:{slug:trend.slug},carryover:true}));
const hybrid=buildHybridPublicationRows(fresh,carryoverRows,20);
assert.equal(MAX_PREVIOUS_TOP_CARRYOVER,5);
assert.equal(MIN_FRESH_PUBLICATION_COUNT,15);
assert.equal(hybrid.complete,true);
assert.equal(hybrid.freshCount,19);
assert.equal(hybrid.carryoverCount,1);
assert.equal(hybrid.rows.length,20);
assert.equal(hybrid.mode,'fresh_plus_previous_carryover');

const fifteen=buildHybridPublicationRows(fresh.slice(0,15),previous.slice(0,5).map(trend=>({trend,content:{slug:trend.slug},carryover:true})),20);
assert.equal(fifteen.complete,true);
assert.equal(fifteen.carryoverCount,5);
const fourteen=buildHybridPublicationRows(fresh.slice(0,14),previous.slice(0,5).map(trend=>({trend,content:{slug:trend.slug},carryover:true})),20);
assert.equal(fourteen.complete,false);
assert.equal(fourteen.rows.length,19);

const duplicatePrevious=[{slug:'changed-slug',eventKey:'fresh-1',rank:1},...previous];
const deduped=carryoverTrendCandidates(fresh,duplicatePrevious,20);
assert.equal(deduped.some(row=>row.eventKey==='fresh-1'),false);

const refresh=fs.readFileSync(path.join(root,'lib','trendRefreshJob.js'),'utf8');
assert.match(refresh,/freshPublicationRows\.length>=MIN_FRESH_PUBLICATION_COUNT/);
assert.match(refresh,/previous_top_carryover/);
assert.match(refresh,/top20_hybrid_publication_incomplete/);
assert.match(refresh,/carryoverReadyCount/);
assert.doesNotMatch(refresh,/readyRows\.length<TARGET_TOP_COUNT\?'top20_from25_content_incomplete'/);



const adminPage=fs.readFileSync(path.join(root,'pages','admin.js'),'utf8');
assert.match(adminPage,/이전 TOP 보충/);
assert.match(adminPage,/최종 공개/);

const admin=fs.readFileSync(path.join(root,'pages','api','admin-action.js'),'utf8');
assert.match(admin,/invalidFixedCandidates\.length&&ready<MIN_FRESH_PUBLICATION_COUNT/);
assert.match(admin,/CANDIDATE_FRAGMENT_REJECTED_FOR_CARRYOVER/);
assert.match(admin,/hybridCarryoverEligible/);

console.log('STELLATE v8.0.52 hybrid TOP20 publication tests: PASS');
