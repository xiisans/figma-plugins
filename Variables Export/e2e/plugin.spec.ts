import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("initial state matches the fixed plugin viewport", async ({ page }) => {
  await page.goto("/?state=initial");
  await expect(page.locator(".plugin-shell")).toHaveCSS("width", "600px");
  await expect(page.locator(".collections-panel")).toHaveCSS("width", "200px");
  await expect(page.locator(".preview-panel")).toHaveCSS("width", "400px");
  await expect(page.getByRole("checkbox", { name: "全选" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "加载所选变量" })).toBeDisabled();
  await expect(page.getByText("请选择变量，并点击“+”进行加载")).toBeVisible();
  await expect(page).toHaveScreenshot("initial-dark.png");
});

test("loaded, hover, dropdown, and unchecked states remain stable", async ({ page }) => {
  await page.goto("/?state=loaded");
  await expect(page.locator(".code-preview")).toBeVisible();
  await page.locator(".collection-row").nth(1).hover();
  await expect(page).toHaveScreenshot("loaded-hover-dark.png");

  await page.goto("/?state=dropdown");
  const colorListbox = page.getByRole("listbox", { name: "颜色格式" });
  await expect(colorListbox).toBeVisible();
  await expect(colorListbox).toHaveCSS("top", "40px");
  const colorTrigger = page.getByRole("button", { name: /Hex/ });
  await colorTrigger.hover();
  await expect(colorTrigger).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.4)");
  const selectedColorOption = page.getByRole("option", { name: "Hex" });
  await expect(selectedColorOption).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.4)");
  await page.getByRole("option", { name: "RGB(A)" }).hover();
  await expect(page.getByRole("option", { name: "RGB(A)" })).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.4)");
  await expect(page).toHaveScreenshot("dropdown-dark.png");
  await page.locator(".preview-body").click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole("listbox", { name: "颜色格式" })).toBeHidden();

  await page.goto("/?state=loaded");
  await expect(page.locator(".code-preview")).toContainText("#4567FFFF");
  await page.getByRole("button", { name: /Hex/ }).click();
  await page.getByRole("option", { name: "RGB(A)" }).click();
  await expect(page.locator(".code-preview")).toContainText("rgb(69, 103, 255)");

  await page.goto("/?state=dropdown&theme=light");
  await expect(page.getByRole("listbox", { name: "颜色格式" })).toHaveCSS("background-color", "rgb(242, 242, 242)");
  await expect(page).toHaveScreenshot("dropdown-light.png");

  await page.goto("/?state=unchecked&theme=light");
  await expect(page.getByRole("button", { name: "加载所选变量" })).toBeDisabled();
  await expect(page).toHaveScreenshot("unchecked-light.png");
});

test("the production single-file bundle executes instead of rendering source text", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  await page.setContent(html, { waitUntil: "load" });

  await expect(page.locator(".plugin-shell")).toHaveCSS("width", "600px");
  await expect(page.getByText("正在读取变量…")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
