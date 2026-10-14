const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser } = require('../scripts/browser-launch');

function fake(fail) {
  const calls = [];
  return { calls, executablePath: () => '/bundled/chromium', launch: async options => {
    calls.push(options);
    if (fail) throw new Error('launch failed');
    return 'browser';
  } };
}

test('bundled Chromium uses its matching full browser channel', async () => {
  const chromium = fake();
  assert.equal(await launchBrowser(chromium, {}, () => true), 'browser');
  assert.deepEqual(chromium.calls, [{ channel: 'chromium' }]);
});
test('missing bundle falls back to installed Chrome', async () => {
  const chromium = fake();
  await launchBrowser(chromium, {}, () => false);
  assert.deepEqual(chromium.calls, [{ channel: 'chrome' }]);
});
test('neither browser available reports recovery', async () => {
  await assert.rejects(launchBrowser(fake(true), {}, () => false), /No usable browser.*playwright install chromium/);
});
test('explicit channel and executable selections are forwarded', async () => {
  for (const [env, options] of [
    [{ PLAYWRIGHT_CHANNEL: 'chrome' }, { channel: 'chrome' }],
    [{ PLAYWRIGHT_EXECUTABLE_PATH: '/custom/browser' }, { executablePath: '/custom/browser' }]
  ]) {
    const chromium = fake();
    await launchBrowser(chromium, env);
    assert.deepEqual(chromium.calls, [options]);
  }
});
test('explicit launch failure never falls back', async () => {
  const chromium = fake(true);
  await assert.rejects(launchBrowser(chromium, { PLAYWRIGHT_CHANNEL: 'chrome' }), /launch failed/);
  assert.equal(chromium.calls.length, 1);
});
test('conflicting selectors fail before launch', async () => {
  const chromium = fake();
  await assert.rejects(launchBrowser(chromium, { PLAYWRIGHT_CHANNEL: 'chrome', PLAYWRIGHT_EXECUTABLE_PATH: '/x' }), /only one/);
  assert.equal(chromium.calls.length, 0);
});
test('existing bundle launch errors are not hidden by fallback', async () => {
  const chromium = fake(true);
  await assert.rejects(launchBrowser(chromium, {}, () => true), /launch failed/);
  assert.deepEqual(chromium.calls, [{ channel: 'chromium' }]);
});
