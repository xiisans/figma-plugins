import type { Direction, Position } from './types';

export const INVALID_SELECTION_MESSAGE =
  '请保证选中的元素均为填充画板或均为非空文本';

export function parseStrictNumber(value: string): number | null {
  const normalized = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function compareByCanvasPosition<T extends Position>(a: T, b: T): number {
  return a.y - b.y || a.x - b.x;
}

export function buildSuffixes(
  count: number,
  start: number,
  step: number,
  direction: Direction,
): number[] {
  const multiplier = direction === 'increase' ? 1 : -1;
  return Array.from({ length: count }, (_, index) => start + index * step * multiplier);
}

export function deriveGroupNames(variableNames: string[]): string[] {
  const groups = new Set<string>();

  for (const name of variableNames) {
    const separatorIndex = name.lastIndexOf('/');
    if (separatorIndex > 0) {
      groups.add(name.slice(0, separatorIndex));
    }
  }

  return [...groups].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function buildVariableNames(
  groupName: string,
  count: number,
  start: number,
  step: number,
  direction: Direction,
): string[] {
  const group = groupName.trim().replace(/^\/+|\/+$/g, '');
  return buildSuffixes(count, start, step, direction).map(
    (suffix) => `${group}/${suffix}`,
  );
}
