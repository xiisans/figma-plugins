import { describe, expect, it } from 'vitest';
import { cleanLines, customValues, generateValues, shuffled, splitLines } from '../src/shared/generators';
import { DEFAULT_CONFIGS, FILL_KINDS, type FillConfig } from '../src/shared/types';
import { configError, parseFillRequest } from '../src/shared/validation';

function rng(seed = 42) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
const context = () => ({ random: rng(), now: new Date(2024, 6, 1) });

describe('quick generators', () => {
  it.each(FILL_KINDS)('generates all default %s values locally', kind => {
    const values = generateValues({ kind, config: DEFAULT_CONFIGS[kind] } as FillConfig, 100, context());
    expect(values).toHaveLength(100);
    expect(values.every(value => typeof value === 'string' && value.length > 0)).toBe(true);
  });
  it('defaults to integers from 0 to 100 inclusive', () => {
    expect(DEFAULT_CONFIGS.number).toEqual({ min: 0, max: 100, decimals: 0 });
    const input = { kind: 'number', config: DEFAULT_CONFIGS.number } as const;
    expect(generateValues(input, 100, context()).every(value => /^\d+$/.test(value) && Number(value) <= 100)).toBe(true);
    expect(generateValues(input, 1, { random: () => 0 })).toEqual(['0']);
    expect(generateValues(input, 1, { random: () => 0.9999999 })).toEqual(['100']);
  });
  it('keeps numbers inside the range and retains trailing zeroes', () => {
    const values = generateValues({ kind: 'number', config: { min: -3.45, max: 2.11, decimals: 2 } }, 1000, context());
    for (const value of values) {
      expect(Number(value)).toBeGreaterThanOrEqual(-3.45);
      expect(Number(value)).toBeLessThanOrEqual(2.11);
      expect(value).toMatch(/^-?\d+\.\d{2}$/);
    }
    expect(generateValues({ kind: 'number', config: { min: 0, max: 1, decimals: 2 } }, 1, { random: () => 0 })).toEqual(['0.00']);
    expect(generateValues({ kind: 'number', config: { min: 0, max: 1, decimals: 2 } }, 1, { random: () => 0.9999999 })).toEqual(['1.00']);
  });
  it('only generates representable integers at zero decimal places', () => {
    const values = generateValues({ kind: 'number', config: { min: 1.1, max: 4.9, decimals: 0 } }, 100, context());
    expect(values.every(value => ['2', '3', '4'].includes(value))).toBe(true);
  });
  it('generates sequences with stable width, intervals and signs', () => {
    expect(generateValues({ kind: 'sequence', config: { start: 9, step: 2, padding: 2, order: 'asc' } }, 3)).toEqual(['009', '011', '013']);
    expect(generateValues({ kind: 'sequence', config: { start: 1, step: 2, padding: 1, order: 'desc' } }, 3)).toEqual(['01', '-01', '-03']);
    expect(generateValues({ kind: 'sequence', config: { start: 9, step: 1, padding: 0, order: 'asc' } }, 3)).toEqual(['9', '10', '11']);
  });
  it('sorts dates before formatting and includes valid leap-year dates', () => {
    for (const format of ['-', '/', '文'] as const) {
      const asc = generateValues({ kind: 'date', config: { format, order: 'asc' } }, 100, context());
      const desc = generateValues({ kind: 'date', config: { format, order: 'desc' } }, 100, context());
      expect(asc).toEqual([...asc].sort());
      expect(desc).toEqual([...asc].reverse());
      expect(asc.every(value => value.startsWith('2024'))).toBe(true);
    }
    expect(generateValues({ kind: 'date', config: { format: '-', order: 'asc' } }, 1, { now: new Date(2024, 0, 1), random: () => 59 / 366 })).toEqual(['2024-02-29']);
    expect(generateValues({ kind: 'date', config: { format: '-', order: 'asc' } }, 1, { now: new Date(2023, 0, 1), random: () => 0.99999 })).toEqual(['2023-12-31']);
  });
  it.each(['HH:MM:SS', 'HH:MM', 'MM:SS'] as const)('generates legal %s time values', format => {
    const values = generateValues({ kind: 'time', config: { format } }, 100, context());
    const pattern = format === 'HH:MM:SS' ? /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/ : format === 'HH:MM' ? /^([01]\d|2[0-3]):[0-5]\d$/ : /^[0-5]\d:[0-5]\d$/;
    expect(values.every(value => pattern.test(value))).toBe(true);
  });
  it.each([
    ['regular', /^1[3-9]\d{9}$/], ['masked', /^1[3-9]\d\*{4}\d{4}$/], ['spaced', /^1[3-9]\d \d{4} \d{4}$/],
  ] as const)('generates %s mobile numbers', (format, pattern) => {
    expect(generateValues({ kind: 'phone', config: { format } }, 100, context()).every(value => pattern.test(value))).toBe(true);
  });
  it('keeps age bounds inclusive', () => {
    expect(generateValues({ kind: 'age', config: { min: 18, max: 18 } }, 3)).toEqual(['18', '18', '18']);
    expect(generateValues({ kind: 'age', config: { min: 0, max: 150 } }, 100, context()).every(value => Number(value) >= 0 && Number(value) <= 150)).toBe(true);
  });
  it.each(['comment', 'news', 'science'] as const)('keeps %s paragraphs within the requested character count', category => {
    for (const min of [1, 20, 100]) {
      const values = generateValues({ kind: 'paragraph', config: { category, min, max: min + 20 } }, 50, context());
      expect(values.every(value => Array.from(value).length >= min && Array.from(value).length <= min + 20)).toBe(true);
    }
    expect(Array.from(generateValues({ kind: 'paragraph', config: { category, min: 10000, max: 10000 } }, 1, context())[0])).toHaveLength(10000);
  });
  it('creates plausible identifiers without a network request', () => {
    expect(generateValues({ kind: 'qq', config: {} }, 100, context()).every(value => /^[1-9]\d{4,9}$/.test(value))).toBe(true);
    expect(generateValues({ kind: 'email', config: {} }, 100, context()).every(value => /^[a-z]+\d+@example\.(com|org|net)$/.test(value))).toBe(true);
  });
  it('handles empty batches', () => expect(generateValues({ kind: 'name', config: {} }, 0)).toEqual([]));
});

