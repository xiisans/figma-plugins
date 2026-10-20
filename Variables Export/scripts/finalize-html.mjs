import { readFile, writeFile } from "node:fs/promises";

const htmlPath = new URL("../dist/index.html", import.meta.url);
let html = await readFile(htmlPath, "utf8");

function escapeEmbeddedClosingTags(source, tagName) {
  const closingTag = `</${tagName}>`;
  const finalClosingIndex = source.toLocaleLowerCase("en-US").lastIndexOf(closingTag);
  if (finalClosingIndex < 0) throw new Error(`Missing closing ${tagName} tag in built HTML.`);

  const beforeFinalClosing = source.slice(0, finalClosingIndex).replace(
    new RegExp(`</${tagName}`, "gi"),
    `<\\/${tagName}`,
  );
  return beforeFinalClosing + source.slice(finalClosingIndex);
}

html = escapeEmbeddedClosingTags(html, "script");
html = escapeEmbeddedClosingTags(html, "style");
await writeFile(htmlPath, html, "utf8");
