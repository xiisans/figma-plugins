import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { join } from 'node:path';

const pluginCode = await readFile(join(process.cwd(), 'code-adaptive.js'), 'utf8');

function attach(parent, child, index = parent.children.length) {
  if (child.parent && Array.isArray(child.parent.children)) {
    const oldIndex = child.parent.children.indexOf(child);
    if (oldIndex >= 0) child.parent.children.splice(oldIndex, 1);
  }
  parent.children.splice(index, 0, child);
  child.parent = parent;
}

function makeContainer(type = 'FRAME', name = type) {
  return {
    type, name, parent: null, children: [], locked: false,
    x: 0, y: 0, width: 100, height: 40, rotation: 0,
    layoutMode: 'NONE', layoutAlign: 'INHERIT', layoutGrow: 0,
    layoutPositioning: 'AUTO', layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED',
    fills: [{ type: 'SOLID' }], clipsContent: true,
    appendChild(child) { attach(this, child); },
    insertChild(index, child) { attach(this, child, index); },
    resize(width, height) { this.width = width; this.height = height; },
    remove() {
      if (!this.parent) return;
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
      this.parent = null;
    }
  };
}

function makeLeaf(type = 'RECTANGLE', name = type) {
  return {
    type, name, parent: null, locked: false,
    x: 12, y: 24, width: 100, height: 40, rotation: 15,
    layoutAlign: 'INHERIT', layoutGrow: 0, layoutPositioning: 'AUTO',
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED'
  };
}

function boot(selection) {
  const page = makeContainer('PAGE', 'Page 1');
  selection.forEach((node) => attach(page, node));
  let frameCounter = 0;
  const posted = [];
  const currentPage = {
    _selection: selection,
    get selection() { return this._selection; },
    set selection(value) { this._selection = value; }
  };
  const figma = {
    currentPage,
    ui: { onmessage: null, postMessage(message) { posted.push(message); } },
    showUI() {},
    createFrame() { return makeContainer('FRAME', 'Frame ' + (++frameCounter)); },
    commitUndo() { this.undoCommits = (this.undoCommits || 0) + 1; }
  };
  vm.runInNewContext(pluginCode, { figma, __html__: '' });
  return { figma, page, posted };
}

const values = { top: 10, right: 20, bottom: 30, left: 40, gap: 8 };

{
  const frame = makeContainer('FRAME', 'Existing');
  frame.layoutMode = 'HORIZONTAL';
  const { figma, posted } = boot([frame]);
  figma.ui.onmessage({ type: 'apply', values });
  assert.equal(frame.paddingTop, 10);
  assert.equal(frame.layoutMode, 'HORIZONTAL');
  assert.equal(frame.itemSpacing, 8);
  assert.equal(frame.layoutSizingHorizontal, 'HUG');
  assert.equal(frame.layoutSizingVertical, 'HUG');
  assert.equal(posted.at(-1).type, 'complete');
}

{
  const rect = makeLeaf('RECTANGLE', 'Card');
  const { figma, page, posted } = boot([rect]);
  figma.ui.onmessage({ type: 'apply', values });
  const wrapper = page.children[0];
  assert.equal(wrapper.type, 'FRAME');
  assert.equal(wrapper.fills.length, 0);
  assert.equal(wrapper.width, 160);
  assert.equal(wrapper.height, 80);
  assert.equal(wrapper.x, -28);
  assert.equal(wrapper.y, 14);
  assert.equal(wrapper.rotation, 0);
  assert.equal(wrapper.layoutSizingHorizontal, 'HUG');
  assert.equal(wrapper.layoutSizingVertical, 'HUG');
  assert.equal(rect.rotation, 15);
  assert.equal(rect.parent, wrapper);
  assert.equal(figma.currentPage.selection[0], wrapper);
  assert.equal(posted.at(-1).type, 'complete');
  assert.equal(figma.undoCommits, 1);
}

{
  const locked = makeLeaf('TEXT', 'Locked');
  locked.locked = true;
  const { figma, posted } = boot([locked]);
  figma.ui.onmessage({ type: 'apply', values });
  assert.equal(figma.currentPage.selection[0], locked);
  assert.equal(posted.at(-1).summary.skipped, 1);
}

{
  const instance = makeContainer('INSTANCE', 'Button instance');
  const { figma, posted } = boot([instance]);
  figma.ui.onmessage({ type: 'apply', values });
  assert.equal(figma.currentPage.selection[0], instance);
  assert.equal(posted.at(-1).summary.skipped, 1);
}

{
  const { figma, posted } = boot([]);
  figma.ui.onmessage({ type: 'apply', values });
  assert.equal(posted.at(-1).summary.total, 0);
}

console.log('Smoke tests passed.');
