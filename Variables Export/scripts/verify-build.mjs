import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const scriptClosings = html.match(/<\/script>/gi) ?? [];
const styleClosings = html.match(/<\/style>/gi) ?? [];

if (scriptClosings.length !== 1 || styleClosings.length !== 1) {
  throw new Error(`Invalid single-file HTML: found ${scriptClosings.length} script and ${styleClosings.length} style closing tags.`);
}
const htmlShell = html
  .replace(/(<script\b[^>]*>)[\s\S]*<\/script>/i, "$1</script>")
  .replace(/(<style\b[^>]*>)[\s\S]*<\/style>/i, "$1</style>");
if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel=["']stylesheet["']/i.test(htmlShell)) {
  throw new Error("Invalid single-file HTML: external script or stylesheet reference remains.");
}
if (!html.includes('<div id="root"></div>')) {
  throw new Error("Invalid single-file HTML: root mount element is missing.");
}

const scriptBody = html.match(/<script\b[^>]*>([\s\S]*)<\/script>/i)?.[1];
if (!scriptBody) throw new Error("Invalid single-file HTML: inline script body is missing.");
try {
  new Function(scriptBody);
} catch (error) {
  throw new Error(`Invalid single-file HTML: inline script does not parse (${error.message}).`);
}

console.log("Verified single-file Figma UI bundle.");
