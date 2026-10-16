import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRenamePayload, PluginToUIMessage, UIToPluginMessage } from "../src/shared/messages";

const inter: FontName = { family: "Inter", style: "Regular" };
const bold: FontName = { family: "Inter", style: "Bold" };

function textNode(id: string, initialText: string, name = "原图层名") {
  let content = initialText;
  const node = {
    id, type: "TEXT" as const, name, autoRename: true, removed: false,
    x: 0, y: 0, absoluteBoundingBox: { x: 0, y: 0 },
    hasMissingFont: false, fontName: inter,
    get characters() { return content; },
    set characters(value: string) {
      content = value;
      if (node.autoRename) node.name = value;
    },
    getRangeAllFontNames: vi.fn(() => [inter]),
    insertCharacters: vi.fn((start: number, value: string) => {
      node.characters = content.slice(0, start) + value + content.slice(start);
    }),
    deleteCharacters: vi.fn((start: number, end: number) => {
      node.characters = content.slice(0, start) + content.slice(end);
    })
  };
  return node;
}

const payload: ExecuteRenamePayload = {
  mode: "text",
  quick: { baseName: "新画板", number: { enabled: false, digits: null, direction: "asc" }, letter: { enabled: false, width: null, letterCase: "upper", direction: "asc" }, tokenOrder: [] },
  replace: { searchText: "旧", replacementText: "新" },
  text: { searchText: "旧", replacementText: "新" },
  syncLayerName: true
};

type MockNode = ReturnType<typeof textNode> | {
  id: string;
  type: "FRAME" | "RECTANGLE" | "GROUP" | "INSTANCE" | "COMPONENT";
  name: string;
  x: number;
  y: number;
  children?: MockNode[];
  visible?: boolean;
  locked?: boolean;
};

function container(id: string, type: "FRAME" | "GROUP" | "INSTANCE" | "COMPONENT", children: MockNode[]): MockNode {
  return { id, type, name: "容器", x: 0, y: 0, children };
}

function findNode(id: string, nodes: MockNode[]): MockNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if ("children" in node && node.children) {
      const found = findNode(id, node.children);
      if (found) return found;
    }
  }
}

function createHost() {
  return {
    mixed: Symbol("mixed"),
    currentPage: { selection: [] as MockNode[] },
    ui: { onmessage: undefined as unknown as (message: UIToPluginMessage) => Promise<void>, postMessage: vi.fn<(message: PluginToUIMessage) => void>() },
    showUI: vi.fn(), on: vi.fn(), commitUndo: vi.fn(), notify: vi.fn(),
    getNodeByIdAsync: vi.fn(async (id: string): Promise<unknown> => findNode(id, host.currentPage.selection)),
    loadFontAsync: vi.fn(async (_font: FontName) => {})
  };
}

let host: ReturnType<typeof createHost>;

beforeEach(async () => {
  vi.resetModules();
  host = createHost();
  vi.stubGlobal("figma", host);
  vi.stubGlobal("__html__", "<html></html>");
  await import("../src/code");
});
afterEach(() => vi.unstubAllGlobals());

async function execute(overrides: Partial<ExecuteRenamePayload> = {}) {
  await host.ui.onmessage({ type: "EXECUTE_RENAME", requestId: "test", payload: { ...payload, ...overrides } });
}

