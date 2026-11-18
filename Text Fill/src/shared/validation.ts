import { FILL_KINDS, type FillConfig, type FillRequest } from './types';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function numeric(value: unknown, min: number, max: number, integer = false): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    && (!integer || Number.isInteger(value));
}
function oneOf(value: unknown, options: readonly string[]): boolean {
  return typeof value === 'string' && options.includes(value);
}

export function configError(input: unknown): string | undefined {
  if (!record(input) || !oneOf(input.kind, FILL_KINDS) || !record(input.config)) return '填充参数无效';
  const c = input.config;
  switch (input.kind) {
    case 'number': {
      if (!numeric(c.min, -1e9, 1e9) || !numeric(c.max, -1e9, 1e9)) return '数字范围应在 -10亿 到 10亿之间';
      if (!numeric(c.decimals, 0, 6, true)) return '小数位数应为 0–6 的整数';
      if ((c.max as number) <= (c.min as number)) return '最大值必须大于最小值';
      const scale = 10 ** (c.decimals as number);
      if (Math.ceil((c.min as number) * scale) > Math.floor((c.max as number) * scale)) return '该范围内没有符合小数位数的数字';
      break;
    }
    case 'sequence':
      if (!numeric(c.start, -1e9, 1e9, true)) return '起始值应为 -10亿 到 10亿之间的整数';
      if (!numeric(c.step, 1, 1e6, true)) return '间隔应为 1–1000000 的整数';
      if (!numeric(c.padding, 0, 12, true)) return '补零应为 0–12 的整数';
      if (!oneOf(c.order, ['asc', 'desc'])) return '请选择有效的排序方式';
      break;
    case 'date':
      if (!oneOf(c.format, ['-', '/', '文']) || !oneOf(c.order, ['asc', 'desc'])) return '日期格式或排序无效';
      break;
    case 'time':
      if (!oneOf(c.format, ['HH:MM:SS', 'HH:MM', 'MM:SS'])) return '时间格式无效';
      break;
    case 'phone':
      if (!oneOf(c.format, ['regular', 'masked', 'spaced'])) return '手机格式无效';
      break;
    case 'age':
      if (!numeric(c.min, 0, 150, true) || !numeric(c.max, 0, 150, true)) return '年龄应为 0–150 的整数';
      if ((c.max as number) < (c.min as number)) return '最大年龄不能小于最小年龄';
      break;
    case 'paragraph':
      if (!oneOf(c.category, ['comment', 'news', 'science'])) return '段落类型无效';
      if (!numeric(c.min, 1, 10000, true) || !numeric(c.max, 1, 10000, true)) return '段落字数应为 1–10000 的整数';
      if ((c.max as number) < (c.min as number)) return '最多字数不能小于最少字数';
      break;
  }
}

export function parseFillRequest(input: unknown): FillRequest {
  if (!record(input) || typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 100) {
    throw new Error('填充请求无效');
  }
  if (input.type === 'apply-quick-fill') {
    const error = configError(input);
    if (error) throw new Error(error);
    return input as unknown as FillRequest;
  }
  if (input.type === 'apply-custom-fill' && Array.isArray(input.lines)
    && input.lines.every(line => typeof line === 'string') && typeof input.random === 'boolean') {
    return input as unknown as FillRequest;
  }
  throw new Error('填充请求无效');
}

export function assertConfig(config: FillConfig): void {
  const error = configError(config);
  if (error) throw new Error(error);
}
