import { describe, expect, it } from 'vitest';
import {
  findLiteralRanges,
  mergeSeparators,
  normalizeExtractedText,
  replaceLiteral,
  sortByVisualOrder,
  splitTextRanges,
  type RectLike,
} from './text';

describe('literal replacement', () => {
  it('finds every non-overlapping literal match', () => {
    expect(findLiteralRanges('a.a.a', '.')).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ]);
  });

  it('does not interpret regular expression characters', () => {
    expect(replaceLiteral('a.*b.*c', '.*', '-')).toBe('a-b-c');
  });

  it('replaces the full string when find is empty', () => {
    expect(replaceLiteral('original', '', 'replacement')).toBe('replacement');
  });

  it('supports deleting all matches', () => {
    expect(replaceLiteral('a-b-c', '-', '')).toBe('abc');
  });
});

describe('split ranges', () => {
  it('matches Chinese and English punctuation', () => {
    expect(splitTextRanges('甲，乙,丙', 'comma', false)).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
    expect(splitTextRanges('甲。乙.丙', 'period', false)).toHaveLength(3);
  });

  it('keeps delimiter runs on the preceding non-empty segment', () => {
    expect(splitTextRanges(',甲,,乙,', 'comma', true)).toEqual([
      { start: 1, end: 4 },
      { start: 4, end: 6 },
    ]);
  });

  it('matches CRLF, LF, tabs, normal spaces and full-width spaces', () => {
    expect(splitTextRanges('甲\r\n乙\n丙', 'newline', false)).toHaveLength(3);
    expect(splitTextRanges('甲 \t　乙', 'space', false)).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 5 },
    ]);
  });

  it('drops empty input and preserves unsplit text', () => {
    expect(splitTextRanges('', 'slash', false)).toEqual([]);
    expect(splitTextRanges('完整文本', 'slash', false)).toEqual([{ start: 0, end: 4 }]);
  });
});

describe('extracted text normalization', () => {
  it('removes blank lines between paragraphs in the same text node', () => {
    expect(normalizeExtractedText('第一段\n\n第二段\n \n第三段')).toBe('第一段\n第二段\n第三段');
  });

  it('normalizes Windows line endings without removing regular line breaks', () => {
    expect(normalizeExtractedText('第一行\r\n第二行\r\n\r\n第三行')).toBe('第一行\n第二行\n第三行');
  });
});

describe('visual order', () => {
  interface Item {
    id: string;
    rect: RectLike | null;
  }

  it('orders rows top-to-bottom and items left-to-right', () => {
    const items: Item[] = [
      { id: 'bottom', rect: { x: 0, y: 40, width: 20, height: 10 } },
      { id: 'top-right', rect: { x: 60, y: 1, width: 20, height: 10 } },
      { id: 'top-left', rect: { x: 0, y: 0, width: 20, height: 12 } },
    ];
    expect(sortByVisualOrder(items, (item) => item.rect).map((item) => item.id)).toEqual([
      'top-left',
      'top-right',
      'bottom',
    ]);
  });

  it('puts items without geometry last in source order', () => {
    const items: Item[] = [
      { id: 'missing-a', rect: null },
      { id: 'placed', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'missing-b', rect: null },
    ];
    expect(sortByVisualOrder(items, (item) => item.rect).map((item) => item.id)).toEqual([
      'placed',
      'missing-a',
      'missing-b',
    ]);
  });

  it('uses the specified extraction separators', () => {
    expect(mergeSeparators.comma).toBe('，');
    expect(mergeSeparators.period).toBe('。');
    expect(mergeSeparators.newline).toBe('\n');
  });
});
