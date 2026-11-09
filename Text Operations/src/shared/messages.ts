export type MergeRule = 'none' | 'newline' | 'space' | 'comma' | 'period' | 'slash';
export type SplitDelimiter = Exclude<MergeRule, 'none'>;
export type LayoutDirection = 'vertical' | 'horizontal';
export type ItemSpacing = 4 | 8 | 12 | 16 | 20;
export type Operation = 'replace' | 'extract' | 'split';

export type UiRequest =
  | { type: 'selection-request' }
  | { type: 'notify'; message: string }
  | {
      type: 'replace';
      requestId: string;
      find: string;
      replacement: string;
      syncLayerName: boolean;
    }
  | { type: 'extract'; requestId: string; rule: MergeRule }
  | {
      type: 'split';
      requestId: string;
      delimiter: SplitDelimiter;
      keepDelimiter: boolean;
      direction: LayoutDirection;
      spacing: ItemSpacing;
    };

export interface SelectionChangedMessage {
  type: 'selection-changed';
  selectedCount: number;
  textCount: number;
  splitEligible: boolean;
}

export interface OperationResultMessage {
  type: 'operation-result';
  requestId: string;
  operation: Operation;
  ok: boolean;
  extractedText?: string;
  message?: string;
}

export type PluginResponse = SelectionChangedMessage | OperationResultMessage;
