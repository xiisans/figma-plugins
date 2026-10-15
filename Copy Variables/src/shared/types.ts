export type VariableDataType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';

export interface ColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface StoredAlias {
  kind: 'alias';
  collectionName: string;
  variableName: string;
}

export interface UnsupportedValue {
  kind: 'unsupported';
  reason: string;
}

export type StoredValue = boolean | number | string | ColorValue | StoredAlias | UnsupportedValue;

export interface StoredMode {
  name: string;
  value: StoredValue;
}

export interface StoredVariable {
  name: string;
  type: VariableDataType;
  description: string;
  scopes: string[];
  codeSyntax: Record<string, string>;
  hiddenFromPublishing: boolean;
  modes: StoredMode[];
}

export interface StoredCollection {
  name: string;
  defaultModeName: string;
  modes: string[];
  hiddenFromPublishing: boolean;
  variables: StoredVariable[];
}

export interface ClipboardData {
  version: 1;
  sourceFileName: string;
  sourceFileKey: string | null;
  copiedAt: string;
  collections: StoredCollection[];
}

export interface TreeVariable {
  kind: 'variable';
  key: string;
  name: string;
  fullName: string;
  variable: StoredVariable;
}

export interface TreeGroup {
  kind: 'group';
  key: string;
  name: string;
  children: TreeGroup[];
  variables: TreeVariable[];
}

export interface TreeCollection {
  kind: 'collection';
  key: string;
  name: string;
  children: TreeGroup[];
  variables: TreeVariable[];
  collection: StoredCollection;
}

export type TreeNode = TreeCollection | TreeGroup | TreeVariable;

export interface CurrentVariablesPayload {
  fileName: string;
  fileKey: string | null;
  collections: TreeCollection[];
}

export interface OperationResult {
  ok: boolean;
  title: string;
  message: string;
  clipboard?: ClipboardData;
  details?: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}

export type PluginMessage =
  | { type: 'load-data' }
  | { type: 'copy-selection'; keys: string[] }
  | { type: 'paste-selection'; keys: string[] }
  | { type: 'close' };

export type PluginResponse =
  | { type: 'data-loaded'; current: CurrentVariablesPayload; clipboard: ClipboardData | null }
  | { type: 'operation-result'; result: OperationResult }
  | { type: 'error'; title: string; message: string };

export const CLIPBOARD_KEY = 'free-copy-variables:clipboard:v1';