describe('custom values', () => {
  it('normalizes line endings, filters blank lines and preserves content spacing', () => {
    expect(splitLines('  first  \r\n\n\t\r\nsecond\rthird\n')).toEqual(['  first  ', 'second', 'third']);
    expect(cleanLines(['one\ntwo', '', '  three '])).toEqual(['one', 'two', '  three ']);
  });
  it('cycles short input in order and ignores excess lines', () => {
    expect(customValues(['a', '', 'b'], 5, false)).toEqual(['a', 'b', 'a', 'b', 'a']);
    expect(customValues(['a', 'b', 'c'], 2, false)).toEqual(['a', 'b']);
  });
  it('handles empty input, zero targets and a single prepared line', () => {
    expect(customValues(['  '], 2, true)).toEqual([]);
    expect(customValues([], 5, false)).toEqual([]);
    expect(customValues(['a'], 0, true)).toEqual([]);
    expect(customValues(['  one  '], 3, false)).toEqual(['  one  ', '  one  ', '  one  ']);
    expect(customValues(['one'], 3, true)).toEqual(['one', 'one', 'one']);
  });
  it('shuffles every cycle without mutating input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const output = customValues(input, 10, true, () => 0);
    expect(output).toEqual(['b', 'c', 'd', 'a', 'b', 'c', 'd', 'a', 'b', 'c']);
    expect(input).toEqual(['a', 'b', 'c', 'd']);
    expect(shuffled([], rng())).toEqual([]);
  });
  it('draws a new random order for each round rather than repeating one shuffled list', () => {
    const draws = [0, 0.9999999, 0];
    expect(customValues(['a', 'b'], 5, true, () => draws.shift()!)).toEqual(['b', 'a', 'a', 'b', 'b']);
  });
  it('preserves duplicate line occurrences in every random cycle', () => {
    const input = ['a', 'a', 'b'];
    const output = customValues(input, 6, true, rng());
    expect(output.slice(0, 3).sort()).toEqual(input);
    expect(output.slice(3).sort()).toEqual(input);
  });
  it.each([-1, 1.5, NaN, Infinity])('rejects invalid custom target count %s', count => {
    expect(() => customValues(['a'], count, false)).toThrow('文本数量无效');
  });
});

describe('validation at the thread boundary', () => {
  it.each([
    { kind: 'number', config: { min: 9, max: 1, decimals: 2 } },
    { kind: 'number', config: { min: 1, max: 9, decimals: -1 } },
    { kind: 'number', config: { min: NaN, max: Infinity, decimals: 2 } },
    { kind: 'number', config: { min: 1.1, max: 1.2, decimals: 0 } },
    { kind: 'sequence', config: { start: 1, step: 0, padding: 0, order: 'asc' } },
    { kind: 'sequence', config: { start: 1, step: 1, padding: 13, order: 'asc' } },
    { kind: 'date', config: { format: '-', order: 'unknown' } },
    { kind: 'phone', config: { format: '-' } },
    { kind: 'time', config: { format: 'invalid' } },
    { kind: 'age', config: { min: -1, max: 200 } },
    { kind: 'paragraph', config: { category: 'comment', min: 100, max: 2 } },
    { kind: 'paragraph', config: { category: 'unknown', min: 1, max: 2 } },
  ])('rejects invalid $kind settings', input => expect(configError(input)).toBeTruthy());
  it('rejects malformed messages', () => {
    for (const message of [null, [], {}, { type: 'apply-custom-fill', requestId: 'x', lines: [4], random: true }, { type: 'apply-quick-fill', requestId: 'x', kind: 'unknown', config: {} }]) {
      expect(() => parseFillRequest(message)).toThrow();
    }
  });
  it('accepts a discriminated request', () => {
    const input = { type: 'apply-quick-fill', requestId: '1', kind: 'age', config: { min: 18, max: 60 } };
    expect(parseFillRequest(input)).toEqual(input);
  });
});
