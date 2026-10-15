import type { PluginToUIMessage, SelectionSnapshot, UIToPluginMessage } from "./shared/messages";
import { buildRenameResults, sortTargets, type RenameTarget } from "./shared/rename";

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

  selection.forEach((node, sourceIndex) => {
    if (!SUPPORTED_NODE_TYPES.has(node.type)) return;
    const box = node.absoluteBoundingBox;
    targets.push({
      id: node.id,
      type: node.type,
      originalName: node.name,
      x: box?.x ?? ("x" in node ? node.x : 0),
      y: box?.y ?? ("y" in node ? node.y : 0),
      sourceIndex
    });
  });

  return {
    targets: sortTargets(targets),
    ignoredCount: selection.length - targets.length,
    selectionCount: selection.length
  };
}

async function executeRename(message: Extract<UIToPluginMessage, { type: "EXECUTE_RENAME" }>): Promise<void> {
  try {
    const snapshot = getSelectionSnapshot();
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

function postToUI(message: PluginToUIMessage): void {
  figma.ui.postMessage(message);
}
