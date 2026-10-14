const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const script = path.resolve(__dirname, '../scripts/verify-page.js');
const fixture = readFileSync(path.join(__dirname, 'fixtures/minimal.html'), 'utf8');
function run(html) {
  const dir = mkdtempSync(path.join(tmpdir(), 'book verifier '));
  // Spaces, # and Unicode must survive file URL construction.
  const file = path.join(dir, '页面 #1.html');
  writeFileSync(file, html);
  try {
    return spawnSync(process.execPath, [script, file], { cwd: dir, encoding: 'utf8', timeout: 30000 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('real browser validates clicks, responsive and sources from any cwd', () => {
  const result = run(fixture);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const output of ['2 个 Tab 全部可切换', 'Source Toggle — 正常', '移动端响应式断点', '1 个元素有 data-source']) {
    assert.ok(result.stdout.includes(output), result.stdout);
  }
});
test('broken click is detected', () => {
  const result = run(fixture.replace('onclick="selectTab(this)"', 'onclick="void 0"').replace('aria-selected="true"', 'aria-selected="false"'));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /aria-selected 不是 true/);
});
test('pageerror produces nonzero exit', () => {
  const result = run(fixture + '<script>throw new Error("fixture pageerror")</script>');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /JS Error: fixture pageerror/);
});
test('placeholder residue produces nonzero exit', () => {
  const result = run(fixture + '<p>{{unfinished}}</p>');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /残留占位符/);
});
