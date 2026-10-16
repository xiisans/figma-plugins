import type { PluginToUIMessage, SelectionSnapshot, UIToPluginMessage } from "./shared/messages";
import { buildRenameResults, sortTargets, type RenameTarget } from "./shared/rename";
import { buildTextResults, type TextTarget } from "./shared/text";

const SUPPORTED_NODE_TYPES = new Set<SceneNode["type"]>([
  "FRAME",
  "SECTION",
  "COMPONENT",
  "COMPONENT_SET"
]);

figma.showUI(__html__, {
  width: 360,
  height: 480,
  themeColors: true
});

figma.ui.onmessage = async (message: UIToPluginMessage) => {
  if (message.type === "UI_READY") {
    sendSelection();
    return;
  }

  if (message.type === "EXECUTE_RENAME") {
    await executeRename(message);
  }
};

figma.on("selectionchange", sendSelection);

function sendSelection(): void {
  postToUI({ type: "SELECTION_CHANGED", payload: getSelectionSnapshot() });
}

function getSelectionSnapshot(): SelectionSnapshot {
  const selection = figma.currentPage.selection;
  const targets: RenameTarget[] = [];
  const textTargets: TextTarget[] = [];

  selection.forEach((node, sourceIndex) => {
    if (SUPPORTED_NODE_TYPES.has(node.type)) targets.push(toRenameTarget(node, sourceIndex));
  });

  // Visit every selected subtree once, even if both an ancestor and a descendant are selected.
  const pending: SceneNode[] = [...selection].reverse();
  const visited = new Set<string>();
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    if (node.type === "TEXT") {
      textTargets.push({ ...toRenameTarget(node, textTargets.length), characters: node.characters });
    }
    if ("children" in node) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        pending.push(node.children[index]);
      }
    }
  }

  return {
    targets: sortTargets(targets),
    textTargets,
    ignoredCount: selection.length - targets.length,
    selectionCount: selection.length
  };
}

function toRenameTarget(node: SceneNode, sourceIndex: number): RenameTarget {
  const box = node.absoluteBoundingBox;
  return {
    id: node.id,
    type: node.type,
    originalName: node.name,
    x: box?.x ?? node.x,
    y: box?.y ?? node.y,
    sourceIndex
  };
}

async function executeRename(message: Extract<UIToPluginMessage, { type: "EXECUTE_RENAME" }>): Promise<void> {
  try {
    const snapshot = getSelectionSnapshot();
    if (message.payload.mode === "text") {
      const changedCount = await executeTextChanges(snapshot.textTargets, message.payload);
      figma.commitUndo();
      figma.notify(`已更新 ${changedCount} 个文本图层`);
      postToUI({ type: "RENAME_SUCCEEDED", requestId: message.requestId, payload: { changedCount, skippedCount: 0 } });
      sendSelection();
      return;
    }
    if (snapshot.targets.length === 0) {
      throw new Error("请先选择需要重命名的画板");
    }

    const results = buildRenameResults(
      snapshot.targets,
      message.payload.mode,
      message.payload.quick,
      message.payload.replace
    );
    const changedResults = results.filter((result) => result.changed);
    if (changedResults.length === 0) {
      throw new Error(message.payload.mode === "replace" ? "所选画板名称中没有匹配内容" : "名称没有发生变化");
    }

    const previousNames: Array<{ node: SceneNode; name: string }> = [];
    let skippedCount = 0;

    try {
      for (const result of changedResults) {
        const node = await figma.getNodeByIdAsync(result.id);
        if (!node || node.type === "DOCUMENT" || node.type === "PAGE" || !SUPPORTED_NODE_TYPES.has(node.type)) {
          skippedCount += 1;
          continue;
        }
        previousNames.push({ node, name: node.name });
        node.name = result.nextName;
      }
    } catch (error) {
      for (const previous of previousNames) previous.node.name = previous.name;
      throw error;
    }

    const changedCount = previousNames.length;
    if (changedCount === 0) throw new Error("选中的画板已失效，请重新选择");

    figma.commitUndo();
    figma.notify(
      skippedCount > 0
        ? `已重命名 ${changedCount} 个画板，跳过 ${skippedCount} 个失效画板`
        : `已重命名 ${changedCount} 个画板`
    );
    postToUI({
      type: "RENAME_SUCCEEDED",
      requestId: message.requestId,
      payload: { changedCount, skippedCount }
    });
    sendSelection();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "重命名失败，请重试";
    figma.notify(errorMessage, { error: true });
    postToUI({ type: "RENAME_FAILED", requestId: message.requestId, message: errorMessage });
  }
}

async function executeTextChanges(targets: TextTarget[], payload: Extract<UIToPluginMessage, { type: "EXECUTE_RENAME" }>["payload"]): Promise<number> {
  if (targets.length === 0) throw new Error("选中图层及其后代中没有文本图层");
  const results = buildTextResults(targets, payload.text, payload.syncLayerName).filter((result) => result.changed);
  if (results.length === 0) throw new Error("所选文本没有匹配内容或内容未发生变化");

  const entries = await Promise.all(results.map(async (result) => {
    const node = await figma.getNodeByIdAsync(result.id);
    if (!node || node.type !== "TEXT") throw new Error("选中的文本图层已失效，请重新选择");
    if (result.textChanged && node.hasMissingFont) throw new Error(`文本图层“${node.name}”存在缺失字体，请先安装字体`);
    return { node, result, originalName: node.name, autoRename: node.autoRename };
  }));

  // Load all fonts before writing any node, including fonts in mixed-style text.
  const fonts = new Map<string, FontName>();
  for (const { node, result } of entries) {
    if (!result.textChanged) continue;
    const nodeFonts = node.characters.length > 0
      ? node.getRangeAllFontNames(0, node.characters.length)
      : node.fontName === figma.mixed ? [] : [node.fontName];
    for (const font of nodeFonts) fonts.set(JSON.stringify(font), font);
  }
  try {
    await Promise.all([...fonts.values()].map((font) => figma.loadFontAsync(font)));
  } catch {
    throw new Error("文本字体加载失败，请确认字体可用后重试");
  }
  if (entries.some(({ node, result, originalName }) => node.removed || node.characters !== result.originalText || node.name !== originalName)) {
    throw new Error("文本在处理过程中发生变化，请重新预览后执行");
  }

  const applied: typeof entries = [];
  try {
    for (const entry of entries) {
      const { node, result } = entry;
      applied.push(entry);
      // Figma otherwise automatically renames text layers when characters change.
      node.autoRename = false;
      if (result.textChanged) {
        for (const edit of [...result.edits].reverse()) {
          if (edit.replacement) node.insertCharacters(edit.start, edit.replacement, "AFTER");
          if (edit.end > edit.start) node.deleteCharacters(edit.start + edit.replacement.length, edit.end + edit.replacement.length);
        }
      }
      node.name = result.nextName;
    }
  } catch (error) {
    for (const { node, result, originalName, autoRename } of applied.reverse()) {
      if (node.removed) continue;
      node.characters = result.originalText;
      node.name = originalName;
      node.autoRename = autoRename;
    }
    throw error;
  }
  return entries.length;
}

function postToUI(message: PluginToUIMessage): void {
  figma.ui.postMessage(message);
}
