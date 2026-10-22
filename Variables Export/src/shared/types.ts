export type VariableDataType = "BOOLEAN" | "COLOR" | "FLOAT" | "STRING";
export type ColorFormat = "hex" | "rgb" | "hsl";
export type ExportFormat = "css" | "scss" | "css-scss" | "tailwind";

export interface ColorValueDto {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface AliasValueDto {
  type: "VARIABLE_ALIAS";
  id: string;
}

export type VariableValueDto = string | number | boolean | ColorValueDto | AliasValueDto;

export interface ModeDto {
  id: string;
  name: string;
  order: number;
}

export interface CollectionDto {
  id: string;
  key: string;
  name: string;
  defaultModeId: string;
  modes: ModeDto[];
  variableIds: string[];
  visible: boolean;
  order: number;
}

export interface VariableDto {
  id: string;
  key: string;
  name: string;
  collectionId: string;
  resolvedType: VariableDataType;
  valuesByMode: Record<string, VariableValueDto>;
  remote: boolean;
}

export interface PluginDataDto {
  fileName: string;
  collections: CollectionDto[];
  variables: VariableDto[];
}

export interface AliasTargetDto {
  variableId: string;
  variableSlug: string;
}

export interface ExportEntryDto {
  variableId: string;
  variableName: string;
  variableSlug: string;
  resolvedType: VariableDataType;
  value: VariableValueDto;
  aliasTarget?: AliasTargetDto;
}

export interface ExportModeDto {
  collectionId: string;
  collectionName: string;
  collectionSlug: string;
  collectionOrder: number;
  modeId: string;
  modeName: string;
  modeSlug: string;
  modeOrder: number;
  isDefault: boolean;
  entries: ExportEntryDto[];
}

export interface ExportSnapshotDto {
  modes: ExportModeDto[];
}

export interface PluginErrorDto {
  code: "LOAD_FAILED" | "NO_SELECTION" | "NAME_COLLISION" | "MISSING_VALUE" | "MISSING_ALIAS";
  message: string;
  details?: string[];
}

export type UiToPluginMessage =
  | { type: "load-data"; reason: "initialize" | "refresh" }
  | { type: "generate-snapshot"; requestId: number; selectedModeIds: string[] };

export type PluginToUiMessage =
  | { type: "load-started"; reason: "initialize" | "refresh" }
  | { type: "data-loaded"; data: PluginDataDto }
  | { type: "snapshot-generated"; requestId: number; snapshot: ExportSnapshotDto }
  | { type: "plugin-error"; requestId?: number; error: PluginErrorDto };
