function position(node: SceneNode): { x: number; y: number } {
  return node.absoluteBoundingBox ?? { x: node.absoluteTransform[0][2], y: node.absoluteTransform[1][2] };
}

export function collectTextNodes(roots: readonly SceneNode[]): TextNode[] {
  const visited = new Set<string>();
  const texts: TextNode[] = [];
  const pending = [...roots].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    if (node.removed || visited.has(node.id)) continue;
    visited.add(node.id);
    if (node.type === 'TEXT') texts.push(node);
    else if ('children' in node) pending.push(...[...node.children].reverse());
  }
  return texts;
}

export function sortByPosition(nodes: readonly TextNode[]): TextNode[] {
  const positions = nodes.map((node, index) => ({ node, index, ...position(node) }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.index - b.index);
  const rows: typeof positions[] = [];
  // Anchor rows to their first top edge so the comparator remains transitive.
  for (const entry of positions) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(entry.y - row[0].y) <= 4) row.push(entry);
    else rows.push([entry]);
  }
  return rows.flatMap(row => row.sort((a, b) => a.x - b.x || a.y - b.y || a.index - b.index).map(entry => entry.node));
}

export function isLocked(node: SceneNode): boolean {
  let current: BaseNode | null = node;
  while (current) {
    if ('locked' in current && current.locked) return true;
    current = current.parent;
  }
  return false;
}
