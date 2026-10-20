import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

function inlineBuildAssets(): Plugin {
  return {
    name: "inline-build-assets",
    enforce: "post",
    generateBundle(_options, bundle) {
      const htmlAsset = bundle["index.html"];
      if (!htmlAsset || htmlAsset.type !== "asset" || typeof htmlAsset.source !== "string") return;
      let html = htmlAsset.source;

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk" && output.isEntry) {
          const script = output.code.replace(/<\/script/gi, "<\\/script");
          html = html.replace(
            new RegExp(`<script([^>]*?)src=["']/[^"']*${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']([^>]*)></script>`),
            (_match, before: string, after: string) => `<script${before}${after}>${script}</script>`,
          );
          delete bundle[fileName];
        } else if (output.type === "asset" && fileName.endsWith(".css")) {
          const style = String(output.source).replace(/<\/style/gi, "<\\/style");
          html = html.replace(
            new RegExp(`<link([^>]*?)href=["']/[^"']*${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']([^>]*)>`),
            () => `<style>${style}</style>`,
          );
          delete bundle[fileName];
        }
      }
      htmlAsset.source = html;
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineBuildAssets()],
  build: {
    target: "es2020",
    assetsInlineLimit: 100000,
    cssCodeSplit: false,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
