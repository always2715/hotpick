import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const job=fs.readFileSync(path.join(root,'lib','trendRefreshJob.js'),'utf8');
const version=fs.readFileSync(path.join(root,'pages','api','version.js'),'utf8');

const declarationIndex=job.indexOf('const hybridPublication=buildHybridPublicationRows');
assert.ok(declarationIndex>0,'finalize hybridPublication declaration must exist');
const beforeFinalizeDeclaration=job.slice(0,declarationIndex);
assert.doesNotMatch(beforeFinalizeDeclaration,/hybridPublication\./,'hybridPublication must not be referenced before finalize declaration');
assert.match(job,/freshReadyCount:\s*0,[\s\S]*carryoverReadyCount:\s*0,[\s\S]*publicationMode:\s*'pending'/);
assert.match(job,/const hybridPublication=buildHybridPublicationRows/);
assert.match(version,/hybridPublicationInitializationV8053/);

console.log('STELLATE v8.0.53 hybrid publication initialization tests: PASS');
