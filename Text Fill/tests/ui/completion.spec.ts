import { expect, test, type Page } from '@playwright/test';
import type { FillRequest, FillResult, HostMessage, UIMessage } from '../../src/shared/types';

declare global {
  interface Window { __PLUGIN_REQUESTS__: FillRequest[] }
}

async function openPlugin(page: Page) {
  await page.addInitScript(() => {
    if (window.parent !== window) return;
    window.__PLUGIN_REQUESTS__ = [];
    window.addEventListener('message', event => {
      const message = event.data?.pluginMessage as UIMessage | undefined;
      if (message?.type === 'get-selection') {
        document.querySelector('iframe')!.contentWindow!.postMessage({ pluginMessage: { type: 'selection-state', count: 1 } }, '*');
      } else if (message?.type === 'apply-quick-fill' || message?.type === 'apply-custom-fill') {
        window.__PLUGIN_REQUESTS__.push(message);
      }
    });
  });
  await page.route('**/__plugin-host', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body style="margin:0"><iframe title="plugin" src="/" style="width:360px;height:440px;border:0"></iframe></body></html>',
  }));
  await page.goto('/__plugin-host');
  const panel = page.frameLocator('iframe');
  await expect(panel.locator('.fill-row')).toHaveCount(13);
  return panel;
}

async function getRequest(page: Page, number: number) {
  await expect.poll(() => page.evaluate(() => window.__PLUGIN_REQUESTS__.length)).toBe(number);
  return page.evaluate(index => window.__PLUGIN_REQUESTS__[index], number - 1);
}

async function reply(page: Page, message: HostMessage, relayed = true) {
  await page.locator('iframe').evaluate((iframe, input) => {
    const target = (iframe as HTMLIFrameElement).contentWindow!;
    if (input.relayed) {
      target.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: input.message }, source: null }));
    } else {
      target.postMessage({ pluginMessage: input.message }, '*');
    }
  }, { message, relayed });
}

test('clears loading and restores all quick actions after relayed completion', async ({ page }) => {
  const panel = await openPlugin(page);
  await panel.getByRole('button', { name: '填充姓名', exact: true }).click();
  const first = await getRequest(page, 1);
  await expect(panel.locator('.loading-dots')).toHaveCount(1);
  await expect(panel.locator('.execute:disabled')).toHaveCount(13);
  await reply(page, { type: 'fill-result', requestId: 'unrelated', updated: 1, skipped: 0 });
  await expect(panel.locator('.loading-dots')).toHaveCount(1);
  await reply(page, { type: 'fill-result', requestId: first.requestId, updated: 1, skipped: 0 });
  await expect(panel.locator('.loading-dots')).toHaveCount(0);
  await expect(panel.locator('.execute:enabled')).toHaveCount(13);
  await expect(panel.locator('.execute svg')).toHaveCount(13);
  await expect(panel.locator('.plugin-panel')).toHaveAttribute('aria-busy', 'false');

  await panel.getByRole('button', { name: '填充昵称', exact: true }).click();
  const second = await getRequest(page, 2);
  await reply(page, { type: 'fill-result', requestId: first.requestId, updated: 1, skipped: 0 });
  await expect(panel.locator('.loading-dots')).toHaveCount(1);
  await reply(page, { type: 'fill-result', requestId: second.requestId, updated: 1, skipped: 0 }, false);
  await expect(panel.locator('.execute:enabled')).toHaveCount(13);
  await expect(panel.locator('.loading-dots')).toHaveCount(0);
});

test('restores quick and custom actions after failures and permits retry', async ({ page }) => {
  const panel = await openPlugin(page);
  await panel.getByRole('button', { name: '填充姓名', exact: true }).click();
  const first = await getRequest(page, 1);
  const failed = (requestId: string): FillResult => ({ type: 'fill-result', requestId, updated: 0, skipped: 1, error: '字体加载失败' });
  await reply(page, failed(first.requestId));
  await expect(panel.locator('.execute:enabled')).toHaveCount(13);
  await expect(panel.locator('.loading-dots')).toHaveCount(0);

  await panel.getByRole('tab', { name: '自定义填充' }).click();
  await panel.getByRole('textbox', { name: '自定义文本' }).fill('再次填充');
  const confirm = panel.getByRole('button', { name: '确定', exact: true });
  await confirm.click();
  const second = await getRequest(page, 2);
  await expect(panel.locator('.confirm')).toHaveText('...');
  await reply(page, failed(second.requestId));
  await expect(confirm).toBeEnabled();
  await expect(panel.getByRole('textbox', { name: '自定义文本' })).toBeEnabled();
  await expect(panel.getByRole('checkbox', { name: '随机填充' })).toBeEnabled();
  await confirm.click();
  const third = await getRequest(page, 3);
  await reply(page, { type: 'fill-result', requestId: third.requestId, updated: 1, skipped: 0 });
  await expect(confirm).toBeEnabled();
  await expect(panel.locator('.execute:enabled')).toHaveCount(13);
  await expect(panel.locator('.loading-dots')).toHaveCount(0);
});

test('accepts a completion relayed through the plugin window itself', async ({ page }) => {
  const panel = await openPlugin(page);
  const kinds = ['姓名', '昵称', '姓名'];
  for (const [index, kind] of kinds.entries()) {
    await panel.getByRole('button', { name: `填充${kind}`, exact: true }).click();
    const request = await getRequest(page, index + 1);
    await panel.locator('body').evaluate((_, requestId) => {
      window.postMessage({ pluginMessage: { type: 'fill-result', requestId, updated: 1, skipped: 0 } }, '*');
    }, request.requestId);
    await expect(panel.locator('.loading-dots')).toHaveCount(0);
    await expect(panel.locator('.execute:enabled')).toHaveCount(13);
  }
});
