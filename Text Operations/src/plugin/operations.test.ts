import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceText, splitText } from './operations';

interface TextNodeOptions {
  id?: string;
  characters?: string;
  missingFont?: boolean;
  parent?: BaseNode | null;
}

function textNode({ id = 'text-1', characters = '原文本', missingFont = false, parent = null }: TextNodeOptions = {}) {
  let node: TextNode;
  const remove = vi.fn(() => {
    Object.assign(node, { removed: true });
  });
  const clone = vi.fn(() => textNode({ id: `${id}-clone`, characters, parent }).node);
  node = {
    id,
    type: 'TEXT',
    name: '原图层名',
    characters,
    removed: false,
    hasMissingFont: missingFont,
    parent,
    absoluteBoundingBox: { x: 10, y: 20, width: 30, height: 10 },
    absoluteTransform: [
      [1, 0, 10],
      [0, 1, 20],
    ],
    width: 30,
    height: 10,
    fontName: { family: 'Inter', style: 'Regular' },
    getRangeAllFontNames: vi.fn(() => [{ family: 'Inter', style: 'Regular' }]),
    deleteCharacters: vi.fn((start: number, end: number) => {
      node.characters = `${node.characters.slice(0, start)}${node.characters.slice(end)}`;
    }),
    insertCharacters: vi.fn((start: number, value: string) => {
      node.characters = `${node.characters.slice(0, start)}${value}${node.characters.slice(start)}`;
    }),
    clone,
    remove,
  } as unknown as TextNode;
  return { node, clone, remove };
}

function childContainer<T extends 'FRAME' | 'COMPONENT'>(id: string, type: T, layoutMode: AutoLayoutMixin['layoutMode']) {
  const children: SceneNode[] = [];
  const container = {
    id,
    type,
    parent: null,
    children,
    layoutMode,
    itemSpacing: 0,
    appendChild: vi.fn((node: SceneNode) => {
      Object.assign(node, { parent: container });
      children.push(node);
    }),
  } as unknown as T extends 'FRAME' ? FrameNode : ComponentNode;
  return container;
}

function generatedFrame(page: PageNode) {
  const frame = childContainer('generated-frame', 'FRAME', 'NONE') as FrameNode;
  Object.assign(frame, {
    parent: page,
    removed: false,
    remove: vi.fn(() => Object.assign(frame, { removed: true })),
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  let layoutPositioning: AutoLayoutChildrenMixin['layoutPositioning'] = 'AUTO';
  Object.defineProperty(frame, 'layoutPositioning', {
    get: () => layoutPositioning,
    set: (value: AutoLayoutChildrenMixin['layoutPositioning']) => {
      const parent = frame.parent as (BaseNode & Partial<AutoLayoutMixin>) | null;
      if (value === 'ABSOLUTE' && (!parent || !parent.layoutMode || parent.layoutMode === 'NONE')) {
        throw new Error('Can only set layoutPositioning = ABSOLUTE if the parent node has layoutMode !== NONE');
      }
      layoutPositioning = value;
    },
  });
  return frame;
}

function installFigma(selection: readonly SceneNode[]) {
  const commitUndo = vi.fn();
  const loadFontAsync = vi.fn(async () => undefined);
  const currentPage = {
    id: 'page',
    type: 'PAGE',
    parent: null,
    selection,
    appendChild: vi.fn((node: SceneNode) => Object.assign(node, { parent: currentPage })),
  } as unknown as PageNode;
  const createFrame = vi.fn(() => generatedFrame(currentPage));
  vi.stubGlobal('figma', {
    currentPage,
    mixed: Symbol('mixed'),
    loadFontAsync,
    commitUndo,
    createFrame,
  });
  return { commitUndo, currentPage, loadFontAsync, createFrame };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Figma operation preflight', () => {
  it('does not mutate or commit when a replacement target has a missing font', async () => {
    const { node } = textNode({ missingFont: true });
    const figmaMock = installFigma([node]);

    await expect(
      replaceText({
        type: 'replace',
        requestId: 'replace-1',
        find: '原',
        replacement: '新',
        syncLayerName: true,
      }),
    ).rejects.toThrow('缺失字体');

    expect(node.characters).toBe('原文本');
    expect(figmaMock.loadFontAsync).not.toHaveBeenCalled();
    expect(figmaMock.commitUndo).not.toHaveBeenCalled();
  });

  it('rejects instance descendants before creating a split frame or deleting text', async () => {
    const page = { id: 'page', type: 'PAGE', parent: null } as unknown as PageNode;
    const instance = { id: 'instance', type: 'INSTANCE', parent: page } as unknown as InstanceNode;
    const { node, remove } = textNode({ characters: '甲，乙', parent: instance });
    const figmaMock = installFigma([node]);

    await expect(
      splitText({
        type: 'split',
        requestId: 'split-1',
        delimiter: 'comma',
        keepDelimiter: false,
        direction: 'vertical',
        spacing: 4,
      }),
    ).rejects.toThrow('实例内文本无法拆分');

    expect(figmaMock.createFrame).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(figmaMock.commitUndo).not.toHaveBeenCalled();
  });

  it('uses the nearest shared frame as the auto-layout split container', async () => {
    const frame = childContainer('shared-frame', 'FRAME', 'NONE') as FrameNode;
    const first = textNode({ id: 'first', characters: '甲，乙', parent: frame });
    const second = textNode({ id: 'second', characters: '丙，丁', parent: frame });
    const figmaMock = installFigma([first.node, second.node]);
    Object.assign(frame, { parent: figmaMock.currentPage });

    await splitText({
      type: 'split',
      requestId: 'split-shared-frame',
      delimiter: 'comma',
      keepDelimiter: false,
      direction: 'horizontal',
      spacing: 12,
    });

    expect(figmaMock.createFrame).not.toHaveBeenCalled();
    expect(frame.layoutMode).toBe('HORIZONTAL');
    expect(frame.itemSpacing).toBe(12);
    expect(frame.appendChild).toHaveBeenCalledTimes(4);
    expect(first.remove).toHaveBeenCalledOnce();
    expect(second.remove).toHaveBeenCalledOnce();
    expect(figmaMock.currentPage.selection).toEqual([frame]);
    expect(figmaMock.commitUndo).toHaveBeenCalledOnce();
  });

  it('appends a generated frame before making it absolute in an auto-layout parent', async () => {
    const component = childContainer('shared-component', 'COMPONENT', 'VERTICAL') as ComponentNode;
    const first = textNode({ id: 'first', characters: '甲，乙', parent: component });
    const second = textNode({ id: 'second', characters: '丙，丁', parent: component });
    const figmaMock = installFigma([first.node, second.node]);
    Object.assign(component, { parent: figmaMock.currentPage });

    await expect(
      splitText({
        type: 'split',
        requestId: 'split-generated-frame',
        delimiter: 'comma',
        keepDelimiter: false,
        direction: 'vertical',
        spacing: 4,
      }),
    ).resolves.toEqual({ message: '已拆分为 4 个文本图层' });

    const frame = figmaMock.createFrame.mock.results[0].value;
    expect(component.appendChild).toHaveBeenCalledWith(frame);
    expect(frame.parent).toBe(component);
    expect(frame.layoutPositioning).toBe('ABSOLUTE');
    expect(figmaMock.commitUndo).toHaveBeenCalledOnce();
  });
});
