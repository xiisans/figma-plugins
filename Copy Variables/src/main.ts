import { filterClipboard, isAlias, orderClipboardCollections } from './shared/clipboard';
import { collectionToTree, variableKey } from './shared/tree';
import type {
  ClipboardData,
  CurrentVariablesPayload,
  OperationResult,
  PluginMessage,
  PluginResponse,
  StoredCollection,
  StoredValue,
  StoredVariable,
  VariableDataType
} from './shared/types';
import { CLIPBOARD_KEY } from './shared/types';

figma.showUI(__html__, { width: 360, height: 480, themeColors: true });

function post(message: PluginResponse) {
  figma.ui.postMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notifyResult(result: OperationResult) {
  figma.notify(`${result.title}：${result.message}`, { error: !result.ok, timeout: result.ok ? 2500 : 4500 });
}

let collectionNames = new Map<string, string>();

function collectionNameFor(id: string): string {
  const name = collectionNames.get(id);
  if (!name) throw new Error('找不到变量所属集合');
  return name;
}

function serializeValue(value: VariableValue, localVariables: Map<string, Variable>): StoredValue {
  if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'VARIABLE_ALIAS') {
    const target = localVariables.get(value.id);
    if (!target) return { kind: 'unsupported', reason: '引用了团队变量库，当前版本仅支持本地变量别名' };
    return { kind: 'alias', collectionName: collectionNameFor(target.variableCollectionId), variableName: target.name };
  }
  if (typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value) {
    return { r: value.r, g: value.g, b: value.b, a: 'a' in value ? value.a : 1 };
  }
  return value as boolean | number | string;
}

async function scanLocalVariables(): Promise<ClipboardData> {
  const [collections, variables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync()
  ]);
  collectionNames = new Map(collections.map((collection) => [collection.id, collection.name]));
  const variablesById = new Map(variables.map((variable) => [variable.id, variable]));

  const storedCollections: StoredCollection[] = collections.map((collection) => {
    const modesById = new Map(collection.modes.map((mode) => [mode.modeId, mode.name]));
    const orderedVariables = collection.variableIds.flatMap((id) => {
      const variable = variablesById.get(id);
      return variable && variable.variableCollectionId === collection.id ? [variable] : [];
    });
    const orderedIds = new Set(orderedVariables.map((variable) => variable.id));
    for (const variable of variables) {
      if (variable.variableCollectionId === collection.id && !orderedIds.has(variable.id)) {
        orderedVariables.push(variable);
      }
    }
    const storedVariables: StoredVariable[] = orderedVariables.map((variable) => ({
      name: variable.name,
      type: variable.resolvedType as VariableDataType,
      description: variable.description,
      scopes: [...variable.scopes],
      codeSyntax: { ...variable.codeSyntax },
      hiddenFromPublishing: variable.hiddenFromPublishing,
      modes: Object.entries(variable.valuesByMode).flatMap(([modeId, value]) => {
        const name = modesById.get(modeId);
        return name ? [{ name, value: serializeValue(value, variablesById) }] : [];
      })
    }));
    const defaultModeName = modesById.get(collection.defaultModeId) ?? collection.modes[0]?.name ?? 'Mode 1';
    return {
      name: collection.name,
      defaultModeName,
      modes: collection.modes.map((mode) => mode.name),
      hiddenFromPublishing: collection.hiddenFromPublishing,
      variables: storedVariables
    };
  });

  return {
    version: 1,
    sourceFileName: figma.root.name,
    sourceFileKey: figma.fileKey ?? null,
    copiedAt: new Date().toISOString(),
    // Figma returns local collections and variables in the order shown in its
    // variables panel. Keep that order for both the copy list and clipboard.
    collections: storedCollections
  };
}

async function loadClipboard(): Promise<ClipboardData | null> {
  const value = await figma.clientStorage.getAsync(CLIPBOARD_KEY);
  if (!value || value.version !== 1 || !Array.isArray(value.collections)) return null;
  return value as ClipboardData;
}

