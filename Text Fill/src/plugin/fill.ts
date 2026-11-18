import { customValues, generateValues, type GeneratorContext } from '../shared/generators';
import { parseFillRequest } from '../shared/validation';
import type { FillResult } from '../shared/types';
import { collectTextNodes, isLocked, sortByPosition } from './selection';

export interface FillHost {
  loadFontAsync(font: FontName): Promise<void>;
  mixed: symbol;
}

export async function applyFill(host: FillHost, roots: readonly SceneNode[], input: unknown, context?: GeneratorContext): Promise<FillResult> {
  const result: FillResult = { type: 'fill-result', requestId: '', updated: 0, skipped: 0 };
  if (typeof input === 'object' && input && 'requestId' in input && typeof input.requestId === 'string') {
    result.requestId = input.requestId;
  }
  try {
    const request = parseFillRequest(input);
    const nodes = sortByPosition(collectTextNodes(roots));
    if (!nodes.length) throw new Error('请先选择包含文本的图层');
    const values = request.type === 'apply-quick-fill'
      ? generateValues(request, nodes.length, context)
      : customValues(request.lines, nodes.length, request.random, context?.random);
    if (!values.length) throw new Error('请输入非空文本');
    const fonts = new Map<string, Promise<void>>();
    const errors = new Set<string>();
    for (let index = 0; index < values.length; index++) {
      const node = nodes[index];
      if (node.removed || isLocked(node)) {
        result.skipped++;
        errors.add('部分图层已锁定或被移除');
        continue;
      }
      try {
        if (node.hasMissingFont) throw new Error('missing-font');
        const names = node.characters.length
          ? node.getRangeAllFontNames(0, node.characters.length)
          : node.fontName === host.mixed ? [] : [node.fontName as FontName];
        if (!names.length) throw new Error('missing-font');
        await Promise.all(names.map(font => {
          const key = JSON.stringify(font);
          if (!fonts.has(key)) fonts.set(key, host.loadFontAsync(font));
          return fonts.get(key)!;
        }));
        if (node.removed || isLocked(node)) throw new Error('node-unavailable');
        // Only replace characters: Figma keeps the node and its existing formatting.
        node.characters = values[index];
        result.updated++;
      } catch (error) {
        result.skipped++;
        errors.add(error instanceof Error && error.message === 'missing-font'
          ? '部分文本缺少可用字体' : '部分字体无法加载或图层不可编辑');
      }
    }
    if (errors.size) result.error = Array.from(errors).join('；');
  } catch (error) {
    result.error = error instanceof Error ? error.message : '填充失败，请重试';
  }
  return result;
}
