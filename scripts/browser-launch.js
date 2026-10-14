const { existsSync } = require('node:fs');

async function launchBrowser(chromium, env = process.env, exists = existsSync) {
  const channel = env.PLAYWRIGHT_CHANNEL;
  const executablePath = env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (channel && executablePath) {
    throw new Error('Set only one of PLAYWRIGHT_CHANNEL or PLAYWRIGHT_EXECUTABLE_PATH.');
  }
  if (channel || executablePath) {
    return chromium.launch(channel ? { channel } : { executablePath });
  }
  if (exists(chromium.executablePath())) {
    return chromium.launch({ channel: 'chromium' });
  }
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch (error) {
    throw new Error('No usable browser: run npx playwright install chromium, install Chrome, ' +
      'or set PLAYWRIGHT_CHANNEL / PLAYWRIGHT_EXECUTABLE_PATH. Chrome launch: ' + error.message,
      { cause: error });
  }
}

module.exports = { launchBrowser };
