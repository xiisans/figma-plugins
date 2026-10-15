import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
await copyFile(join(root, '.build', 'code.js'), join(root, 'code-adaptive.js'));

const results = await Promise.all([
  readFile(join(root, 'ui.html'), 'utf8'),
  readFile(join(root, 'ui.css'), 'utf8'),
  readFile(join(root, 'ui.js'), 'utf8')
]);
const html = results[0];
const css = results[1];
const js = results[2];

const bundledHtml = html
  .replace(/\s*<link rel="stylesheet" href="ui\.css" \/>/, '\n    <style>\n' + css + '\n    </style>')
  .replace(/\s*<script src="ui\.js"><\/script>/, '\n    <script>\n' + js + '\n    </script>');
await writeFile(join(root, 'ui-adaptive.html'), bundledHtml, 'utf8');
