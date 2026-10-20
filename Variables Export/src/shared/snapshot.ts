import { toKebabCase } from "./normalize";
import { orderVariablesByFigma } from "./ordering";
import type { AliasValueDto, CollectionDto, ExportEntryDto, ExportModeDto, ExportSnapshotDto, PluginDataDto, PluginErrorDto, VariableDto } from "./types";

export class SnapshotBuildError extends Error {
  constructor(public readonly issue: PluginErrorDto) {
    super(issue.message);
  }
}

function isAlias(value: unknown): value is AliasValueDto {
  return Boolean(value && typeof value === "object" && "type" in value && value.type === "VARIABLE_ALIAS");
}

function fail(code: PluginErrorDto["code"], message: string, details?: string[]): never {
  throw new SnapshotBuildError({ code, message, details });
}

export function buildExportSnapshot(data: PluginDataDto, selectedModeIds: string[]): ExportSnapshotDto {
  if (selectedModeIds.length === 0) {
    fail("NO_SELECTION", "请至少选择一个 Mode。返回选择后，再点击“+”加载。 ");
  }

  const variables = new Map(data.variables.map((variable) => [variable.id, variable]));
  const selected = new Set(selectedModeIds);
  const groups = new Map<string, ExportModeDto>();

  const groupKey = (collectionId: string, modeId: string) => `${collectionId}::${modeId}`;

  function ensureGroup(collection: CollectionDto, modeId: string): ExportModeDto {
    const mode = collection.modes.find((item) => item.id === modeId);
    if (!mode) {
      return fail("MISSING_VALUE", `集合“${collection.name}”中找不到目标 Mode。`, [modeId]);
    }

    const key = groupKey(collection.id, mode.id);
    const existing = groups.get(key);
    if (existing) return existing;

    const created: ExportModeDto = {
      collectionId: collection.id,
      collectionName: collection.name,
      collectionSlug: toKebabCase(collection.name, `collection-${collection.order + 1}`),
      collectionOrder: collection.order,
      modeId: mode.id,
      modeName: mode.name,
      modeSlug: toKebabCase(mode.name, `mode-${mode.order + 1}`),
      modeOrder: mode.order,
      isDefault: mode.id === collection.defaultModeId,
      entries: [],
    };
    groups.set(key, created);
    return created;
  }

  function addEntry(variable: VariableDto, group: ExportModeDto): void {
    const value = variable.valuesByMode[group.modeId];
    if (value === undefined) {
      return fail("MISSING_VALUE", `变量“${variable.name}”在 Mode“${group.modeName}”中没有值。`);
    }

    const entry: ExportEntryDto = {
      variableId: variable.id,
      variableName: variable.name,
      variableSlug: toKebabCase(variable.name, `variable-${variable.id.slice(-6)}`),
      resolvedType: variable.resolvedType,
      value,
    };

    if (isAlias(value)) {
      const target = variables.get(value.id);
      if (!target) {
        return fail("MISSING_ALIAS", `无法读取“${variable.name}”引用的别名目标。`, [value.id]);
      }
      entry.aliasTarget = {
        variableId: target.id,
        variableSlug: toKebabCase(target.name, `variable-${target.id.slice(-6)}`),
      };
    }

    group.entries.push(entry);
  }

  const visibleCollections = data.collections.filter((collection) => collection.visible).sort((a, b) => a.order - b.order);
  for (const collection of visibleCollections) {
    const collectionVariables = orderVariablesByFigma(collection.variableIds
      .map((id) => variables.get(id))
      .filter((variable): variable is VariableDto => Boolean(variable)));

    for (const mode of [...collection.modes].sort((a, b) => a.order - b.order)) {
      if (!selected.has(mode.id)) continue;
      const group = ensureGroup(collection, mode.id);
      for (const variable of collectionVariables) addEntry(variable, group);
    }
  }

  const populatedGroups = [...groups.values()].filter((group) => group.entries.length > 0);
  if (populatedGroups.length === 0) {
    fail("NO_SELECTION", "所选 Mode 中没有可导出的变量。");
  }

  const collectionSlugs = new Map<string, string>();
  const modeSlugs = new Map<string, string>();
  const variableSlugs = new Map<string, { id: string; name: string }>();
  const collisions: string[] = [];

  for (const group of populatedGroups) {
    const previousCollection = collectionSlugs.get(group.collectionSlug);
    if (previousCollection && previousCollection !== group.collectionId) {
      collisions.push(`集合：${group.collectionName} → ${group.collectionSlug}`);
    } else collectionSlugs.set(group.collectionSlug, group.collectionId);

    const modeCollisionKey = `${group.collectionId}:${group.modeSlug}`;
    const previousMode = modeSlugs.get(modeCollisionKey);
    if (previousMode && previousMode !== group.modeId) {
      collisions.push(`Mode：${group.collectionName}/${group.modeName} → ${group.modeSlug}`);
    } else modeSlugs.set(modeCollisionKey, group.modeId);

    for (const entry of group.entries) {
      const previous = variableSlugs.get(entry.variableSlug);
      if (previous && previous.id !== entry.variableId) {
        collisions.push(`变量：${previous.name} 与 ${entry.variableName} → ${entry.variableSlug}`);
      } else variableSlugs.set(entry.variableSlug, { id: entry.variableId, name: entry.variableName });
    }
  }

  if (collisions.length > 0) {
    fail("NAME_COLLISION", "规范化后的名称发生冲突，请重命名或取消选择相关变量。", [...new Set(collisions)]);
  }

  populatedGroups.sort((a, b) => a.collectionOrder - b.collectionOrder || a.modeOrder - b.modeOrder);

  return { modes: populatedGroups };
}
