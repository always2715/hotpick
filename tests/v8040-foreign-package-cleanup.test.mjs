import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const cleanupScript = path.join(projectRoot, 'scripts', 'clean-stellate-repository.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stellate-v8040-'));

fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ name: 'hotpick' }));
fs.mkdirSync(path.join(tempRoot, 'app', 'api', 'cron', 'daily'), { recursive: true });
fs.writeFileSync(path.join(tempRoot, 'app', 'api', 'cron', 'daily', 'route.ts'), "import '@/lib/nvd-cve';\n");
fs.mkdirSync(path.join(tempRoot, '.next'), { recursive: true });
fs.writeFileSync(path.join(tempRoot, '.next', 'BUILD_ID'), 'foreign-build');
fs.mkdirSync(path.join(tempRoot, 'lib'), { recursive: true });
fs.writeFileSync(path.join(tempRoot, 'lib', 'nvd-cve.ts'), 'export {};');

const result = spawnSync(process.execPath, [cleanupScript, `--root=${tempRoot}`], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.equal(fs.existsSync(path.join(tempRoot, 'app')), false, 'STELLATE Pages Router와 무관한 app 폴더를 제거해야 합니다.');
assert.equal(fs.existsSync(path.join(tempRoot, '.next')), false, '다른 프로젝트의 .next 산출물을 제거해야 합니다.');
assert.equal(fs.existsSync(path.join(tempRoot, 'lib', 'nvd-cve.ts')), false, '시큐포커스 전용 NVD 모듈을 제거해야 합니다.');


const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stellate-v8040-install-'));
fs.writeFileSync(path.join(installRoot, 'package.json'), JSON.stringify({ name: 'hotpick' }));
fs.mkdirSync(path.join(installRoot, 'app', 'api'), { recursive: true });
fs.writeFileSync(path.join(installRoot, 'app', 'api', 'route.ts'), "export {};\n");
fs.mkdirSync(path.join(installRoot, '.next'), { recursive: true });
fs.writeFileSync(path.join(installRoot, '.next', 'BUILD_ID'), 'vercel-cache');
const installResult = spawnSync(process.execPath, [cleanupScript, '--install', `--root=${installRoot}`], { encoding: 'utf8' });
assert.equal(installResult.status, 0, installResult.stderr || installResult.stdout);
assert.equal(fs.existsSync(path.join(installRoot, 'app')), false, 'preinstall에서는 빌드를 깨뜨리는 app 디렉터리를 제거해야 합니다.');
assert.equal(fs.existsSync(path.join(installRoot, '.next', 'BUILD_ID')), true, 'Vercel이 복원한 정상 빌드 캐시는 preinstall에서 강제로 지우지 않아야 합니다.');

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
assert.equal(packageJson.version, '8.0.53');
assert.match(packageJson.scripts.preinstall, /clean-stellate-repository/);
assert.match(packageJson.scripts.build, /clean-stellate-repository.*next build/);

const vercel = JSON.parse(fs.readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'));
assert.equal(vercel.buildCommand, 'npm run build');
assert.equal(fs.existsSync(path.join(projectRoot, 'app')), false, '정상 STELLATE 전체본에는 app 디렉터리가 없어야 합니다.');

fs.rmSync(tempRoot, { recursive: true, force: true });
fs.rmSync(installRoot, { recursive: true, force: true });
console.log('STELLATE v8.0.40 foreign package cleanup tests: PASS');
