import type { UiRequest } from '../shared/messages';
import { findLiteralRanges, mergeSeparators, normalizeExtractedText, splitTextRanges } from '../shared/text';
import { collectTextNodes, hasInstanceAncestor, sortTextNodes } from './selection';

type ReplaceRequest = Extract<UiRequest, { type: 'replace' }>;
type ExtractRequest = Extract<UiRequest, { type: 'extract' }>;
type SplitRequest = Extract<UiRequest, { type: 'split' }>;
type WritableParent = BaseNode & ChildrenMixin;

export interface OperationOutcome {
  message: string;
  extractedText?: string;
}

function formatFont(font: FontName): string {
  return `${font.family} ${font.style}`;
}

async function loadFonts(nodes: readonly TextNode[]): Promise<void> {
  const fonts = new Map<string, FontName>();

  for (const node of nodes) {
    if (node.hasMissingFont) throw new Error(`图层“${node.name}”包含缺失字体`);

    const nodeFonts = node.characters.length
      ? node.getRangeAllFontNames(0, node.characters.length)
      : node.fontName === figma.mixed
        ? []
        : [node.fontName];

    for (const font of nodeFonts) fonts.set(`${font.family}\u0000${font.style}`, font);
  }

  try {
    await Promise.all([...fonts.values()].map((font) => figma.loadFontAsync(font)));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const names = [...fonts.values()].map(formatFont).join('、');
    throw new Error(`字体加载失败：${detail || names}`);
  }
}

function applyLiteralReplacement(node: TextNode, find: string, replacement: string): void {
  const ranges = findLiteralRanges(node.characters, find);
  if (!find || (ranges.length === 1 && ranges[0].start === 0 && ranges[0].end === node.characters.length)) {
    node.characters = replacement;
    return;
  }

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    node.deleteCharacters(range.start, range.end);
    if (replacement) {
      const useStyle = range.start > 0 ? 'BEFORE' : 'AFTER';
      node.insertCharacters(range.start, replacement, useStyle);
    }
  }
}

export async function replaceText(request: ReplaceRequest): Promise<OperationOutcome> {
  const nodes = collectTextNodes(figma.currentPage.selection);
  if (!nodes.length) throw new Error('请选择包含文本的元素');
  if (!request.find && !request.replacement) throw new Error('请输入查找或替换文本');

  const matched = nodes.filter((node) => !request.find || node.characters.includes(request.find));
  const affected = matched.filter((node) => {
    if (node.removed) return false;
    if (!request.find) return node.characters !== request.replacement;
    return node.characters !== node.characters.split(request.find).join(request.replacement);
  });

  if (!affected.length) return { message: matched.length ? '文本无需更改' : '未找到匹配文本' };

  await loadFonts(affected);
  for (const node of affected) {
    applyLiteralReplacement(node, request.find, request.replacement);
    if (request.syncLayerName) node.name = node.characters;
  }

  figma.commitUndo();
  return { message: `已替换 ${affected.length} 个文本图层` };
}

export function extractText(request: ExtractRequest): OperationOutcome {
  const values = collectTextNodes(figma.currentPage.selection)
    .map((node) => normalizeExtractedText(node.characters))
    .filter((value) => value.length > 0);

  if (!values.length) throw new Error('未提取到文本');
  const extractedText = values.join(mergeSeparators[request.rule]);
  return { message: '已完成提取', extractedText };
}

function isWritableParent(node: BaseNode | null): node is WritableParent {
  return Boolean(node && 'appendChild' in node);
}

function parentChain(node: BaseNode): WritableParent[] {
  const parents: WritableParent[] = [];
  let parent = node.parent;
  while (parent && parent.type !== 'DOCUMENT') {
    if (isWritableParent(parent)) parents.push(parent);
    parent = parent.parent;
  }
  return parents;
}

function getCommonParent(nodes: readonly TextNode[]): WritableParent {
  const chains = nodes.map(parentChain);
  const common = chains[0].find((candidate) =>
    chains.slice(1).every((chain) => chain.some((parent) => parent.id === candidate.id)),
  );
  if (!common) throw new Error('无法确定拆分画板的共同父级');
  return common;
}

function frameChain(node: BaseNode): FrameNode[] {
  const frames: FrameNode[] = [];
  let parent = node.parent;
  while (parent && parent.type !== 'DOCUMENT') {
    if (parent.type === 'FRAME') frames.push(parent);
    parent = parent.parent;
  }
  return frames;
}

function getCommonFrame(nodes: readonly TextNode[]): FrameNode | null {
  const chains = nodes.map(frameChain);
  return (
    chains[0].find((candidate) =>
      chains.slice(1).every((chain) => chain.some((frame) => frame.id === candidate.id)),
    ) ?? null
  );
}

