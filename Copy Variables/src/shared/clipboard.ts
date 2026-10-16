import type { ClipboardData, StoredAlias, StoredCollection, StoredValue } from './types';
import { variableKey } from './tree';

export function isAlias(value: StoredValue): value is StoredAlias {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'alias';
}

export function filterClipboard(clipboard: ClipboardData, requestedKeys: Iterable<string>): ClipboardData {
  const selected = new Set(requestedKeys);
  const variables = new Map<string, { collection: StoredCollection; index: number }>();

  for (const collection of clipboard.collections) {
    collection.variables.forEach((variable, index) => {
      variables.set(variableKey(collection.name, variable.name), { collection, index });
    });
  }

  const include = new Set<string>();
  const visit = (key: string) => {
    if (include.has(key)) return;
    const entry = variables.get(key);
    if (!entry) return;
    include.add(key);
    const variable = entry.collection.variables[entry.index];
    for (const mode of variable.modes) {
      if (isAlias(mode.value)) visit(variableKey(mode.value.collectionName, mode.value.variableName));
    }
  };

  selected.forEach(visit);

  return {
    ...clipboard,
    collections: clipboard.collections.flatMap((collection) => {
      const kept = collection.variables.filter((variable) => include.has(variableKey(collection.name, variable.name)));
      return kept.length ? [{ ...collection, variables: kept }] : [];
    })
  };
}

export function orderClipboardCollections(clipboard: ClipboardData, collectionOrder: string[]): ClipboardData {
  const positions = new Map(collectionOrder.map((name, index) => [name, index]));
  return {
    ...clipboard,
    collections: [...clipboard.collections].sort((a, b) => {
      const positionA = positions.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const positionB = positions.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return positionA - positionB;
    })
  };
}
