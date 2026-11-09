import type { MergeRule, SplitDelimiter } from './messages';

export interface TextRange {
  start: number;
  end: number;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const mergeSeparators: Record<MergeRule, string> = {
  none: '',
  newline: '\n',
  space: ' ',
  comma: '，',
  period: '。',
  slash: '/',
};

const delimiterPatterns: Record<SplitDelimiter, RegExp> = {
  newline: /\r\n?|\n/g,
  space: /[ \t\u3000]+/g,
  comma: /[,，]+/g,
  period: /[.。]+/g,
  slash: /[\/／]+/g,
};

export function findLiteralRanges(value: string, find: string): TextRange[] {
  if (!find) return value ? [{ start: 0, end: value.length }] : [];

  const ranges: TextRange[] = [];
  let start = 0;
  while (start <= value.length - find.length) {
    const index = value.indexOf(find, start);
    if (index < 0) break;
    ranges.push({ start: index, end: index + find.length });
    start = index + find.length;
  }
  return ranges;
}

export function replaceLiteral(value: string, find: string, replacement: string): string {
  if (!find) return replacement;
  const ranges = findLiteralRanges(value, find);
  if (!ranges.length) return value;

  let output = value;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    output = `${output.slice(0, range.start)}${replacement}${output.slice(range.end)}`;
  }
  return output;
}

export function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t\u3000]*\n+/g, '\n');
}

export function splitTextRanges(
  value: string,
  delimiter: SplitDelimiter,
  keepDelimiter: boolean,
): TextRange[] {
  if (!value) return [];

  const expression = new RegExp(delimiterPatterns[delimiter].source, 'g');
  const ranges: TextRange[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(value))) {
    const delimiterStart = match.index;
    const delimiterEnd = delimiterStart + match[0].length;

    if (delimiterStart > cursor) {
      ranges.push({
        start: cursor,
        end: keepDelimiter ? delimiterEnd : delimiterStart,
      });
    } else if (keepDelimiter && ranges.length > 0) {
      ranges[ranges.length - 1].end = delimiterEnd;
    }

    cursor = delimiterEnd;
  }

  if (cursor < value.length) ranges.push({ start: cursor, end: value.length });
  return ranges.filter((range) => range.end > range.start);
}

export function sortByVisualOrder<T>(items: readonly T[], getRect: (item: T) => RectLike | null): T[] {
  const positioned = items
    .map((item, index) => ({ item, index, rect: getRect(item) }))
    .filter((entry): entry is { item: T; index: number; rect: RectLike } => entry.rect !== null)
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.index - b.index);

  const rows: Array<{ top: number; bottom: number; entries: typeof positioned }> = [];
  for (const entry of positioned) {
    let bestRow: (typeof rows)[number] | undefined;
    let bestOverlap = 0;

    for (const row of rows) {
      const overlap = Math.max(0, Math.min(row.bottom, entry.rect.y + entry.rect.height) - Math.max(row.top, entry.rect.y));
      const threshold = Math.min(row.bottom - row.top, entry.rect.height) * 0.5;
      if (overlap >= threshold && overlap > bestOverlap) {
        bestRow = row;
        bestOverlap = overlap;
      }
    }

    if (bestRow) {
      bestRow.entries.push(entry);
      bestRow.top = Math.min(bestRow.top, entry.rect.y);
      bestRow.bottom = Math.max(bestRow.bottom, entry.rect.y + entry.rect.height);
    } else {
      rows.push({
        top: entry.rect.y,
        bottom: entry.rect.y + entry.rect.height,
        entries: [entry],
      });
    }
  }

  rows.sort((a, b) => a.top - b.top);
  const ordered = rows.flatMap((row) =>
    row.entries.sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y || a.index - b.index),
  );
  const positionedIndexes = new Set(ordered.map((entry) => entry.index));
  const unpositioned = items
    .map((item, index) => ({ item, index }))
    .filter((entry) => !positionedIndexes.has(entry.index));

  return [...ordered.map((entry) => entry.item), ...unpositioned.map((entry) => entry.item)];
}
