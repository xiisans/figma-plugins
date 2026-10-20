import { buildExportSnapshot, SnapshotBuildError } from "./shared/snapshot";
import type {
  AliasValueDto,
  CollectionDto,
  ColorValueDto,
  PluginDataDto,
  PluginErrorDto,
  PluginToUiMessage,
  UiToPluginMessage,
  VariableDto,
  VariableValueDto,
} from "./shared/types";

declare const __html__: string;

figma.showUI(__html__, { width: 600, height: 400, themeColors: true });

let currentData: PluginDataDto | null = null;

function post(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

function copyValue(value: VariableValue): VariableValueDto {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if ("type" in value && value.type === "VARIABLE_ALIAS") return { type: "VARIABLE_ALIAS", id: value.id } satisfies AliasValueDto;
  const color = value as RGB | RGBA;
  return { r: color.r, g: color.g, b: color.b, a: "a" in color ? color.a : 1 } satisfies ColorValueDto;
}

function toVariableDto(variable: Variable): VariableDto | null {
  if (!["BOOLEAN", "COLOR", "FLOAT", "STRING"].includes(variable.resolvedType)) return null;
  const valuesByMode: Record<string, VariableValueDto> = {};
  for (const [modeId, value] of Object.entries(variable.valuesByMode)) valuesByMode[modeId] = copyValue(value);
  return {
    id: variable.id,
    key: variable.key,
    name: variable.name,
    collectionId: variable.variableCollectionId,
    resolvedType: variable.resolvedType as VariableDto["resolvedType"],
    valuesByMode,
    remote: variable.remote,
  };
}

function toCollectionDto(collection: VariableCollection, visible: boolean, order: number): CollectionDto {
  return {
    id: collection.id,
    key: collection.key,
    name: collection.name,
    defaultModeId: collection.defaultModeId,
    modes: collection.modes.map((mode, index) => ({ id: mode.modeId, name: mode.name, order: index })),
    variableIds: [...collection.variableIds],
    visible,
    order,
  };
}

function aliasIds(variable: Variable): string[] {
  return Object.values(variable.valuesByMode)
    .filter((value): value is VariableAlias => typeof value === "object" && "type" in value && value.type === "VARIABLE_ALIAS")
    .map((value) => value.id);
}

async function readPluginData(): Promise<PluginDataDto> {
  const [localCollections, localVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);
  const variableMap = new Map(localVariables.map((variable) => [variable.id, variable]));
  const missingAliasIds = new Set<string>();

  for (const variable of localVariables) {
    for (const id of aliasIds(variable)) {
      if (variableMap.has(id) || missingAliasIds.has(id)) continue;
      let target: Variable | null = null;
      try {
        target = await figma.variables.getVariableByIdAsync(id);
      } catch {
        missingAliasIds.add(id);
        continue;
      }
      if (!target) {
        missingAliasIds.add(id);
        continue;
      }
      variableMap.set(target.id, target);
    }
  }

  const collections = localCollections.map((collection, index) => toCollectionDto(collection, true, index));

  return {
    fileName: figma.root.name,
    collections,
    variables: [...variableMap.values()].map(toVariableDto).filter((variable): variable is VariableDto => variable !== null),
  };
}

async function load(reason: "initialize" | "refresh"): Promise<void> {
  post({ type: "load-started", reason });
  try {
    currentData = await readPluginData();
    post({ type: "data-loaded", data: currentData });
  } catch (cause) {
    const error: PluginErrorDto = {
      code: "LOAD_FAILED",
      message: cause instanceof Error ? cause.message : "读取本地变量时发生未知错误。",
    };
    post({ type: "plugin-error", error });
  }
}

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  if (message.type === "load-data") {
    await load(message.reason);
    return;
  }
  if (message.type === "generate-snapshot") {
    if (!currentData) {
      post({ type: "plugin-error", requestId: message.requestId, error: { code: "LOAD_FAILED", message: "变量数据尚未加载完成。" } });
      return;
    }
    try {
      const snapshot = buildExportSnapshot(currentData, message.selectedModeIds);
      post({ type: "snapshot-generated", requestId: message.requestId, snapshot });
    } catch (cause) {
      const error = cause instanceof SnapshotBuildError
        ? cause.issue
        : { code: "LOAD_FAILED" as const, message: cause instanceof Error ? cause.message : "生成变量文本时发生未知错误。" };
      post({ type: "plugin-error", requestId: message.requestId, error });
    }
  }
};
