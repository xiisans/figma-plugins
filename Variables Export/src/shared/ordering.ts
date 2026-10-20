import { naturalCompare } from "./normalize";

interface NamedItem {
  name: string;
}

// Keep Figma's sibling positions; only reorder matching numeric name series.
function numericSeriesOrder<T extends NamedItem>(items: T[]): T[] {
  const result = [...items];
  const series = new Map<string, number[]>();
  items.forEach((item, index) => {
    if (!/\d/.test(item.name)) return;
    const key = item.name.replace(/\d+/g, "\u0000");
    const indices = series.get(key) ?? [];
    indices.push(index);
    series.set(key, indices);
  });
  for (const indices of series.values()) {
    const sorted = indices.map((index) => items[index]).sort((a, b) => naturalCompare(a.name, b.name));
    indices.forEach((index, offset) => { result[index] = sorted[offset]; });
  }
  return result;
}

export function orderVariablesByFigma<T extends NamedItem>(variables: T[]): T[] {
  interface Group extends NamedItem {
    children: Map<string, Group>;
    variables: T[];
  }
  const root: Group = { name: "", children: new Map(), variables: [] };
  for (const variable of variables) {
    let group = root;
    for (const name of variable.name.split("/")) {
      let child = group.children.get(name);
      if (!child) {
        child = { name, children: new Map(), variables: [] };
        group.children.set(name, child);
      }
      group = child;
    }
    group.variables.push(variable);
  }
  function flatten(group: Group): T[] {
    return [...group.variables, ...numericSeriesOrder([...group.children.values()]).flatMap(flatten)];
  }
  return flatten(root);
}
