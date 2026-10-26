import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function loadFixture(page: Page, query: string) {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  await page.route('http://plugin.local/**', async (route) => {
    await route.fulfill({ body: html, contentType: 'text/html' });
  });
  await page.goto(`http://plugin.local/${query}`);
}

test('light empty state matches the fixed plugin viewport', async ({ page }) => {
  await loadFixture(page, '?state=empty&theme=light');
  await expect(page.locator('.plugin-shell')).toHaveCSS('width', '600px');
  await expect(page.locator('.settings-panel')).toHaveCSS('width', '200px');
  await expect(page.locator('.preview-panel')).toHaveCSS('width', '400px');
  await expect(page.getByText('请选择要添加颜色梯度的色板')).toBeVisible();
  await expect(page.getByRole('button', { name: '目标居中' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: '生成方式' }).getByRole('button')).toHaveText(['生成画板', '生成变量']);
  await expect(page.getByRole('button', { name: '生成画板' }).last()).toBeDisabled();
  await expect(page).toHaveScreenshot('light-empty.png');
});

test('solid 20-step preview and collection menu remain stable', async ({ page }) => {
  await loadFixture(page, '?state=filled&steps=20&output=variables&dropdown=collection&theme=light');
  await expect(page.locator('.gradient-row')).toHaveCount(20);
  await expect(page.locator('.gradient-row__model').first()).toHaveCSS('width', '120px');
  await expect(page.locator('.gradient-row__model').first()).toHaveCSS('text-overflow', 'clip');
  await expect(page.getByRole('listbox', { name: '集合列表' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'color' })).toBeVisible();
  await expect(page).toHaveScreenshot('light-solid-20-dropdown.png');

  await page.getByRole('button', { name: 'HSL' }).click();
  const allHslValuesFit = await page.locator('.gradient-row__model').evaluateAll((elements) =>
    elements.every((element) => element.scrollWidth <= element.clientWidth),
  );
  expect(allHslValuesFit).toBe(true);
});

test('dark alpha preview uses the exact opacity sequence', async ({ page }) => {
  await loadFixture(page, '?state=filled&mode=alpha&theme=dark');
  await expect(page.getByRole('tab', { name: '透明梯度' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.gradient-row__alpha').first()).toHaveText('10%');
  await expect(page.locator('.gradient-row__alpha').last()).toHaveText('100%');
  await expect(page).toHaveScreenshot('dark-alpha.png');
});

test('board output removes variable controls and supports interaction changes', async ({ page }) => {
  await loadFixture(page, '?state=filled&output=board&steps=20&theme=dark');
  await expect(page.getByRole('textbox', { name: '集合' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '生成画板' }).last()).toBeEnabled();
  await expect(page.locator('.gradient-row')).toHaveCount(20);
  await expect(page).toHaveScreenshot('dark-board-20.png');

  await page.getByRole('tab', { name: '透明梯度' }).click();
  await page.getByRole('button', { name: '10步' }).click();
  await page.getByRole('button', { name: '生成变量' }).first().click();
  await expect(page.locator('.gradient-row')).toHaveCount(10);
  await expect(page.getByRole('textbox', { name: '集合' })).toBeVisible();
  await expect(page.locator('.settings-panel')).toHaveCSS('width', '200px');
});
