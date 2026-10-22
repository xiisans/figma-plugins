export type VariableResolvedType = 'COLOR' | 'FLOAT' | 'STRING';

export interface Position {
  x: number;
  y: number;
}

export interface VariableColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PreviewColor extends VariableColor {
  hex: string;
}

export interface PreviewItem extends Position {
  nodeId: string;
  nodeType: string;
  displayValue: string;
  variableValue: string | number | VariableColor;
  resolvedType: VariableResolvedType;
  color?: PreviewColor;
}

export type SelectionState =
  | { status: 'empty'; items: [] }
  | { status: 'invalid'; items: []; message: string }
  | { status: 'valid'; kind: 'color' | 'text'; items: PreviewItem[] };

export interface CollectionOption {
  id: string;
  name: string;
  groups: string[];
}

export type Direction = 'increase' | 'decrease';

export interface GenerateRequest {
  collectionId?: string;
  collectionName: string;
  groupName: string;
  start: number;
  step: number;
  direction: Direction;
  nodeIds: string[];
}

export type PluginToUiMessage =
  | { type: 'initial-state'; collections: CollectionOption[]; selection: SelectionState }
  | { type: 'selection-change'; selection: SelectionState }
  | { type: 'collections-change'; collections: CollectionOption[] }
  | { type: 'generate-result'; success: true; message: string }
  | { type: 'generate-result'; success: false; message: string };

export type UiToPluginMessage =
  | { type: 'ui-ready' }
  | { type: 'generate'; payload: GenerateRequest }
  | { type: 'refresh-collections' };
