import { buildGradient } from '../shared/color';
import { buildVariableNames, deriveGroupNames } from '../shared/naming';
import type {
  CollectionOption,
  GenerateRequest,
  GradientStop,
  PluginToUiMessage,
  SelectedColor,
  SelectionState,
  UiToPluginMessage,
} from '../shared/types';

const INVALID_SELECTION_MESSAGE = '请选择一个带有实色填充的画板';

figma.showUI(__html__, { width: 600, height: 400, themeColors: true });

function send(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function firstSolidFill(node: SceneNode): SolidPaint | null {
  if (!('fills' in node) || !Array.isArray(node.fills)) return null;
  return node.fills.find(
    (paint): paint is SolidPaint => paint.type === 'SOLID' && paint.visible !== false,
  ) ?? null;
}

function readSelectedColor(): SelectionState {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return { status: 'empty' };
  if (selection.length !== 1) return { status: 'invalid', message: INVALID_SELECTION_MESSAGE };

  const node = selection[0];
  const fill = firstSolidFill(node);
  const bounds = node.absoluteBoundingBox;
  if (!fill || !bounds) return { status: 'invalid', message: INVALID_SELECTION_MESSAGE };

  return {
    status: 'valid',
    color: {
      r: fill.color.r,
      g: fill.color.g,
      b: fill.color.b,
      a: fill.opacity ?? 1,
      hex: toHex(fill.color.r, fill.color.g, fill.color.b),
      nodeId: node.id,
      nodeType: node.type,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    },
  };
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
    selection: readSelectedColor(),
  });
}

function validateSource(sourceNodeId: string): SelectedColor {
  const selection = readSelectedColor();
  if (selection.status !== 'valid' || selection.color.nodeId !== sourceNodeId) {
    throw new Error('选区已变化，请确认预览后重新生成');
  }
  return selection.color;
}

async function generateVariables(request: GenerateRequest): Promise<void> {
  const source = validateSource(request.sourceNodeId);
  const collectionName = request.collectionName?.trim() ?? '';
  const groupName = request.groupName?.trim() ?? '';
  if (!collectionName || !groupName) throw new Error('请选择或输入集合与分组');

  const result = buildGradient(source, request.config);
  const names = buildVariableNames(groupName, result.stops.length);
  const [collections, allVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);
  const existingCollection =
    (request.collectionId ? collections.find((item) => item.id === request.collectionId) : undefined) ??
    collections.find((item) => item.name === collectionName);
  const variablesInCollection = existingCollection
    ? allVariables.filter((variable) => variable.variableCollectionId === existingCollection.id)
    : [];
  const existingByName = new Map(variablesInCollection.map((variable) => [variable.name, variable]));

  for (const name of names) {
    const variable = existingByName.get(name);
    if (variable && variable.resolvedType !== 'COLOR') {
      throw new Error(`变量“${name}”类型不是颜色，未写入任何变量`);
    }
  }

  const collection = existingCollection ?? figma.variables.createVariableCollection(collectionName);
  let created = 0;
  let updated = 0;
  result.stops.forEach((stop, index) => {
    const existing = existingByName.get(names[index]);
    const variable = existing ?? figma.variables.createVariable(names[index], collection, 'COLOR');
    variable.setValueForMode(collection.defaultModeId, {
      r: stop.r,
      g: stop.g,
      b: stop.b,
      a: stop.a,
    });
    if (existing) updated += 1;
    else created += 1;
  });

  await refreshCollections();
  const message = `已创建 ${created} 个、更新 ${updated} 个颜色变量`;
  figma.notify(message);
  send({ type: 'operation-result', success: true, summary: { kind: 'variables', created, updated, message } });
}

function solidPaint(stop: GradientStop): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: stop.r, g: stop.g, b: stop.b },
    opacity: stop.a,
  };
}

function createPaletteFrame(source: SelectedColor, stops: GradientStop[]): FrameNode {
  const palette = figma.createFrame();
  palette.name = `${source.hex} 颜色梯度`;
  palette.layoutMode = 'HORIZONTAL';
  palette.primaryAxisSizingMode = 'AUTO';
  palette.counterAxisSizingMode = 'FIXED';
  palette.itemSpacing = 0;
  palette.paddingTop = 0;
  palette.paddingRight = 0;
  palette.paddingBottom = 0;
  palette.paddingLeft = 0;
  palette.clipsContent = false;
  palette.fills = [];
  palette.resizeWithoutConstraints(stops.length * 120, 120);

  for (const stop of stops) {
    const swatch = figma.createFrame();
    swatch.name = String(stop.suffix);
    swatch.resizeWithoutConstraints(120, 120);
    swatch.fills = [solidPaint(stop)];
    swatch.clipsContent = true;
    palette.appendChild(swatch);
  }

  figma.currentPage.appendChild(palette);
  palette.x = source.bounds.x;
  palette.y = source.bounds.y + source.bounds.height + 24;
  return palette;
}

async function generateBoard(request: GenerateRequest): Promise<void> {
  const source = validateSource(request.sourceNodeId);
  const result = buildGradient(source, request.config);
  const palette = createPaletteFrame(source, result.stops);
  figma.currentPage.selection = [palette];
  figma.viewport.scrollAndZoomIntoView([palette]);
  const message = `已生成 ${result.stops.length} 个色板`;
  figma.notify(message);
  send({
    type: 'operation-result',
    success: true,
    summary: { kind: 'board', created: result.stops.length, updated: 0, message },
  });
}

figma.ui.onmessage = (message: UiToPluginMessage) => {
  if (!message || typeof message !== 'object') return;
  const run = async () => {
    if (message.type === 'ui-ready') await sendInitialState();
    if (message.type === 'refresh-collections') await refreshCollections();
    if (message.type === 'generate-variables') await generateVariables(message.payload);
    if (message.type === 'generate-board') await generateBoard(message.payload);
  };
  void run().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : '生成失败，请稍后重试';
    figma.notify(detail, { error: true });
    send({ type: 'operation-result', success: false, message: detail });
  });
};

figma.on('selectionchange', () => {
  send({ type: 'selection-change', selection: readSelectedColor() });
});
