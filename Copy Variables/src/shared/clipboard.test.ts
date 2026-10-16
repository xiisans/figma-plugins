import { describe, expect, it } from 'vitest';
import { filterClipboard, orderClipboardCollections } from './clipboard';
import { variableKey } from './tree';
import type { ClipboardData, StoredCollection, StoredVariable } from './types';

const makeVariable = (name: string, value: StoredVariable['modes'][number]['value']): StoredVariable => ({
  name,
  type: 'COLOR',
  description: '',
  scopes: ['ALL_SCOPES'],
  codeSyntax: {},
  hiddenFromPublishing: false,
  modes: [{ name: 'Default', value }]
});

const makeCollection = (name: string, variables: StoredVariable[]): StoredCollection => ({
  name,
  defaultModeName: 'Default',
  modes: ['Default'],
  hiddenFromPublishing: false,
  variables
});

describe('filterClipboard', () => {
  it('keeps selected variables and recursively includes aliases', () => {
    const data: ClipboardData = {
      version: 1,
      sourceFileName: 'Source',
      sourceFileKey: 'source',
      copiedAt: '2026-01-01T00:00:00.000Z',
      collections: [
        makeCollection('Semantic', [makeVariable('Surface/Primary', { kind: 'alias', collectionName: 'Primitive', variableName: 'Blue/500' })]),
        makeCollection('Primitive', [makeVariable('Blue/500', { r: 0, g: 0.4, b: 1, a: 1 })])
      ]
    };
    const result = filterClipboard(data, [variableKey('Semantic', 'Surface/Primary')]);
    expect(result.collections).toHaveLength(2);
    expect(result.collections.flatMap((item) => item.variables.map((entry) => entry.name))).toEqual(['Surface/Primary', 'Blue/500']);
  });

  it('drops unselected collections', () => {
    const data: ClipboardData = {
      version: 1,
      sourceFileName: 'Source',
      sourceFileKey: null,
      copiedAt: '2026-01-01T00:00:00.000Z',
      collections: [makeCollection('A', [makeVariable('One', 1)]), makeCollection('B', [makeVariable('Two', 2)])]
    };
    const result = filterClipboard(data, [variableKey('B', 'Two')]);
    expect(result.collections.map((item) => item.name)).toEqual(['B']);
  });

  it('does not treat unsupported external values as local alias dependencies', () => {
    const data: ClipboardData = {
      version: 1,
      sourceFileName: 'Source',
      sourceFileKey: null,
      copiedAt: '2026-01-01T00:00:00.000Z',
      collections: [makeCollection('A', [makeVariable('External', { kind: 'unsupported', reason: 'external alias' })])]
    };
    const result = filterClipboard(data, [variableKey('A', 'External')]);
    expect(result.collections[0].variables[0].modes[0].value).toEqual({ kind: 'unsupported', reason: 'external alias' });
  });

  it('uses the collection order displayed by the copy panel', () => {
    const data: ClipboardData = {
      version: 1,
      sourceFileName: 'Source',
      sourceFileKey: null,
      copiedAt: '2026-01-01T00:00:00.000Z',
      collections: [
        makeCollection('Token', [makeVariable('Value', 1)]),
        makeCollection('Color', [makeVariable('Value', 2)]),
        makeCollection('Font', [makeVariable('Value', 3)])
      ]
    };
    const result = orderClipboardCollections(data, ['Color', 'Font', 'Token']);
    expect(result.collections.map((item) => item.name)).toEqual(['Color', 'Font', 'Token']);
  });
});
