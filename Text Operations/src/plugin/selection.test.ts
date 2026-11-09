import { describe, expect, it } from 'vitest';
import { collectTextNodes, getSelectionSummary } from './selection';

function textNode(id: string, x: number, y: number): TextNode {
  return {
    id,
    type: 'TEXT',
    absoluteBoundingBox: { x, y, width: 20, height: 10 },
    absoluteTransform: [
      [1, 0, x],
      [0, 1, y],
    ],
    width: 20,
    height: 10,
    parent: null,
  } as unknown as TextNode;
}

describe('selection traversal', () => {
  it('collects nested text, removes duplicate selections and visually sorts', () => {
    const top = textNode('top', 20, 0);
    const bottom = textNode('bottom', 0, 40);
    const frame = {
      id: 'frame',
      type: 'FRAME',
      children: [bottom, top],
      parent: null,
    } as unknown as FrameNode;

    expect(collectTextNodes([frame, top]).map((node) => node.id)).toEqual(['top', 'bottom']);
  });

  it('requires direct text selections for splitting', () => {
    const text = textNode('text', 0, 0);
    expect(getSelectionSummary([text]).splitEligible).toBe(true);

    const frame = {
      id: 'frame',
      type: 'FRAME',
      children: [text],
      parent: null,
    } as unknown as FrameNode;
    expect(getSelectionSummary([frame]).splitEligible).toBe(false);
  });
});
