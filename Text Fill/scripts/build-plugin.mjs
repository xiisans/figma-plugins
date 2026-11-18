import { build } from 'esbuild';

export const pluginBuildOptions = {
  entryPoints: ['src/plugin/main.ts'],
  outfile: 'dist/code.js',
  bundle: true,
  format: 'iife',
  target: 'es2017',
  minify: true,
  legalComments: 'none',
};

if (process.argv[1]?.endsWith('build-plugin.mjs')) {
  await build(pluginBuildOptions);
}
