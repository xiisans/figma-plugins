import {
  compareByCanvasPosition,
  deriveGroupNames,
  INVALID_SELECTION_MESSAGE,
  parseStrictNumber,
} from '../shared/logic';
import type {
  CollectionOption,
  GenerateRequest,
  PluginToUiMessage,
  PreviewColor,
  PreviewItem,
  SelectionState,
  UiToPluginMessage,
  VariableResolvedType,
} from '../shared/types';

figma.showUI(__html__, { width: 600, height: 400, themeColors: true });

function send(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

function colorToHex(r: number, g: number, b: number): string {
  const hex = (channel: number) => Math.round(channel * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

function getPosition(node: SceneNode): { x: number; y: number } {
  const bounds = node.absoluteBoundingBox;
  return bounds ? { x: bounds.x, y: bounds.y } : { x: 0, y: 0 };
}

function getColor(node: SceneNode): PreviewColor | null {
  if (!('fills' in node) || !Array.isArray(node.fills)) return null;
  const paint = node.fills.find(
    (candidate): candidate is SolidPaint =>
      candidate.type === 'SOLID' && candidate.visible !== false,
  );
  if (!paint) return null;

  const alpha = Math.max(0, Math.min(1, paint.opacity ?? 1));
  const a = alpha;
  return {
    r: paint.color.r,
    g: paint.color.g,
    b: paint.color.b,
    a,
    hex: colorToHex(paint.color.r, paint.color.g, paint.color.b),
  };
}

function previewText(node: TextNode): PreviewItem {
  const numericValue = parseStrictNumber(node.characters);
  const position = getPosition(node);
  return {
    nodeId: node.id,
    nodeType: node.type,
    ...position,
    displayValue: node.characters,
    variableValue: numericValue ?? node.characters,
    resolvedType: numericValue === null ? 'STRING' : 'FLOAT',
  };
}

function readSelection(): SelectionState {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return { status: 'empty', items: [] };

  const kinds = new Set<'color' | 'text'>();
  const items: PreviewItem[] = [];

  for (const node of selection) {
    if (node.type === 'TEXT') {
      if (!node.characters.trim()) {
        return { status: 'invalid', items: [], message: INVALID_SELECTION_MESSAGE };
      }
      kinds.add('text');
      items.push(previewText(node));
      continue;
    }

    const color = getColor(node);
    if (!color) {
      return { status: 'invalid', items: [], message: INVALID_SELECTION_MESSAGE };
    }
    kinds.add('color');
    items.push({
      nodeId: node.id,
      nodeType: node.type,
      ...getPosition(node),
      displayValue: color.hex,
      variableValue: { r: color.r, g: color.g, b: color.b, a: color.a },
      resolvedType: 'COLOR',
      color,
    });
  }

  if (kinds.size !== 1) {
    return { status: 'invalid', items: [], message: INVALID_SELECTION_MESSAGE };
  }

  items.sort(compareByCanvasPosition);
  return { status: 'valid', kind: kinds.values().next().value!, items };
}

async function readCollections(): Promise<CollectionOption[]> {
  const [collections, variables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);
  return collections
    .map((collection) => ({
      id: collection.id,
      name: collection.name,
      groups: deriveGroupNames(
        variables
          .filter((variable) => variable.variableCollectionId === collection.id)
          .map((variable) => variable.name),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

async function refreshCollections(): Promise<void> {
  send({ type: 'collections-change', collections: await readCollections() });
}

async function sendInitialState(): Promise<void> {
  send({
    type: 'initial-state',
    collections: await readCollections(),
    selection: readSelection(),
  });
}

function isResolvedType(value: string): value is VariableResolvedType {
  return value === 'COLOR' || value === 'FLOAT' || value === 'STRING';
}

async function generate(request: GenerateRequest): Promise<void> {
  const collectionName = request.collectionName.trim();
  const groupName = request.groupName.trim().replace(/^\/+|\/+$/g, '');
  if (!collectionName || !groupName) throw new Error('请填写集合和分组名称');
  if (!Number.isSafeInteger(request.start) || !Number.isSafeInteger(request.step) || request.step <= 0) {
    throw new Error('起始值和步长必须为整数，且步长大于 0');
  }

  const selection = readSelection();
  if (selection.status !== 'valid') throw new Error(INVALID_SELECTION_MESSAGE);
  const currentIds = selection.items.map((item) => item.nodeId);
  if (
    currentIds.length !== request.nodeIds.length ||
    currentIds.some((id) => !request.nodeIds.includes(id))
  ) {
    throw new Error('选区已变化，请确认预览后重新生成');
  }

  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const collection =
    (request.collectionId
      ? localCollections.find((item) => item.id === request.collectionId)
      : undefined) ??
    localCollections.find((item) => item.name === collectionName) ??
    figma.variables.createVariableCollection(collectionName);

  const direction = request.direction === 'increase' ? 1 : -1;
  const variables = selection.items.map((item, index) => ({
    name: `${groupName}/${request.start + index * request.step * direction}`,
    resolvedType: item.resolvedType,
    value: item.variableValue,
  }));

  const existingByName = new Map(
    (await figma.variables
      .getLocalVariablesAsync())
      .filter((variable) => variable.variableCollectionId === collection.id)
      .map((variable) => [variable.name, variable]),
  );

  for (const planned of variables) {
    const existing = existingByName.get(planned.name);
    if (existing && existing.resolvedType !== planned.resolvedType) {
      throw new Error(`变量“${planned.name}”类型冲突，未修改任何变量`);
    }
    if (!isResolvedType(planned.resolvedType)) {
      throw new Error(`变量“${planned.name}”的值类型不受支持`);
    }
  }

  for (const planned of variables) {
    const existing = existingByName.get(planned.name);
    const variable = existing ?? figma.variables.createVariable(
      planned.name,
      collection,
      planned.resolvedType,
    );
    variable.setValueForMode(collection.defaultModeId, planned.value as VariableValue);
  }

  await refreshCollections();
  figma.notify(`已生成 ${variables.length} 个变量`);
  send({ type: 'generate-result', success: true, message: `已生成 ${variables.length} 个变量` });
}

figma.ui.onmessage = (message: UiToPluginMessage) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'ui-ready') {
    void sendInitialState();
  } else if (message.type === 'refresh-collections') {
    void refreshCollections();
  } else if (message.type === 'generate') {
    void generate(message.payload).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : '生成失败，请稍后重试';
      figma.notify(errorMessage, { error: true });
      send({
        type: 'generate-result',
        success: false,
        message: errorMessage,
      });
    });
  }
};

figma.on('selectionchange', () => {
  send({ type: 'selection-change', selection: readSelection() });
});
