import { build } from 'vite';
import { context } from 'esbuild';
import { pluginBuildOptions } from './build-plugin.mjs';

await build({ build: { watch: {}, emptyOutDir: false } });
const plugin = await context(pluginBuildOptions);
await plugin.watch();
console.log('Watching UI and plugin. Reopen the development plugin in Figma after changes.');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await plugin.dispose(); process.exit(0); });
}