async function replaceClipboard(clipboard: ClipboardData): Promise<ClipboardData> {
  // setAsync replaces the value at this key; it never appends to the previous snapshot.
  await figma.clientStorage.setAsync(CLIPBOARD_KEY, clipboard);
  return await loadClipboard() ?? clipboard;
}

async function loadData() {
  const [currentData, clipboard] = await Promise.all([scanLocalVariables(), loadClipboard()]);
  const current: CurrentVariablesPayload = {
    fileName: currentData.sourceFileName,
    fileKey: currentData.sourceFileKey,
    collections: currentData.collections.map(collectionToTree)
  };
  post({ type: 'data-loaded', current, clipboard });
}

async function copySelection(keys: string[], collectionOrder: string[]): Promise<OperationResult> {
  const all = await scanLocalVariables();
  const clipboard = orderClipboardCollections(filterClipboard(all, keys), collectionOrder);
  const variableCount = clipboard.collections.reduce((sum, collection) => sum + collection.variables.length, 0);
  if (!variableCount) return { ok: false, title: '复制失败', message: '请至少选择一个变量' };
  const savedClipboard = await replaceClipboard(clipboard);
  return {
    ok: true,
    title: '复制成功',
    message: `已复制 ${clipboard.collections.length} 个集合、${variableCount} 个变量`,
    clipboard: savedClipboard
  };
}

interface TargetContext {
  collection: VariableCollection;
  modeIds: Map<string, string>;
}

function applyVariableMetadata(target: Variable, source: StoredVariable) {
  target.description = source.description;
  target.hiddenFromPublishing = source.hiddenFromPublishing;
  try {
    target.scopes = source.scopes as VariableScope[];
  } catch {
    // Ignore scopes that are incompatible with the destination variable type.
  }
  const platforms: CodeSyntaxPlatform[] = ['WEB', 'ANDROID', 'iOS'];
  for (const platform of platforms) {
    try {
      const syntax = source.codeSyntax[platform];
      if (syntax === undefined) target.removeVariableCodeSyntax(platform);
      else target.setVariableCodeSyntax(platform, syntax);
    } catch {
      // Unknown future platforms should not block the variable copy.
    }
  }
}

async function prepareCollection(source: StoredCollection, existingCollections: VariableCollection[]): Promise<TargetContext> {
  let collection = existingCollections.find((candidate) => candidate.name === source.name);
  if (!collection) {
    collection = figma.variables.createVariableCollection(source.name);
    existingCollections.push(collection);
    const defaultMode = collection.modes[0];
    if (defaultMode && defaultMode.name !== source.defaultModeName) {
      collection.renameMode(defaultMode.modeId, source.defaultModeName);
    }
  }
  collection.hiddenFromPublishing = source.hiddenFromPublishing;
  const currentModes = new Map(collection.modes.map((mode) => [mode.name, mode.modeId]));
  for (const modeName of source.modes) {
    if (!currentModes.has(modeName)) currentModes.set(modeName, collection.addMode(modeName));
  }
  return { collection, modeIds: currentModes };
}

function toFigmaValue(value: StoredValue, targets: Map<string, Variable>): VariableValue {
  if (isAlias(value)) {
    const target = targets.get(variableKey(value.collectionName, value.variableName));
    if (!target) throw new Error(`别名目标不存在：${value.collectionName} / ${value.variableName}`);
    return figma.variables.createVariableAlias(target);
  }
  if (typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'unsupported') {
    throw new Error(value.reason);
  }
  return value as VariableValue;
}

