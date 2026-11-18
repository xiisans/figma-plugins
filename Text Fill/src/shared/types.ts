export type Order = 'asc' | 'desc';
export type DateFormat = '-' | '/' | '文';
export type TimeFormat = 'HH:MM:SS' | 'HH:MM' | 'MM:SS';
export type PhoneFormat = 'regular' | 'masked' | 'spaced';
export type ParagraphCategory = 'comment' | 'news' | 'science';

export interface FillConfigMap {
  name: Record<string, never>;
  nickname: Record<string, never>;
  gender: Record<string, never>;
  qq: Record<string, never>;
  email: Record<string, never>;
  address: Record<string, never>;
  number: { min: number; max: number; decimals: number };
  sequence: { start: number; step: number; padding: number; order: Order };
  date: { format: DateFormat; order: Order };
  time: { format: TimeFormat };
  phone: { format: PhoneFormat };
  age: { min: number; max: number };
  paragraph: { category: ParagraphCategory; min: number; max: number };
}

export type FillKind = keyof FillConfigMap;
export type FillConfig = {
  [K in FillKind]: { kind: K; config: FillConfigMap[K] }
}[FillKind];
export type QuickFillRequest = FillConfig & { type: 'apply-quick-fill'; requestId: string };
export interface CustomFillRequest {
  type: 'apply-custom-fill';
  requestId: string;
  lines: string[];
  random: boolean;
}
export type FillRequest = QuickFillRequest | CustomFillRequest;
export type UIMessage = FillRequest | { type: 'get-selection' };
export interface FillResult {
  type: 'fill-result';
  requestId: string;
  updated: number;
  skipped: number;
  error?: string;
}
export type HostMessage = FillResult | { type: 'selection-state'; count: number };
export type PluginMessage = UIMessage | HostMessage;

export const FILL_KINDS: readonly FillKind[] = [
  'name', 'nickname', 'gender', 'qq', 'email', 'address',
  'number', 'sequence', 'date', 'time', 'phone', 'age', 'paragraph',
];
export const FILL_LABELS: Record<FillKind, string> = {
  name: '姓名', nickname: '昵称', gender: '性别', qq: 'QQ号码', email: 'Email', address: '地址',
  number: '数字', sequence: '序号', date: '日期', time: '时间', phone: '手机', age: '年龄', paragraph: '段落',
};
export const DEFAULT_CONFIGS: FillConfigMap = {
  name: {}, nickname: {}, gender: {}, qq: {}, email: {}, address: {},
  number: { min: 0, max: 100, decimals: 0 },
  sequence: { start: 1, step: 1, padding: 0, order: 'asc' },
  date: { format: '-', order: 'asc' },
  time: { format: 'HH:MM:SS' },
  phone: { format: 'regular' },
  age: { min: 18, max: 60 },
  paragraph: { category: 'comment', min: 20, max: 40 },
};
