import { describe, expect, it } from 'vitest';
import {
  buildSuffixes,
  buildVariableNames,
  compareByCanvasPosition,
  deriveGroupNames,
  parseStrictNumber,
} from './logic';

describe('parseStrictNumber', () => {
  it('accepts signed integers and decimals', () => {
    expect(parseStrictNumber(' -12 ')).toBe(-12);
    expect(parseStrictNumber('0.25')).toBe(0.25);
  });

  it('rejects empty and partially numeric text', () => {
    expect(parseStrictNumber('')).toBeNull();
    expect(parseStrictNumber('12px')).toBeNull();
  });
});

describe('naming helpers', () => {
  it('builds increasing and decreasing suffixes', () => {
    expect(buildSuffixes(3, 10, 5, 'increase')).toEqual([10, 15, 20]);
    expect(buildSuffixes(3, 5, 10, 'decrease')).toEqual([5, -5, -15]);
  });

  it('normalizes the group path', () => {
    expect(buildVariableNames('/color/brand/', 2, 10, 10, 'increase')).toEqual([
      'color/brand/10',
      'color/brand/20',
    ]);
  });
});

describe('collection helpers', () => {
  it('extracts unique group paths', () => {
    expect(deriveGroupNames(['brand/10', 'brand/20', 'semantic/text/10', 'plain'])).toEqual([
      'brand',
      'semantic/text',
    ]);
  });

  it('sorts by y and then x', () => {
    const items = [
      { id: 'c', x: 0, y: 20 },
      { id: 'b', x: 20, y: 10 },
      { id: 'a', x: 10, y: 10 },
    ];
    expect(items.sort(compareByCanvasPosition).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});
