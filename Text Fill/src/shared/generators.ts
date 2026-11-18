import type { FillConfig, FillKind } from './types';
import { assertConfig } from './validation';
import { GIVEN_NAMES, LOCATIONS, NICKNAME_PREFIXES, NICKNAME_SUFFIXES, PARAGRAPHS, SURNAMES } from './data';

export interface GeneratorContext { random?: () => number; now?: Date }
const pad2 = (n: number) => String(n).padStart(2, '0');
export const splitLines = (text: string): string[] => text.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
export const cleanLines = (lines: string[]): string[] => lines.flatMap(splitLines);

export function shuffled<T>(values: readonly T[], random = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function customValues(lines: string[], count: number, randomize: boolean, random = Math.random): string[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('文本数量无效');
  const valid = cleanLines(lines);
  if (!valid.length) return [];
  let cycle = valid;
  return Array.from({ length: count }, (_, index) => {
    const offset = index % valid.length;
    if (randomize && offset === 0) cycle = shuffled(valid, random);
    return cycle[offset];
  });
}

export function generateValues(input: FillConfig, count: number, context: GeneratorContext = {}): string[] {
  assertConfig(input);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('文本数量无效');
  const random = context.random ?? Math.random;
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T,>(items: readonly T[]): T => items[integer(0, items.length - 1)];
  const digits = (length: number) => Array.from({ length }, () => integer(0, 9)).join('');

  if (input.kind === 'sequence') {
    const { start, step, order, padding } = input.config;
    const width = String(Math.abs(start)).length + padding;
    return Array.from({ length: count }, (_, index) => {
      const value = start + index * step * (order === 'asc' ? 1 : -1);
      if (!Number.isSafeInteger(value)) throw new Error('序号超出安全整数范围');
      const number = padding ? String(Math.abs(value)).padStart(width, '0') : String(Math.abs(value));
      return `${value < 0 ? '-' : ''}${number}`;
    });
  }
  if (input.kind === 'date') {
    const year = (context.now ?? new Date()).getFullYear();
    const days = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
    const dates = Array.from({ length: count }, () => integer(0, days - 1))
      .sort((a, b) => input.config.order === 'asc' ? a - b : b - a);
    return dates.map(day => {
      const date = new Date(year, 0, day + 1);
      const month = pad2(date.getMonth() + 1);
      const d = pad2(date.getDate());
      return input.config.format === '文' ? `${year}年${month}月${d}日` : `${year}${input.config.format}${month}${input.config.format}${d}`;
    });
  }

  const generate = (): string => {
    switch (input.kind) {
      case 'name': return pick(SURNAMES) + pick(GIVEN_NAMES);
      case 'nickname': return pick(NICKNAME_PREFIXES) + pick(NICKNAME_SUFFIXES);
      case 'gender': return pick(['男', '女']);
      case 'qq': return String(integer(1, 9)) + digits(integer(4, 9));
      case 'email': return `${pick(['lin', 'chen', 'alex', 'xia', 'ning', 'yu'])}${integer(10, 9999)}@${pick(['example.com', 'example.org', 'example.net'])}`;
      case 'address': return `${pick(LOCATIONS).join('')}${integer(1, 299)}号${integer(1, 8)}栋${integer(101, 2606)}室`;
      case 'number': {
        const { min, max, decimals } = input.config;
        const scale = 10 ** decimals;
        return (integer(Math.ceil(min * scale), Math.floor(max * scale)) / scale).toFixed(decimals);
      }
      case 'time': {
        const hh = pad2(integer(0, 23));
        const mm = pad2(integer(0, 59));
        const ss = pad2(integer(0, 59));
        if (input.config.format === 'HH:MM') return `${hh}:${mm}`;
        if (input.config.format === 'MM:SS') return `${mm}:${ss}`;
        return `${hh}:${mm}:${ss}`;
      }
      case 'phone': {
        const number = pick(['130', '131', '132', '135', '136', '137', '138', '139', '150', '151', '152', '158', '159', '180', '181', '182', '186', '188', '189']) + digits(8);
        if (input.config.format === 'masked') return `${number.slice(0, 3)}****${number.slice(7)}`;
        if (input.config.format === 'spaced') return `${number.slice(0, 3)} ${number.slice(3, 7)} ${number.slice(7)}`;
        return number;
      }
      case 'age': return String(integer(input.config.min, input.config.max));
      case 'paragraph': {
        const { category, min, max } = input.config;
        const length = integer(min, max);
        let value = '';
        while (Array.from(value).length < length) value += pick(PARAGRAPHS[category]);
        return Array.from(value).slice(0, length).join('');
      }
    }
  };
  return Array.from({ length: count }, generate);
}

export const PARAMETER_KINDS: readonly FillKind[] = ['number', 'sequence', 'date', 'time', 'phone', 'age', 'paragraph'];
