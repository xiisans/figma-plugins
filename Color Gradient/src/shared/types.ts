export type GradientMode = 'solid' | 'alpha';
export type ColorModel = 'oklch' | 'hsl';
export type StepCount = 10 | 20;
export type Distribution = 'uniform' | 'centered';
export type OutputMode = 'variables' | 'board';

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectedColor extends RgbaColor {
  hex: string;
  nodeId: string;
  nodeType: string;
  bounds: Bounds;
}

export type SelectionState =
  | { status: 'empty' }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; color: SelectedColor };

export interface GradientConfig {
  mode: GradientMode;
  model: ColorModel;
  steps: StepCount;
  distribution: Distribution;
}

export interface GradientStop extends RgbaColor {
  index: number;
  suffix: number;
  hex: string;
  modelLabel: string;
  alphaPercent: number;
}

export interface GradientResult {
  stops: GradientStop[];
  targetLightnessCorrected: boolean;
}

export interface CollectionOption {
  id: string;
  name: string;
  groups: string[];
}

export interface GenerateRequest {
  sourceNodeId: string;
  config: GradientConfig;
  collectionId?: string;
  collectionName?: string;
  groupName?: string;
}

export interface OperationSummary {
  kind: 'variables' | 'board';
  created: number;
  updated: number;
  message: string;
}

export type UiToPluginMessage =
  | { type: 'ui-ready' }
  | { type: 'refresh-collections' }
  | { type: 'generate-variables'; payload: GenerateRequest }
  | { type: 'generate-board'; payload: GenerateRequest };

export type PluginToUiMessage =
  | { type: 'initial-state'; collections: CollectionOption[]; selection: SelectionState }
  | { type: 'selection-change'; selection: SelectionState }
  | { type: 'collections-change'; collections: CollectionOption[] }
  | { type: 'operation-result'; success: true; summary: OperationSummary }
  | { type: 'operation-result'; success: false; message: string };
