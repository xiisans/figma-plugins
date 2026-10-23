import { describe, expect, it } from 'vitest';
import { buildSuffixes, buildVariableNames, deriveGroupNames, normalizeGroupName } from './naming';

describe('variable naming', () => {
  it('normalizes nested group paths', () => {
    expect(normalizeGroupName(' / color / brand / ')).toBe('color/brand');
  });

  it('creates fixed ten-point suffixes', () => {
    expect(buildSuffixes(3)).toEqual([10, 20, 30]);
    expect(buildVariableNames('color/blue', 3)).toEqual(['color/blue/10', 'color/blue/20', 'color/blue/30']);
  });

  it('rejects an empty group and derives existing groups', () => {
    expect(() => buildVariableNames(' / ', 2)).toThrow('请输入变量分组名称');
    expect(deriveGroupNames(['brand/10', 'brand/20', 'semantic/text/10', 'plain'])).toEqual(['brand', 'semantic/text']);
  });
});
