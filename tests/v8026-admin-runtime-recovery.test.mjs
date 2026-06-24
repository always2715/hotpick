import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const admin=fs.readFileSync(path.join(root,'pages/admin.js'),'utf8');
const login=fs.readFileSync(path.join(root,'pages/api/admin/login.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'lib/adminAuth.js'),'utf8');
const version=fs.readFileSync(path.join(root,'pages/api/version.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

assert.ok(/^8\.0\.(?:26|27|28|29|30|31|32|33|34|35)$/.test(pkg.version));
assert.match(version,/contentVersion:131/,'정확성 엔진 변경으로 기존 저품질 캐시를 폐기해야 합니다.');
assert.match(version,/admin-runtime-recovery-v8026/);

for(const component of ['Stat','ManageRow','AuditRow','InstagramCard']){
  assert.match(admin,new RegExp(`function\\s+${component}\\s*\\(`),`${component} 컴포넌트가 정의되어야 합니다.`);
}

const tags=[...admin.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(match=>match[1]);
const functions=new Set([...admin.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)].map(match=>match[1]));
const defaultImports=new Set([...admin.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s+from/g)].map(match=>match[1]));
const namedImports=new Set();
for(const match of admin.matchAll(/import\s*\{([^}]*)\}\s*from/gs)){
  for(const raw of match[1].split(',')){
    const name=raw.trim().split(/\s+as\s+/).at(-1)?.trim();
    if(name&&/^[A-Z]/.test(name))namedImports.add(name);
  }
}
const unresolved=[...new Set(tags)].filter(name=>!functions.has(name)&&!defaultImports.has(name)&&!namedImports.has(name));
assert.deepEqual(unresolved,[],`정의되지 않은 관리자 JSX 컴포넌트가 있습니다: ${unresolved.join(', ')}`);

assert.match(admin,/const safe=async\(factory,fallback,ms=7000\)/,'관리자 SSR 조회는 fail-safe loader를 사용해야 합니다.');
assert.match(admin,/initialLoadError:true/,'관리자 데이터 일부가 실패해도 500 대신 안전 모드로 열려야 합니다.');
assert.match(admin,/STELLATE v8\.0\.(?:34|35)/);
assert.match(login,/setAdminSessionCookie/);
assert.match(auth,/verifyAdminToken/);

console.log('STELLATE v8.0.26 admin runtime recovery tests: PASS');
