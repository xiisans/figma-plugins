import type { SelectionChangedMessage } from '../shared/messages';
import { sortByVisualOrder } from '../shared/text';

export function collectTextNodes(selection: readonly SceneNode[]): TextNode[] {
  const nodes = new Map<string, TextNode>();

  const visit = (node: SceneNode): void => {
    if (node.type === 'TEXT') nodes.set(node.id, node);
    if ('children' in node) node.children.forEach(visit);
  };

  selection.forEach(visit);
  return sortTextNodes([...nodes.values()]);
}

export function sortTextNodes(nodes: readonly TextNode[]): TextNode[] {
  return sortByVisualOrder(nodes, (node) => {
    if (node.absoluteBoundingBox) return node.absoluteBoundingBox;
    return {
      x: node.absoluteTransform[0][2],
      y: node.absoluteTransform[1][2],
      width: node.width,
      height: node.height,
    };
  });
}

export function hasInstanceAncestor(node: BaseNode): boolean {
  let parent = node.parent;
  while (parent && parent.type !== 'DOCUMENT') {
    if (parent.type === 'INSTANCE') return true;
    parent = parent.parent;
  }
  return false;
}

export function getSelectionSummary(selection: readonly SceneNode[]): SelectionChangedMessage {
  return {
    type: 'selection-changed',
    selectedCount: selection.length,
    textCount: collectTextNodes(selection).length,
    splitEligible:
      selection.length > 0 &&
      selection.every((node) => node.type === 'TEXT' && !hasInstanceAncestor(node)),
  };
}
