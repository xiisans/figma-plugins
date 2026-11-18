import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, test, type Page } from '@playwright/test';
import { FILL_KINDS, FILL_LABELS, type HostMessage } from '../../src/shared/types';

async function openBundledPlugin(page: Page, relay: 'self' | 'ancestor', targetCount = 1) {
  const [code, html] = await Promise.all([
    readFile(new URL('../../dist/code.js', import.meta.url), 'utf8'),
    readFile(new URL('../../dist/index.html', import.meta.url), 'utf8'),
  ]);
  const panel = page.frameLocator('iframe').frameLocator('iframe');
  const messages: HostMessage[] = [];
  const writes: string[] = [];
  const notifications: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const fontName = { family: 'Inter', style: 'Regular' };
  const nodes = Array.from({ length: targetCount }, (_, index) => {
    let content = 'original';
    return {
      id: `text-${index}`, type: 'TEXT', parent: null, locked: false, removed: false, hasMissingFont: false,
      absoluteBoundingBox: { x: 0, y: index * 30, width: 100, height: 20 },
      fontName,
      getRangeAllFontNames: () => [fontName],
      get characters() { return content; },
      set characters(value: string) { content = value; writes.push(value); },
    };
  });
  const node = nodes[0];
  let ready = false;
  let delivery = Promise.resolve();
  const api = {
    showUI: () => {}, on: () => {}, mixed: Symbol('mixed'),
    currentPage: { selection: nodes },
    loadFontAsync: async () => {}, commitUndo: () => {},
    notify: (message: string) => { notifications.push(message); },
    ui: {
      onmessage: undefined as ((message: unknown) => Promise<void>) | undefined,
      postMessage(message: HostMessage) {
        messages.push(structuredClone(message));
        if (!ready) return;
        delivery = delivery.then(async () => {
          if (relay === 'self') {
            await panel.locator('html').evaluate((_, message) => {
              window.postMessage({ pluginMessage: message }, '*');
            }, message);
          } else {
            await page.evaluate(message => {
              const wrapper = document.querySelector('iframe')!.contentDocument!;
              wrapper.querySelector('iframe')!.contentWindow!.postMessage({ pluginMessage: message }, '*');
            }, message);
          }
        });
      },
    },
  };
  // Run the shipped main-thread bundle, not a mock of applyFill or its results.
  runInNewContext(code, { figma: api, __html__: html });
  await page.exposeFunction('__bundledPluginRequest', async (message: unknown) => {
    await api.ui.onmessage!(message);
    await delivery;
  });
  await page.route('**/__bundled-plugin-host', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body style="margin:0">
      <iframe title="wrapper" src="/__bundled-plugin-wrapper" style="width:360px;height:440px;border:0;display:block"></iframe>
      <script>window.addEventListener('message', event => {
        if (event.data?.pluginMessage) window.__bundledPluginRequest(event.data.pluginMessage);
      });</script></body></html>`,
  }));
  await page.route('**/__bundled-plugin-wrapper', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body style="margin:0">
      <iframe title="plugin" sandbox="allow-scripts" src="/__bundled-plugin-ui" style="width:360px;height:440px;border:0;display:block"></iframe>
      <script>window.addEventListener('message', event => {
        if (event.source === document.querySelector('iframe').contentWindow) window.parent.postMessage(event.data, '*');
      });</script></body></html>`,
  }));
  await page.route('**/__bundled-plugin-ui', route => route.fulfill({ contentType: 'text/html', body: html }));
  ready = true;
  await page.goto('/__bundled-plugin-host');
  await expect(panel.locator('.execute')).toHaveCount(13);
  return { panel, api, node, nodes, messages, writes, notifications, pageErrors, flush: () => delivery };
}

