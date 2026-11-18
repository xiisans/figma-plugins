import { expect, test } from '@playwright/test';

test('matches panel dimensions, has all fill types and no horizontal overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.fill-row')).toHaveCount(13);
  expect(await page.locator('.plugin-panel').boundingBox()).toMatchObject({ width: 360, height: 440 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.screenshot({ path: 'test-results/quick-light.png' });
  expect(errors).toEqual([]);
});

test('edits quick parameters, generates results and reports invalid ranges', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('[data-kind="number"]');
  await row.hover();
  await expect(page.getByLabel('数字最小', { exact: true })).toBeVisible();
  await expect(page.getByLabel('数字最小', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('数字最大', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('数字小数', { exact: true })).toHaveValue('0');
  await page.getByLabel('数字最小', { exact: true }).fill('10');
  await page.getByLabel('数字最大', { exact: true }).fill('20');
  await page.getByLabel('数字小数', { exact: true }).fill('2');
  await page.getByRole('button', { name: '填充数字', exact: true }).click();
  await expect(page.locator('.plugin-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await page.evaluate(() => window.__TEXT_FILL_PREVIEW__?.values.every(value => Number(value) >= 10 && Number(value) <= 20 && /^\d+\.\d{2}$/.test(value)))).toBe(true);
  await row.hover();
  await page.getByLabel('数字最大', { exact: true }).fill('5');
  await page.getByRole('button', { name: '填充数字', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('最大值必须大于最小值');
});

test('custom input filters blanks, cycles in order or randomly and retains state across tabs', async ({ page }) => {
  await page.goto('/'); await page.getByRole('tab', { name: '自定义填充' }).click();
  await expect(page.getByRole('button', { name: '确定', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '自定义文本' }).fill('  first  \n\nsecond\n  \nthird');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.getByRole('button', { name: '确定', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.__TEXT_FILL_PREVIEW__?.values)).toEqual([
    '  first  ', 'second', 'third', '  first  ', 'second', 'third', '  first  ', 'second',
  ]);
  await page.getByRole('checkbox', { name: '随机填充' }).check();
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await expect(page.getByRole('button', { name: '确定', exact: true })).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  const values = await page.evaluate(() => window.__TEXT_FILL_PREVIEW__!.values);
  const valid = ['  first  ', 'second', 'third'];
  expect(values).toHaveLength(8);
  expect(values.slice(0, 3).sort()).toEqual([...valid].sort());
  expect(values.slice(3, 6).sort()).toEqual([...valid].sort());
  expect(values.slice(6).every(value => valid.includes(value))).toBe(true);
  expect(new Set(values.slice(6)).size).toBe(2);
  await page.getByRole('tab', { name: '快速填充' }).click();
  await page.getByRole('tab', { name: '自定义填充' }).click();
  await expect(page.getByRole('textbox', { name: '自定义文本' })).toHaveValue('  first  \n\nsecond\n  \nthird');
  await expect(page.getByRole('checkbox', { name: '随机填充' })).toBeChecked();
  await page.screenshot({ path: 'test-results/custom-light.png' });
});

test('switches segmented modes with keyboard and animates selected background', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-kind="date"]').hover();
  const format = page.getByRole('radiogroup', { name: '日期格式' });
  await format.getByRole('radio', { name: '-', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(format.getByRole('radio', { name: '/', exact: true })).toBeChecked();
  await expect(format.locator('.segment-indicator')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 14, 0)');
  await page.getByRole('button', { name: '填充日期', exact: true }).click();
  await expect(page.locator('.plugin-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await page.evaluate(() => window.__TEXT_FILL_PREVIEW__?.values.every(value => /^\d{4}\/\d{2}\/\d{2}$/.test(value)))).toBe(true);
});

test('handles system theme and explicit Figma theme classes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/');
  await expect(page.locator('.plugin-panel')).toHaveCSS('background-color', 'rgb(44, 44, 44)');
  await page.screenshot({ path: 'test-results/quick-dark.png' });
  await page.evaluate(() => document.documentElement.classList.add('figma-light'));
  await expect(page.locator('.plugin-panel')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.evaluate(() => { document.documentElement.classList.remove('figma-light'); document.documentElement.classList.add('figma-dark'); });
  await page.getByRole('tab', { name: '自定义填充' }).click();
  await page.getByRole('textbox', { name: '自定义文本' }).fill('设计让信息更清晰\n记录每一个想法\n把灵感变成现实');
  await page.screenshot({ path: 'test-results/custom-dark.png' });
});

test('parameters stay within their row and the panel fits smaller and larger viewports', async ({ page }) => {
  for (const width of [360, 320, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 440 }); await page.goto('/');
    for (const kind of ['number', 'sequence', 'date', 'time', 'phone', 'age', 'paragraph']) {
      const row = page.locator(`[data-kind="${kind}"]`); await row.hover();
      const rowBox = (await row.boundingBox())!;
      const buttonBox = (await row.locator('.execute').boundingBox())!;
      const last = (await row.locator('.parameters > :last-child').boundingBox())!;
      expect(last.x + last.width, `${width}px ${kind}`).toBeLessThanOrEqual(buttonBox.x - 4);
      expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(Math.min(width, 360));
    }
    await page.screenshot({ path: `test-results/viewport-${width}.png` });
  }
});

test('number and paragraph parameter groups keep a 16px content gap', async ({ page }) => {
  for (const width of [360, 320]) {
    await page.setViewportSize({ width, height: 440 });
    await page.goto('/');
    for (const kind of ['number', 'paragraph']) {
      const row = page.locator(`[data-kind="${kind}"]`);
      await row.hover();
      const gaps = await row.locator('.parameters').evaluate(parameters => {
        const groups = Array.from(parameters.children);
        return groups.slice(1).map((group, index) => {
          const previous = groups[index].lastElementChild!.getBoundingClientRect();
          const label = group.firstElementChild!.getBoundingClientRect();
          return label.left - previous.right;
        });
      });
      for (const gap of gaps) expect(gap, `${width}px ${kind}`).toBeCloseTo(16, 1);
      if (width === 360) await page.screenshot({ path: `test-results/${kind}-spacing.png` });
    }
  }
});

test('matches Figma option row height, padding and centered contents', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.mouse.move(0, 0);
    expect(await page.locator('.fill-grid').boundingBox()).toMatchObject({ x: 16, y: 56, width: 328, height: 368 });
    const rows = page.locator('.fill-row');
    for (const row of await rows.all()) {
      await expect(row).toHaveCSS('padding', '8px 10px');
      const box = (await row.boundingBox())!;
      const name = (await row.locator('.fill-name').boundingBox())!;
      const icon = (await row.locator('.execute svg').boundingBox())!;
      expect(box.height).toBeCloseTo(33.2, 1);
      expect(name.x - box.x).toBe(10);
      expect(box.x + box.width - icon.x - icon.width).toBe(10);
      expect(icon.y + icon.height / 2).toBeCloseTo(box.y + box.height / 2, 1);
    }
    const first = (await rows.nth(0).boundingBox())!;
    const secondLine = (await rows.nth(2).boundingBox())!;
    const last = (await rows.last().boundingBox())!;
    expect(secondLine.y - first.y - first.height).toBeCloseTo(4, 1);
    expect(last.y + last.height).toBeCloseTo(424, 1);
    await page.screenshot({ path: `test-results/quick-geometry-${colorScheme}.png` });

    for (const kind of ['number', 'sequence', 'date', 'time', 'phone', 'age', 'paragraph']) {
      const row = page.locator(`[data-kind="${kind}"]`);
      await row.hover();
      const box = (await row.boundingBox())!;
      const parameters = (await row.locator('.parameters').boundingBox())!;
      expect(parameters.x - box.x).toBe(58);
      expect(parameters.y + parameters.height / 2).toBeCloseTo(box.y + box.height / 2, 1);
    }
  }
});
