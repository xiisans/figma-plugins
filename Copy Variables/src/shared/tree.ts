import type { StoredCollection, TreeCollection, TreeGroup, TreeVariable } from './types';

const splitPath = (name: string) => name.split('/').filter((part) => part.length > 0);

export function variableKey(collectionName: string, variableName: string): string {
  const parts = splitPath(variableName);
  let key = `collection:${collectionName}`;
  for (const part of parts.slice(0, -1)) key += `/group:${part}`;
  return `${key}/variable:${variableName}`;
}

export function collectionToTree(collection: StoredCollection): TreeCollection {
  const root: TreeCollection = {
    kind: 'collection',
    key: `collection:${collection.name}`,
    name: collection.name,
    children: [],
    variables: [],
    collection
  };

  for (const variable of collection.variables) {
    const parts = splitPath(variable.name);
    if (!parts.length) continue;
    const variableName = parts.pop() as string;
    let groups = root.children;
    let parentPath = `collection:${collection.name}`;
    for (const part of parts) {
      const key = `${parentPath}/group:${part}`;
      let group = groups.find((candidate) => candidate.key === key);
      if (!group) {
        group = { kind: 'group', key, name: part, children: [], variables: [] };
        groups.push(group);
      }
      parentPath = key;
      groups = group.children;
    }
    const key = variableKey(collection.name, variable.name);
    const node: TreeVariable = { kind: 'variable', key, name: variableName, fullName: variable.name, variable };
    if (parts.length) {
      const group = findGroup(root.children, parentPath);
      group?.variables.push(node);
    } else {
      root.variables.push(node);
    }
  }
  sortTree(root);
  return root;
}

function findGroup(groups: TreeGroup[], key: string): TreeGroup | undefined {
  for (const group of groups) {
    if (group.key === key) return group;
    const nested = findGroup(group.children, key);
    if (nested) return nested;
  }
  return undefined;
}

function compareNames(a: string, b: string): number {
  const isNumericA = /^\d+$/.test(a);
  const isNumericB = /^\d+$/.test(b);

  if (isNumericA && isNumericB) {
    const normalizedA = a.replace(/^0+(?=\d)/, '');
    const normalizedB = b.replace(/^0+(?=\d)/, '');
    if (normalizedA.length !== normalizedB.length) return normalizedA.length - normalizedB.length;
    const numericOrder = normalizedA.localeCompare(normalizedB);
    if (numericOrder !== 0) return numericOrder;
  }

  return a.localeCompare(b, 'zh-CN');
}

function sortTree(node: TreeCollection | TreeGroup) {
  node.children.sort((a, b) => compareNames(a.name, b.name));
  node.variables.sort((a, b) => compareNames(a.name, b.name));
  node.children.forEach(sortTree);
}

export function flattenVariableKeys(node: TreeCollection | TreeGroup): string[] {
  return [
    ...node.variables.map((variable) => variable.key),
    ...node.children.flatMap(flattenVariableKeys)
  ];
}

export function allTreeKeys(node: TreeCollection | TreeGroup): string[] {
  return [node.key, ...node.children.flatMap((child) => allTreeKeys(child)), ...node.variables.map((variable) => variable.key)];
}

export function selectedVariableKeys(nodes: TreeCollection[], selected: Set<string>): Set<string> {
  const output = new Set<string>();
  for (const collection of nodes) {
    for (const variable of flattenVariables(collection)) {
      if (selected.has(variable.key)) output.add(variable.key);
    }
  }
  return output;
}

function flattenVariables(node: TreeCollection | TreeGroup): TreeVariable[] {
  return [...node.variables, ...node.children.flatMap(flattenVariables)];
}
