import { describe, expect, it, vi } from 'vitest';
import { applyFill, type FillHost } from '../src/plugin/fill';
import { collectTextNodes, sortByPosition } from '../src/plugin/selection';

const font = { family: 'Inter', style: 'Regular' };
function text(id: string, x = 0, y = 0, extras: Record<string, unknown> = {}): TextNode {
  return {
    id, type: 'TEXT', characters: `original-${id}`, removed: false, locked: false, parent: null,
    absoluteBoundingBox: { x, y, width: 30, height: 12 }, absoluteTransform: [[1, 0, x], [0, 1, y]],
    fontName: font, hasMissingFont: false, getRangeAllFontNames: () => [font], ...extras,
  } as unknown as TextNode;
}
function group(id: string, children: SceneNode[], locked = false): SceneNode {
  const node = { id, type: 'FRAME', children, locked, removed: false, parent: null } as unknown as FrameNode;
  children.forEach(child => Object.defineProperty(child, 'parent', { value: node, configurable: true }));
  return node;
}
const host = (): FillHost => ({ mixed: Symbol('mixed'), loadFontAsync: vi.fn(async () => {}) });
const custom = (lines: string[], random = false) => ({ type: 'apply-custom-fill', requestId: 'test', lines, random });

describe('selection collection and visual order', () => {
  it('recurses through frames and instances and deduplicates overlapping selections', () => {
    const first = text('a'); const second = text('b');
    const instance = group('instance', [second]); Object.assign(instance, { type: 'INSTANCE' });
    const root = group('root', [first, instance]);
    expect(collectTextNodes([first, root, instance])).toEqual([first, second]);
  });
  it('ignores non-text and removed nodes', () => {
    expect(collectTextNodes([group('root', [text('a', 0, 0, { removed: true }), { id: 'r', type: 'RECTANGLE' } as SceneNode])])).toEqual([]);
  });
  it('orders top to bottom and left to right with a four-pixel row tolerance', () => {
    const right = text('right', 100, 0); const left = text('left', 0, 3); const below = text('below', 0, 30);
    expect(sortByPosition([below, right, left]).map(node => node.id)).toEqual(['left', 'right', 'below']);
  });
  it('uses absolute coordinates and stable tie breaking', () => {
    expect(sortByPosition([text('b', 0, 20), text('a', 0, 0, { absoluteBoundingBox: null }), text('c', 0, 0)]).map(node => node.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('safe text replacement', () => {
  it('cycles custom lines across every node in visual order and caches fonts', async () => {
    const nodes = [text('bottom', 0, 30), text('left'), text('right', 100)]; const api = host();
    const result = await applyFill(api, nodes, custom(['first', 'second']));
    expect(result).toEqual({ type: 'fill-result', requestId: 'test', updated: 3, skipped: 0 });
    expect(nodes.map(node => node.characters)).toEqual(['first', 'first', 'second']);
    expect(api.loadFontAsync).toHaveBeenCalledTimes(1);
    expect(nodes[1].fontName).toEqual(font);
  });
  it('loads every mixed font before writing', async () => {
    const api = host(); const bold = { family: 'Inter', style: 'Bold' };
    const node = text('a', 0, 0, { fontName: api.mixed, getRangeAllFontNames: () => [font, bold] });
    await applyFill(api, [node], custom(['new']));
    expect(api.loadFontAsync).toHaveBeenCalledWith(font);
    expect(api.loadFontAsync).toHaveBeenCalledWith(bold);
    expect(node.characters).toBe('new');
  });
  it('loads the font of empty text', async () => {
    const api = host(); const node = text('a', 0, 0, { characters: '' });
    expect((await applyFill(api, [node], custom(['new']))).updated).toBe(1);
    expect(api.loadFontAsync).toHaveBeenCalledWith(font);
  });
  it('waits for fonts and reports failures without replacing originals', async () => {
    const api = host(); api.loadFontAsync = vi.fn(async () => { throw new Error('unavailable'); });
    const node = text('a'); const result = await applyFill(api, [node], custom(['new']));
    expect(result.updated).toBe(0); expect(result.skipped).toBe(1); expect(result.error).toBeTruthy();
    expect(node.characters).toBe('original-a');
  });
  it('continues after a missing font or read-only instance child fails', async () => {
    const missing = text('missing', 0, 0, { hasMissingFont: true });
    const readOnly = text('readonly', 0, 20);
    Object.defineProperty(readOnly, 'characters', { get: () => 'old', set: () => { throw new Error('read only'); } });
    const good = text('good', 0, 40);
    const result = await applyFill(host(), [missing, readOnly, good], custom(['a', 'b', 'c']));
    expect(result.updated).toBe(1); expect(result.skipped).toBe(2); expect(good.characters).toBe('c');
  });
  it('skips locked ancestors without shifting line assignments', async () => {
    const locked = text('locked'); const good = text('good', 0, 30);
    const result = await applyFill(host(), [group('root', [locked], true), good], custom(['a', 'b']));
    expect(result.skipped).toBe(1); expect(locked.characters).toBe('original-locked'); expect(good.characters).toBe('b');
  });
  it('does not modify a node removed while loading fonts', async () => {
    const node = text('a'); const api = host();
    api.loadFontAsync = async () => { Object.assign(node, { removed: true }); };
    expect((await applyFill(api, [node], custom(['new']))).skipped).toBe(1);
    expect(node.characters).toBe('original-a');
  });
  it('handles no selection, invalid parameters and blank custom input', async () => {
    expect((await applyFill(host(), [], custom(['a']))).error).toContain('选择');
    expect((await applyFill(host(), [text('a')], custom(['   ']))).error).toContain('非空');
    expect((await applyFill(host(), [text('a')], { type: 'apply-quick-fill', requestId: 'test', kind: 'number', config: { min: 10, max: 1, decimals: 0 } })).error).toBeTruthy();
  });
  it('fills every target with quick data and ignores excess custom input', async () => {
    const nodes = [text('a'), text('b', 0, 20)];
    expect((await applyFill(host(), nodes, { type: 'apply-quick-fill', requestId: 'test', kind: 'sequence', config: { start: 1, step: 1, padding: 0, order: 'asc' } })).updated).toBe(2);
    expect(nodes.map(node => node.characters)).toEqual(['1', '2']);
    await applyFill(host(), nodes, custom(['one', 'two', 'three']));
    expect(nodes.map(node => node.characters)).toEqual(['one', 'two']);
  });
  it('reshuffles and reuses valid custom lines until all targets are filled', async () => {
    const nodes = [text('a'), text('b', 0, 20), text('c', 0, 40)];
    const result = await applyFill(host(), nodes, custom(['a', '', 'b'], true), { random: () => 0 });
    expect(result.updated).toBe(3); expect(nodes.map(node => node.characters)).toEqual(['b', 'a', 'b']);
  });
});