async function pasteSelection(keys: string[]): Promise<OperationResult> {
  const saved = await loadClipboard();
  if (!saved) return { ok: false, title: '粘贴失败', message: '没有可粘贴的复制记录，请先复制变量' };
  const clipboard = filterClipboard(saved, keys);
  const requestedCount = clipboard.collections.reduce((sum, collection) => sum + collection.variables.length, 0);
  if (!requestedCount) return { ok: false, title: '粘贴失败', message: '请至少选择一个变量' };

  const [existingCollections, existingVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync()
  ]);
  const targets = new Map<string, Variable>();
  const writable: Array<{ source: StoredVariable; context: TargetContext; target: Variable }> = [];
  let created = 0;
  let updated = 0;
  let failed = 0;
  const failures: string[] = [];

  // Figma prepends each newly created collection in the native variables panel.
  // Create bottom-to-top so the final panel order matches the source file.
  for (const sourceCollection of [...clipboard.collections].reverse()) {
    let context: TargetContext;
    try {
      context = await prepareCollection(sourceCollection, existingCollections);
    } catch (error) {
      failed += sourceCollection.variables.length;
      failures.push(`${sourceCollection.name}：${errorMessage(error)}`);
      continue;
    }

    const variablesInCollection = existingVariables.filter((variable) => variable.variableCollectionId === context.collection.id);
    for (const sourceVariable of sourceCollection.variables) {
      const key = variableKey(sourceCollection.name, sourceVariable.name);
      const unsupported = sourceVariable.modes.find((mode) => typeof mode.value === 'object' && mode.value !== null && 'kind' in mode.value && mode.value.kind === 'unsupported');
      if (unsupported && typeof unsupported.value === 'object' && 'reason' in unsupported.value) {
        failed += 1;
        failures.push(`${sourceVariable.name}：${unsupported.value.reason}`);
        continue;
      }
      let target = variablesInCollection.find((variable) => variable.name === sourceVariable.name);
      if (target && target.resolvedType !== sourceVariable.type) {
        failed += 1;
        failures.push(`${sourceVariable.name}：目标变量类型不同`);
        continue;
      }
      try {
        if (!target) {
          target = figma.variables.createVariable(sourceVariable.name, context.collection, sourceVariable.type);
          variablesInCollection.push(target);
          existingVariables.push(target);
          created += 1;
        } else {
          updated += 1;
        }
        applyVariableMetadata(target, sourceVariable);
        targets.set(key, target);
        writable.push({ source: sourceVariable, context, target });
      } catch (error) {
        failed += 1;
        failures.push(`${sourceVariable.name}：${errorMessage(error)}`);
      }
    }
  }

  for (const item of writable) {
    try {
      for (const mode of item.source.modes) {
        const modeId = item.context.modeIds.get(mode.name);
        if (!modeId) throw new Error(`找不到模式 ${mode.name}`);
        item.target.setValueForMode(modeId, toFigmaValue(mode.value, targets));
      }
    } catch (error) {
      failed += 1;
      failures.push(`${item.source.name}：${errorMessage(error)}`);
    }
  }

  const succeeded = Math.max(0, requestedCount - failed);
  const summary = `创建 ${created}，更新 ${updated}，失败 ${failed}`;
  return {
    ok: succeeded > 0,
    title: failed ? (succeeded ? '部分粘贴成功' : '粘贴失败') : '粘贴成功',
    message: failures.length ? `${summary}；${failures.slice(0, 2).join('；')}` : summary,
    details: { created, updated, skipped: 0, failed }
  };
}

figma.ui.onmessage = async (message: PluginMessage) => {
  try {
    if (message.type === 'close') {
      figma.closePlugin();
      return;
    }
    if (message.type === 'load-data') {
      await loadData();
      return;
    }
    const result = message.type === 'copy-selection'
      ? await copySelection(message.keys, message.collectionOrder)
      : await pasteSelection(message.keys);
    notifyResult(result);
    post({ type: 'operation-result', result });
  } catch (error) {
    const title = message.type === 'copy-selection' ? '复制失败' : message.type === 'paste-selection' ? '粘贴失败' : '加载失败';
    const messageText = errorMessage(error);
    figma.notify(`${title}：${messageText}`, { error: true, timeout: 4500 });
    post({ type: 'error', title, message: messageText });
  }
};
