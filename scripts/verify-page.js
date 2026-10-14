// Playwright 自动验证脚本
// 用法: node scripts/verify-page.js <path-to-html>
const { pathToFileURL } = require('node:url');
const { launchBrowser } = require('./browser-launch');

(async () => {
  const htmlPath = process.argv[2];
  if (!htmlPath) {
    console.error('用法: node scripts/verify-page.js <path-to-html>');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const browser = await launchBrowser(chromium);
  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', err => errors.push('❌ JS Error: ' + err.message));

  try {
    await page.goto(pathToFileURL(require('path').resolve(htmlPath)).href, { waitUntil: 'domcontentloaded' });

    // 1. 检查占位符残留
    const html = await page.content();
    if (html.includes('{{') && html.includes('}}')) {
      errors.push('❌ 残留占位符 {{...}}（可能含 {{theme_style}}/{{theme_name}} 未填）');
    } else {
      console.log('✅ 无占位符残留');
    }

    // 1b. 检查主题（body data-theme）
    const theme = await page.getAttribute('body', 'data-theme');
    const knownThemes = ['warm-paper', 'minimal', 'dark', 'ink-wash', 'vintage-editorial', 'paper-ink'];
    if (!theme) {
      errors.push('❌ <body> 缺少 data-theme 属性（{{theme_name}} 未填）');
    } else if (!knownThemes.includes(theme)) {
      errors.push('❌ 未知主题 data-theme="' + theme + '"，已知: ' + knownThemes.join('/'));
    } else {
      console.log('🎨 当前主题: ' + theme);
    }

    // 2. 验证 Tab
    const tabs = await page.locator('.tab').all();
    console.log(`📑 Tab 数量: ${tabs.length}`);
    if (tabs.length === 0) {
      errors.push('❌ 没有找到 Tab 按钮');
    } else {
      for (let i = 0; i < tabs.length; i++) {
        await tabs[i].click();
        await page.waitForTimeout(100);
        const selected = await tabs[i].getAttribute('aria-selected');
        if (selected !== 'true') {
          errors.push(`❌ Tab ${i} 点击后 aria-selected 不是 true`);
        }
      }
      console.log(`✅ ${tabs.length} 个 Tab 全部可切换`);
    }

    // 3. 验证 Causal Chain
    const chainBtns = await page.locator('.chain-step').all();
    if (chainBtns.length > 0) {
      // 确保 chain 所在 panel 是可见的
      for (const btn of chainBtns) {
        const visible = await btn.isVisible();
        if (visible) {
          await btn.click();
          await page.waitForTimeout(100);
          const active = await btn.evaluate(el => el.classList.contains('active'));
          if (!active) errors.push('❌ Chain 按钮点击后未激活');
          break;
        }
      }
      // 验证 chainText 有内容
      const ct = await page.locator('#chainText');
      if (await ct.count() > 0) {
        const text = await ct.textContent();
        if (text.length < 10) errors.push('❌ chainText 内容过短');
        else console.log(`✅ Causal Chain (${chainBtns.length} 节点) — 正常`);
      }
    }

    // 4. 验证 Type Selector
    const cityBtns = await page.locator('.city-btn').all();
    if (cityBtns.length > 0) {
      for (const btn of cityBtns) {
        const visible = await btn.isVisible();
        if (visible) {
          await btn.click();
          await page.waitForTimeout(100);
          break;
        }
      }
      const result = await page.locator('.result h3');
      if (await result.count() > 0) console.log('✅ Type Selector — 正常');
    }

    // 5. 验证 Accordion
    const details = await page.locator('.accordion details').all();
    if (details.length > 0) {
      for (const d of details) {
        const visible = await d.isVisible();
        if (visible) {
          const wasOpen = await d.evaluate(el => el.hasAttribute('open'));
          await d.locator('summary').click();
          await page.waitForTimeout(200);
          const isOpen = await d.evaluate(el => el.hasAttribute('open'));
          if (wasOpen === isOpen) errors.push('❌ Accordion 点击后状态未变化');
          break;
        }
      }
      console.log(`✅ Accordion (${details.length} 项) — 可折叠`);
    }

    // 6. 验证 Timeline
    const tlItems = await page.locator('.timeline-item').all();
    if (tlItems.length > 0) console.log(`✅ Timeline (${tlItems.length} 个节点) — 正常渲染`);

    // 7. 验证 Before/After
    const baCols = await page.locator('.before-after .ba-col').all();
    if (baCols.length > 0) console.log(`✅ Before/After (${baCols.length} 列) — 正常渲染`);

    // 8. 验证 Story Card
    const stories = await page.locator('.story').all();
    if (stories.length > 0) console.log(`✅ Story Card (${stories.length} 个) — 正常渲染`);

    // 9. 验证 Quote Card
    const quotes = await page.locator('.quote').all();
    if (quotes.length > 0) console.log(`✅ Quote Card (${quotes.length} 个) — 正常渲染`);

    // 10. 验证 Question list
    const questions = await page.locator('.questions .question').all();
    if (questions.length > 0) console.log(`✅ Questions (${questions.length} 个) — 正常渲染`);

    // 11. 验证 Source Toggle
    const toggle = page.locator('#srcToggle');
    if (await toggle.count() > 0) {
      await toggle.click();
      await page.waitForTimeout(100);
      const hasSources = await page.evaluate(() => document.body.classList.contains('show-sources'));
      if (!hasSources) errors.push('❌ Source Toggle 点击后 body.show-sources 未添加');
      await toggle.click();
      console.log('✅ Source Toggle — 正常');
    }

    // 12. 验证移动端断点（检查 viewport 变化时页面不崩溃）
    await page.setViewportSize({ width: 500, height: 800 });
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 1280, height: 900 });
    console.log('✅ 移动端响应式断点 — 无崩溃');

    // 13. 检查 data-source 属性
    const srcElements = await page.locator('[data-source]').count();
    if (srcElements > 0) {
      console.log(`📎 出处标注: ${srcElements} 个元素有 data-source 属性`);
    } else {
      console.log('⚠️  无 data-source 属性 — 如非 overview 模式，需检查');
    }

  } catch (e) {
    errors.push('❌ 测试异常: ' + e.message);
  }

  // 结果汇总
  console.log('\n' + '='.repeat(40));
  if (errors.length === 0) {
    console.log('✅ 全部验证通过');
  } else {
    console.log(`❌ ${errors.length} 个错误:`);
    errors.forEach(e => console.log('  ' + e));
  }
  console.log('='.repeat(40));

  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
})().catch(error => {
  console.error('❌ 验证失败: ' + error.message);
  process.exitCode = 1;
});
