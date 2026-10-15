import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const production = process.argv.includes("--production");

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  format: "iife",
  platform: "browser",
  target: "es2017",
  minify: production,
  sourcemap: production ? false : "inline"
});

const uiBundle = await build({
  entryPoints: ["src/ui.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2017",
  minify: production
});

const [template, styles] = await Promise.all([
  readFile("src/ui.html", "utf8"),
  readFile("src/ui.css", "utf8")
]);

const script = uiBundle.outputFiles[0].text;
const html = template
  .replace("/*__STYLES__*/", styles)
  .replace("/*__SCRIPT__*/", script);

await writeFile("dist/ui.html", html, "utf8");
console.log("Built dist/code.js and dist/ui.html");