function getSelectionBounds(nodes: readonly TextNode[]): Rect {
  const rects = nodes.map((node) => node.absoluteBoundingBox).filter((rect): rect is Rect => rect !== null);
  if (!rects.length) throw new Error('无法读取所选文本的位置');

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function absoluteToLocal(parent: WritableParent, x: number, y: number): { x: number; y: number } {
  if (parent.type === 'PAGE') return { x, y };
  if (!('absoluteTransform' in parent)) return { x, y };

  const [[a, c, tx], [b, d, ty]] = parent.absoluteTransform;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < Number.EPSILON) throw new Error('父级坐标变换不可逆');

  const offsetX = x - tx;
  const offsetY = y - ty;
  return {
    x: (d * offsetX - c * offsetY) / determinant,
    y: (-b * offsetX + a * offsetY) / determinant,
  };
}

function parentUsesAutoLayout(parent: WritableParent): boolean {
  return 'layoutMode' in parent && parent.layoutMode !== 'NONE';
}

function configureLayout(frame: FrameNode, request: SplitRequest): void {
  frame.layoutMode = request.direction === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';
  frame.itemSpacing = request.spacing;
}

function configureGeneratedFrame(frame: FrameNode, request: SplitRequest): void {
  frame.name = '文本拆分';
  frame.fills = [];
  frame.strokes = [];
  frame.clipsContent = false;
  configureLayout(frame, request);
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.paddingTop = 0;
  frame.paddingRight = 0;
  frame.paddingBottom = 0;
  frame.paddingLeft = 0;
}

function trimCloneToRange(clone: TextNode, start: number, end: number): void {
  const originalLength = clone.characters.length;
  if (end < originalLength) clone.deleteCharacters(end, originalLength);
  if (start > 0) clone.deleteCharacters(0, start);
}

function appendSegments(
  sourceRanges: ReadonlyArray<{ source: TextNode; ranges: ReadonlyArray<{ start: number; end: number }> }>,
  container: FrameNode,
): TextNode[] {
  const created: TextNode[] = [];

  try {
    for (const { source, ranges } of sourceRanges) {
      for (const range of ranges) {
        const clone = source.clone();
        try {
          container.appendChild(clone);
          trimCloneToRange(clone, range.start, range.end);
          clone.name = clone.characters;
          clone.rotation = 0;
          clone.layoutPositioning = 'AUTO';
          created.push(clone);
        } catch (error) {
          if (!clone.removed) clone.remove();
          throw error;
        }
      }
    }
    return created;
  } catch (error) {
    created.forEach((node) => {
      if (!node.removed) node.remove();
    });
    throw error;
  }
}

function finishSplit(sources: readonly TextNode[], container: FrameNode, segmentCount: number): OperationOutcome {
  sources.forEach((source) => source.remove());
  figma.currentPage.selection = [container];
  figma.commitUndo();
  return { message: `已拆分为 ${segmentCount} 个文本图层` };
}

export async function splitText(request: SplitRequest): Promise<OperationOutcome> {
  const selection = figma.currentPage.selection;
  if (!selection.length || !selection.every((node) => node.type === 'TEXT')) {
    throw new Error('请选择纯文本图层');
  }

  const sources = sortTextNodes(selection as readonly TextNode[]);
  if (sources.some(hasInstanceAncestor)) throw new Error('实例内文本无法拆分，请先分离实例');
  if (sources.some((node) => node.removed)) throw new Error('所选文本已不存在');

  const sourceRanges = sources.map((source) => ({
    source,
    ranges: splitTextRanges(source.characters, request.delimiter, request.keepDelimiter),
  }));
  const segmentCount = sourceRanges.reduce((total, entry) => total + entry.ranges.length, 0);
  if (!segmentCount) throw new Error('拆分后没有可生成的文本');

  await loadFonts(sources);
  const commonFrame = getCommonFrame(sources);
  if (commonFrame) {
    const previousLayoutMode = commonFrame.layoutMode;
    const previousItemSpacing = commonFrame.itemSpacing;
    let completed = false;

    try {
      configureLayout(commonFrame, request);
      appendSegments(sourceRanges, commonFrame);
      const outcome = finishSplit(sources, commonFrame, segmentCount);
      completed = true;
      return outcome;
    } finally {
      if (!completed) {
        commonFrame.layoutMode = previousLayoutMode;
        if (previousLayoutMode !== 'NONE') commonFrame.itemSpacing = previousItemSpacing;
      }
    }
  }

  const parent = getCommonParent(sources);
  const bounds = getSelectionBounds(sources);
  const position = absoluteToLocal(parent, bounds.x, bounds.y);
  const frame = figma.createFrame();
  let completed = false;

  try {
    configureGeneratedFrame(frame, request);
    parent.appendChild(frame);
    if (parentUsesAutoLayout(parent)) frame.layoutPositioning = 'ABSOLUTE';
    frame.x = position.x;
    frame.y = position.y;
    appendSegments(sourceRanges, frame);
    const outcome = finishSplit(sources, frame, segmentCount);
    completed = true;
    return outcome;
  } finally {
    if (!completed && !frame.removed) frame.remove();
  }
}
