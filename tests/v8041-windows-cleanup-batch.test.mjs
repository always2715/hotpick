import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const batPath = path.join(projectRoot, 'APPLY_STELLATE_v8.0.52_CLEANUP.bat');
const bytes = fs.readFileSync(batPath);
const text = bytes.toString('ascii');

assert.equal(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, false, 'BAT must not contain a UTF-8 BOM.');
assert.equal([...bytes].every((byte) => byte < 128), true, 'BAT must contain ASCII bytes only.');
assert.equal(/(^|[^\r])\n/.test(bytes.toString('latin1')), false, 'BAT must use CRLF line endings only.');
assert.match(text, /^@echo off\r\n/);
assert.match(text, /cd \/d "%~dp0"/);
assert.match(text, /if exist "app" rmdir \/s \/q "app"/);
assert.match(text, /if exist "\.next" rmdir \/s \/q "\.next"/);
assert.match(text, /APPLY_STELLATE_v8\.0\.42_CLEANUP\.bat/);
assert.match(text, /node "scripts\\clean-stellate-repository\.mjs" --local/);
assert.match(text, /exit \/b 0/);
assert.equal(fs.existsSync(path.join(projectRoot, 'APPLY_STELLATE_v8.0.42_CLEANUP.bat')), false, 'Old v8.0.42 BAT must not remain.');

const cleanupSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'clean-stellate-repository.mjs'));
assert.equal([...cleanupSource].every((byte) => byte < 128), true, 'Cleanup script console output must be ASCII-safe.');

const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
assert.equal(pkg.version, '8.0.52');
assert.match(pkg.scripts['test:v8041'], /v8041-windows-cleanup-batch/);

console.log('STELLATE v8.0.52 Windows cleanup BAT encoding tests: PASS');
