import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiToPluginMessage } from '../shared/types';

interface FakeVariable {
  id: string;
  name: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  variableCollectionId: string;
  setValueForMode: ReturnType<typeof vi.fn>;
}

interface FakeFrame {
  id: string;
  type: 'FRAME';
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  children: FakeFrame[];
  fills: readonly Paint[];
  appendChild: (child: FakeFrame) => void;
  resizeWithoutConstraints: (width: number, height: number) => void;
  [key: string]: unknown;
}

function createFrameFactory(createdFrames: FakeFrame[]) {
  return () => {
    const frame: FakeFrame = {
      id: `frame:${createdFrames.length + 1}`,
      type: 'FRAME',
      name: '',
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      children: [],
      fills: [],
      appendChild(child) { this.children.push(child); },
      resizeWithoutConstraints(width, height) { this.width = width; this.height = height; },
    };
    createdFrames.push(frame);
    return frame;
  };
}

async function setupPlugin({ existingVariable }: { existingVariable?: FakeVariable } = {}) {
  vi.resetModules();
  const posted: unknown[] = [];
  const createdFrames: FakeFrame[] = [];
  const sourceNode = {
    id: 'source:1',
    type: 'FRAME',
    fills: [{ type: 'SOLID', color: { r: 123 / 255, g: 94 / 255, b: 241 / 255 }, opacity: 1 }],
    absoluteBoundingBox: { x: 100, y: 200, width: 120, height: 120 },
  };
  const collection = {
    id: 'collection:1',
    name: 'color',
    defaultModeId: 'mode:default',
    modes: [{ modeId: 'mode:default', name: 'Light' }, { modeId: 'mode:dark', name: 'Dark' }],
  };
  const variables: FakeVariable[] = existingVariable ? [existingVariable] : [];
  const createVariable = vi.fn((name: string) => {
    const variable: FakeVariable = {
      id: `variable:${variables.length + 1}`,
      name,
      resolvedType: 'COLOR',
      variableCollectionId: collection.id,
      setValueForMode: vi.fn(),
    };
    variables.push(variable);
    return variable;
  });
  const currentPage = {
    selection: [sourceNode],
    appendChild: vi.fn(),
  };
  const mock = {
    showUI: vi.fn(),
    ui: { postMessage: vi.fn((message) => posted.push(message)), onmessage: undefined as ((message: UiToPluginMessage) => void) | undefined },
    variables: {
      getLocalVariableCollectionsAsync: vi.fn(async () => [collection]),
      getLocalVariablesAsync: vi.fn(async () => variables),
      createVariableCollection: vi.fn(),
      createVariable,
    },
    createFrame: vi.fn(createFrameFactory(createdFrames)),
    currentPage,
    viewport: { scrollAndZoomIntoView: vi.fn() },
    notify: vi.fn(),
    on: vi.fn(),
  };
  vi.stubGlobal('figma', mock);
  vi.stubGlobal('__html__', '<div id="root"></div>');
  await import('./main');
  const dispatch = async (message: UiToPluginMessage) => {
    mock.ui.onmessage?.(message);
    await vi.waitFor(() => expect(mock.ui.postMessage).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { mock, posted, variables, collection, currentPage, sourceNode, createdFrames, dispatch };
}

const request = {
  sourceNodeId: 'source:1',
  config: { mode: 'solid', model: 'oklch', steps: 10, distribution: 'uniform' } as const,
  collectionId: 'collection:1',
  collectionName: 'color',
  groupName: 'blue',
};

describe('Figma plugin operations', () => {
  beforeEach(() => vi.useRealTimers());

  it('updates existing variables and writes only the default mode', async () => {
    const existing: FakeVariable = {
      id: 'variable:existing',
      name: 'blue/10',
      resolvedType: 'COLOR',
      variableCollectionId: 'collection:1',
      setValueForMode: vi.fn(),
    };
    const { dispatch, variables, collection } = await setupPlugin({ existingVariable: existing });
    await dispatch({ type: 'generate-variables', payload: request });
    expect(variables).toHaveLength(10);
    expect(existing.setValueForMode).toHaveBeenCalledTimes(1);
    expect(existing.setValueForMode).toHaveBeenCalledWith(collection.defaultModeId, expect.objectContaining({ a: 1 }));
    expect(existing.setValueForMode).not.toHaveBeenCalledWith('mode:dark', expect.anything());
  });

  it('blocks the whole batch on a type conflict', async () => {
    const conflict: FakeVariable = {
      id: 'variable:conflict',
      name: 'blue/10',
      resolvedType: 'FLOAT',
      variableCollectionId: 'collection:1',
      setValueForMode: vi.fn(),
    };
    const { dispatch, mock, variables } = await setupPlugin({ existingVariable: conflict });
    await dispatch({ type: 'generate-variables', payload: request });
    expect(mock.variables.createVariable).not.toHaveBeenCalled();
    expect(variables).toHaveLength(1);
    expect(mock.notify).toHaveBeenCalledWith(expect.stringContaining('类型不是颜色'), { error: true });
  });

  it('creates a horizontal parent and 120px child frames 24px below the source', async () => {
    const { dispatch, createdFrames, currentPage, mock } = await setupPlugin();
    await dispatch({ type: 'generate-board', payload: request });
    const palette = createdFrames[0];
    expect(palette.layoutMode).toBe('HORIZONTAL');
    expect(palette.itemSpacing).toBe(0);
    expect(palette.width).toBe(1200);
    expect(palette.height).toBe(120);
    expect(palette.x).toBe(100);
    expect(palette.y).toBe(344);
    expect(palette.children).toHaveLength(10);
    expect(palette.children.map((child) => child.name)).toEqual(['10', '20', '30', '40', '50', '60', '70', '80', '90', '100']);
    expect(palette.children.every((child) => child.width === 120 && child.height === 120)).toBe(true);
    expect(currentPage.selection).toEqual([palette]);
    expect(mock.viewport.scrollAndZoomIntoView).toHaveBeenCalledWith([palette]);
  });

  it('rejects generation after the source selection changes', async () => {
    const { dispatch, currentPage, mock } = await setupPlugin();
    currentPage.selection = [];
    await dispatch({ type: 'generate-board', payload: request });
    expect(mock.createFrame).not.toHaveBeenCalled();
    expect(mock.notify).toHaveBeenCalledWith('选区已变化，请确认预览后重新生成', { error: true });
  });
});
