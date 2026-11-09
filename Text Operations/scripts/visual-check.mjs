import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.PLUGIN_PREVIEW_URL ?? 'http://127.0.0.1:4173';
const screenshots = {
  replaceLight: join(tmpdir(), 'xiwu-text-operations-replace-light.png'),
  extractDark: join(tmpdir(), 'xiwu-text-operations-extract-dark.png'),
  splitDark: join(tmpdir(), 'xiwu-text-operations-split-dark.png'),
};

const browser = await chromium.launch({ executablePath: edgePath, headless: true });
const page = await browser.newPage({ viewport: { width: 360, height: 440 }, deviceScaleFactor: 1 });

function pluginMessage(message) {
  return page.evaluate((pluginMessage) => {
    window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage } }));
  }, message);
}

async function inspectLayout(label) {
  const result = await page.evaluate(() => {
    const selectors = ['html', 'body', '#root', '.app'];
    const roots = selectors.map((selector) => {
      const element = document.querySelector(selector);
      return {
        selector,
        width: element?.clientWidth ?? -1,
        height: element?.clientHeight ?? -1,
        scrollWidth: element?.scrollWidth ?? -1,
        scrollHeight: element?.scrollHeight ?? -1,
      };
    });
    const panel = document.querySelector('.panel');
    const overflowingButtons = [...document.querySelectorAll('button')]
      .filter((button) => button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1)
      .map((button) => button.textContent?.trim() ?? '');
    return {
      roots,
      panel: panel
        ? {
            width: panel.clientWidth,
            height: panel.clientHeight,
            scrollWidth: panel.scrollWidth,
            scrollHeight: panel.scrollHeight,
          }
        : null,
      overflowingButtons,
    };
  });

  const invalidRoot = result.roots.find(
    (root) =>
      root.width !== 360 ||
      root.height !== 440 ||
      root.scrollWidth > root.width ||
      root.scrollHeight > root.height,
  );
  if (invalidRoot) throw new Error(`${label}: invalid root layout ${JSON.stringify(invalidRoot)}`);
  if (!result.panel || result.panel.scrollWidth > result.panel.width || result.panel.scrollHeight > result.panel.height) {
    throw new Error(`${label}: panel overflow ${JSON.stringify(result.panel)}`);
  }
  if (result.overflowingButtons.length) {
    throw new Error(`${label}: overflowing buttons ${result.overflowingButtons.join(', ')}`);
  }
  return result;
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: screenshots.replaceLight });
  const replace = await inspectLayout('replace-light');

  await pluginMessage({ type: 'selection-changed', selectedCount: 2, textCount: 4, splitEligible: true });
  await page.locator('.tabs__item', { hasText: '提取' }).click();
  await pluginMessage({
    type: 'operation-result',
    requestId: 'visual-extract',
    operation: 'extract',
    ok: true,
    extractedText: '标题文本\n正文内容，第二段内容。\n最后一段文本',
  });
  await page.getByText('已完成提取').waitFor();
  await page.evaluate(() => document.body.classList.add('figma-dark'));
  await page.screenshot({ path: screenshots.extractDark });
  const extract = await inspectLayout('extract-dark');

  await page.locator('.tabs__item', { hasText: '拆分' }).click();
  await page.screenshot({ path: screenshots.splitDark });
  const split = await inspectLayout('split-dark');

  console.log(JSON.stringify({ screenshots, layouts: { replace, extract, split } }, null, 2));
} finally {
  await browser.close();
}
