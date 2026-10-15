import { describe, expect, it } from 'vitest';
import { collectionToTree, flattenVariableKeys, variableKey } from './tree';
import type { StoredCollection, StoredVariable } from './types';

const variable = (name: string): StoredVariable => ({
  name,
  type: 'COLOR',
  description: '',
  scopes: ['ALL_SCOPES'],
  codeSyntax: {},
  hiddenFromPublishing: false,
  modes: [{ name: '默认', value: { r: 1, g: 0, b: 0, a: 1 } }]
});

const collection = (variables: StoredVariable[]): StoredCollection => ({
  name: '基础',
  defaultModeName: '默认',
  modes: ['默认'],
  hiddenFromPublishing: false,
  variables
});

describe('collectionToTree', () => {
  it('creates collection, nested group and variable levels from slash names', () => {
    const tree = collectionToTree(collection([variable('颜色/品牌/主色'), variable('间距')]));
    expect(tree.children[0].name).toBe('颜色');
    expect(tree.children[0].children[0].name).toBe('品牌');
    expect(tree.children[0].children[0].variables[0].name).toBe('主色');
    expect(tree.variables[0].name).toBe('间距');
    expect(flattenVariableKeys(tree)).toHaveLength(2);
  });

  it('builds stable variable keys', () => {
    expect(variableKey('基础', '颜色/品牌/主色')).toBe('collection:基础/group:颜色/group:品牌/variable:颜色/品牌/主色');
  });

  it('preserves spaces in group names', () => {
    const tree = collectionToTree(collection([variable(' Brand Colors /Primary')]));
    expect(tree.children[0].name).toBe(' Brand Colors ');
  });

  it('sorts purely numeric variable names by their numeric value', () => {
    const tree = collectionToTree(collection([
      variable('Blue/100'),
      variable('Blue/10'),
      variable('Blue/70'),
      variable('Blue/1000'),
      variable('Blue/2')
    ]));
    expect(tree.children[0].variables.map((item) => item.name)).toEqual(['2', '10', '70', '100', '1000']);
  });

  it('sorts purely numeric group names by their numeric value', () => {
    const tree = collectionToTree(collection([
      variable('100/Value'),
      variable('10/Value'),
      variable('2/Value')
    ]));
    expect(tree.children.map((item) => item.name)).toEqual(['2', '10', '100']);
  });
});