for (const relay of ['self', 'ancestor'] as const) {
  test(`shipped plugin supports repeated quick and custom fills via ${relay} relay`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: relay === 'self' ? 'dark' : 'light' });
    const host = await openBundledPlugin(page, relay);
    for (const kind of FILL_KINDS) {
      const before = host.writes.length;
      await host.panel.getByRole('button', { name: `填充${FILL_LABELS[kind]}`, exact: true }).click();
      await expect.poll(() => host.writes.length).toBe(before + 1);
      await expect(host.panel.locator('.execute:enabled')).toHaveCount(13);
      await expect(host.panel.locator('.loading-dots')).toHaveCount(0);
      await expect(host.panel.locator('.plugin-panel')).toHaveAttribute('aria-busy', 'false');
      await expect(host.panel.getByRole('status')).toHaveCount(0);
    }
    await page.screenshot({ path: `test-results/bundled-completed-${relay}.png` });
    await host.panel.getByRole('tab', { name: '自定义填充' }).click();
    for (const text of ['first custom fill', 'second custom fill']) {
      await host.panel.getByRole('textbox', { name: '自定义文本' }).fill(text);
      await host.panel.getByRole('button', { name: '确定', exact: true }).click();
      await expect.poll(() => host.node.characters).toBe(text);
      await expect(host.panel.getByRole('button', { name: '确定', exact: true })).toBeEnabled();
      await expect(host.panel.getByRole('status')).toHaveCount(0);
    }
    await host.flush();
    expect(host.messages.filter(message => message.type === 'fill-result')).toHaveLength(15);
    expect(host.notifications).toEqual(Array(15).fill('已填充 1 个文本'));
    expect(host.pageErrors).toEqual([]);
    await page.screenshot({ path: `test-results/bundled-custom-completed-${relay}.png` });
  });
}

test('shipped plugin cycles short custom input across all selected nodes in sequential and random modes', async ({ page }) => {
  const host = await openBundledPlugin(page, 'ancestor', 8);
  const valid = ['  first  ', 'second', 'third'];
  await host.panel.getByRole('tab', { name: '自定义填充' }).click();
  await host.panel.getByRole('textbox', { name: '自定义文本' }).fill('  first  \n\nsecond\n  \nthird');
  const button = host.panel.getByRole('button', { name: '确定', exact: true });
  await button.click();
  await expect.poll(() => host.writes.length).toBe(8);
  await expect(button).toBeEnabled();
  expect(host.nodes.map(node => node.characters)).toEqual([
    ...valid, ...valid, ...valid.slice(0, 2),
  ]);

  await host.panel.getByRole('checkbox', { name: '随机填充' }).check();
  await button.click();
  await expect.poll(() => host.writes.length).toBe(16);
  await expect(button).toBeEnabled();
  const values = host.nodes.map(node => node.characters);
  expect(values.slice(0, 3).sort()).toEqual([...valid].sort());
  expect(values.slice(3, 6).sort()).toEqual([...valid].sort());
  expect(values.slice(6).every(value => valid.includes(value))).toBe(true);
  expect(new Set(values.slice(6)).size).toBe(2);
  await expect(host.panel.locator('.plugin-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(host.panel.locator('.loading-dots')).toHaveCount(0);
  await expect(host.panel.getByRole('status')).toHaveCount(0);
  await host.panel.getByRole('tab', { name: '快速填充' }).click();
  await expect(host.panel.locator('.execute:enabled')).toHaveCount(13);
  await host.flush();
  expect(host.messages.filter(message => message.type === 'fill-result')).toMatchObject([
    { updated: 8, skipped: 0 }, { updated: 8, skipped: 0 },
  ]);
  expect(host.notifications).toEqual(['已填充 8 个文本', '已填充 8 个文本']);
  expect(host.pageErrors).toEqual([]);
});

test('shipped plugin unlocks after empty selection and missing fonts, then fills again', async ({ page }) => {
  const host = await openBundledPlugin(page, 'self');
  const button = host.panel.getByRole('button', { name: '填充姓名', exact: true });
  host.api.currentPage.selection = [];
  await button.click();
  await expect(host.panel.getByRole('status')).toContainText('请先选择');
  await expect(host.panel.locator('.execute:enabled')).toHaveCount(13);

  host.api.currentPage.selection = [host.node];
  host.node.hasMissingFont = true;
  await button.click();
  await expect(host.panel.getByRole('status')).toContainText('缺少可用字体');
  await expect(host.panel.locator('.execute:enabled')).toHaveCount(13);

  host.node.hasMissingFont = false;
  await button.click();
  await expect.poll(() => host.writes.length).toBe(1);
  await expect(host.panel.locator('.execute:enabled')).toHaveCount(13);
  await expect(host.panel.locator('.loading-dots')).toHaveCount(0);
  await expect(host.panel.getByRole('status')).toHaveCount(0);
  await host.flush();
  expect(host.pageErrors).toEqual([]);
});
