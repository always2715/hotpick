import assert from 'node:assert/strict';
import fs from 'node:fs';

const header=fs.readFileSync(new URL('../components/Header.js',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../pages/index.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles/globals.css',import.meta.url),'utf8');

assert.match(header,/>\s*TOP20\s*</,'상단 메뉴 이름은 TOP20이어야 합니다.');
assert.doesNotMatch(header,/검색순위/,'기존 검색순위 메뉴 문구가 남으면 안 됩니다.');
assert.match(home,/지금 확인된 주요 이슈/,'첫 줄 제목이 표시되어야 합니다.');
assert.match(home,/실시간 검색 순위 - TOP20/,'둘째 줄 제목이 표시되어야 합니다.');
assert.match(home,/3시간 단위 갱신/,'갱신 주기 안내가 표시되어야 합니다.');
assert.match(css,/home-ranking-title/,'두 줄 제목 스타일이 있어야 합니다.');
assert.match(css,/refresh-cycle/,'갱신 주기 표시 스타일이 있어야 합니다.');

console.log('STELLATE v8.0.48 TOP20 header copy tests: PASS');