describe("text mode controller", () => {
  it("previews and updates all descendant texts across nested groups, components and instances", async () => {
    const first = textNode("a", "旧标题");
    const nested = textNode("b", "旧内容");
    const frame = container("f", "FRAME", [first, container("g", "GROUP", [
      container("c", "COMPONENT", [container("i", "INSTANCE", [nested])])
    ]), { id: "r", type: "RECTANGLE", name: "旧矩形", x: 0, y: 0 }]);
    host.currentPage.selection = [frame];
    await host.ui.onmessage({ type: "UI_READY" });
    expect(host.ui.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "SELECTION_CHANGED",
      payload: expect.objectContaining({ textTargets: [expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })] })
    }));
    await execute();
    expect([first.characters, nested.characters]).toEqual(["新标题", "新内容"]);
    expect([first.name, nested.name]).toEqual(["新标题", "新内容"]);
    expect(frame.name).toBe("容器");
    expect(host.ui.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "RENAME_SUCCEEDED", payload: { changedCount: 2, skippedCount: 0 } }));
  });

  it("deduplicates overlapping selected subtrees and directly selected text", async () => {
    const text = textNode("t", "旧");
    const group = container("g", "GROUP", [text]);
    const frame = container("f", "FRAME", [group]);
    host.currentPage.selection = [text, frame, group];
    await host.ui.onmessage({ type: "UI_READY" });
    expect(host.ui.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({
      textTargets: [expect.objectContaining({ id: "t" })]
    }) }));
    await execute({ text: { searchText: "旧", replacementText: "旧新" } });
    expect(text.characters).toBe("旧新");
    expect(text.insertCharacters).toHaveBeenCalledOnce();
  });

  it("includes hidden and locked descendant subtrees and preserves names when unchecked", async () => {
    const text = textNode("t", "旧内容");
    const group = { ...container("g", "GROUP", [text]), visible: false, locked: true };
    host.currentPage.selection = [container("f", "FRAME", [group])];
    await execute({ syncLayerName: false });
    expect(text.characters).toBe("新内容");
    expect(text.name).toBe("原图层名");
  });

  it("reports no matching targets for selected containers with no text", async () => {
    host.currentPage.selection = [container("f", "FRAME", [container("g", "GROUP", [])])];
    await host.ui.onmessage({ type: "UI_READY" });
    expect(host.ui.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ textTargets: [] }) }));
    await execute();
    expect(host.ui.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "RENAME_FAILED", message: "选中图层及其后代中没有文本图层" }));
    expect(host.commitUndo).not.toHaveBeenCalled();
  });

  it("filters mixed selections and changes only selected text content", async () => {
    const text = textNode("t", "旧内容旧");
    const frame = { id: "f", type: "FRAME" as const, name: "旧画板", x: 0, y: 0 };
    host.currentPage.selection = [frame, text, { id: "r", type: "RECTANGLE", name: "旧矩形", x: 0, y: 0 }];
    await host.ui.onmessage({ type: "UI_READY" });
    expect(host.ui.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "SELECTION_CHANGED", payload: expect.objectContaining({ textTargets: [expect.objectContaining({ id: "t", characters: "旧内容旧" })], targets: [expect.objectContaining({ id: "f" })] }) }));
    await execute();
    expect(text.characters).toBe("新内容新");
    expect(text.name).toBe("新内容新");
    expect(frame.name).toBe("旧画板");
    expect(host.commitUndo).toHaveBeenCalledOnce();
  });

  it("preserves an automatically named layer when synchronization is unchecked", async () => {
    const node = textNode("t", "旧内容", "旧内容");
    host.currentPage.selection = [node];
    await execute({ syncLayerName: false });
    expect(node.characters).toBe("新内容");
    expect(node.name).toBe("旧内容");
  });

  it("loads every mixed font before applying replacements", async () => {
    const node = textNode("t", "旧内容");
    node.getRangeAllFontNames.mockReturnValue([inter, bold]);
    host.currentPage.selection = [node];
    host.loadFontAsync.mockImplementation(async () => {
      expect(node.characters).toBe("旧内容");
      expect(node.insertCharacters).not.toHaveBeenCalled();
    });
    await execute();
    expect(host.loadFontAsync).toHaveBeenCalledWith(inter);
    expect(host.loadFontAsync).toHaveBeenCalledWith(bold);
    expect(node.characters).toBe("新内容");
  });

  it("does not modify any layer if one required font fails to load", async () => {
    const first = textNode("a", "旧一");
    const second = textNode("b", "旧二");
    host.currentPage.selection = [first, second];
    host.loadFontAsync.mockRejectedValue(new Error("unavailable"));
    await execute();
    expect([first.characters, second.characters]).toEqual(["旧一", "旧二"]);
    expect(host.ui.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "RENAME_FAILED" }));
    expect(host.commitUndo).not.toHaveBeenCalled();
  });

  it("stops the batch on a missing font before changing other layers", async () => {
    const first = textNode("a", "旧一");
    const second = textNode("b", "旧二");
    second.hasMissingFont = true;
    host.currentPage.selection = [first, second];
    await execute();
    expect([first.characters, second.characters]).toEqual(["旧一", "旧二"]);
    expect(host.ui.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "RENAME_FAILED" }));
  });

  it("writes full replacements to empty layers and applies the long name rule", async () => {
    const node = textNode("t", "");
    host.currentPage.selection = [node];
    await execute({ text: { searchText: "", replacementText: "1234567890123" } });
    expect(host.loadFontAsync).toHaveBeenCalledWith(inter);
    expect(node.characters).toBe("1234567890123");
    expect(node.name).toBe("text");
  });

  it("handles shorter, longer, repeated and complete deletions correctly", async () => {
    const node = textNode("t", "旧旧旧");
    host.currentPage.selection = [node];
    await execute({ text: { searchText: "旧", replacementText: "替换" } });
    expect(node.characters).toBe("替换替换替换");
    await execute({ text: { searchText: "替换", replacementText: "" }, syncLayerName: false });
    expect(node.characters).toBe("");
    expect(node.name).toBe("替换替换替换");
  });

  it("rejects stale content that changes while fonts are loading", async () => {
    const node = textNode("t", "旧内容");
    host.currentPage.selection = [node];
    host.loadFontAsync.mockImplementation(async () => { node.characters = "外部编辑"; });
    await execute();
    expect(node.characters).toBe("外部编辑");
    expect(node.insertCharacters).not.toHaveBeenCalled();
    expect(host.ui.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "RENAME_FAILED" }));
  });

  it("retains existing frame renaming behavior for the other modes", async () => {
    const text = textNode("t", "旧内容");
    const frame = { id: "f", type: "FRAME" as const, name: "旧画板", x: 0, y: 0 };
    host.currentPage.selection = [text, frame];
    await execute({ mode: "quick" });
    expect(frame.name).toBe("新画板");
    expect(text.characters).toBe("旧内容");
    expect(text.name).toBe("原图层名");
  });
});
