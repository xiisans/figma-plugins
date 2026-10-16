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
  it('keeps collection order supplied by the Figma variables panel', () => {
    const collections = [
      { ...collection([variable('Value')]), name: 'Color' },
      { ...collection([variable('Value')]), name: 'Font' },
      { ...collection([variable('Value')]), name: 'Token' }
    ];
    expect(collections.map(collectionToTree).map((item) => item.name)).toEqual(['Color', 'Font', 'Token']);
  });

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

  it('preserves the source order of non-numeric groups and variables', () => {
    const tree = collectionToTree(collection([
      variable('Zebra/Second'),
      variable('Alpha/Last'),
      variable('Zebra/First')
    ]));
    expect(tree.children.map((item) => item.name)).toEqual(['Zebra', 'Alpha']);
    expect(tree.children[0].variables.map((item) => item.name)).toEqual(['Second', 'First']);
  });

  it('preserves source order across nested groups', () => {
    const tree = collectionToTree(collection([
      variable('Semantic/State Z/Second'),
      variable('Primitive/Blue/500'),
      variable('Semantic/State A/First'),
      variable('Primitive/Gray/100'),
      variable('Semantic/State Z/First')
    ]));
    expect(tree.children.map((item) => item.name)).toEqual(['Semantic', 'Primitive']);
    expect(tree.children[0].children.map((item) => item.name)).toEqual(['State Z', 'State A']);
    expect(tree.children[0].children[0].variables.map((item) => item.name)).toEqual(['Second', 'First']);
    expect(tree.children[1].children.map((item) => item.name)).toEqual(['Blue', 'Gray']);
  });

});
