import assert from 'node:assert/strict';
import { buildDeterministicImageQuery, sanitizeVisualQuery, scoreUnsplashCandidate, imageCandidateId } from '../lib/images.js';

const nuclear = buildDeterministicImageQuery({ keyword:'고리원전', topic:'원전 관련 발표', category:'politics' });
assert.equal(nuclear?.query, 'nuclear power plant reactor cooling towers');
assert.ok(nuclear?.avoid.includes('protest'));

const generic = buildDeterministicImageQuery({ keyword:'오늘의 주요 뉴스', topic:'최근 이슈', category:'general' });
assert.equal(generic, null);
assert.equal(sanitizeVisualQuery('current trends breaking news'), '');

const plant = {
  id:'plant-1', alt_description:'nuclear power plant cooling towers beside a reactor', description:'industrial energy facility',
  tags:[{title:'nuclear power'},{title:'reactor'}], urls:{regular:'https://images.unsplash.com/plant'}
};
const protest = {
  id:'protest-1', alt_description:'activists holding protest signs during a demonstration', description:'anti nuclear protest',
  tags:[{title:'protest'}], urls:{regular:'https://images.unsplash.com/protest'}
};
const plantScore = scoreUnsplashCandidate(plant, nuclear.query, nuclear.avoid, 0);
const protestScore = scoreUnsplashCandidate(protest, nuclear.query, nuclear.avoid, 0);
assert.ok(plantScore.score >= 44);
assert.equal(protestScore.rejected, 'avoid_term');
assert.equal(imageCandidateId(plant), 'plant-1');

console.log('image relevance tests passed');
