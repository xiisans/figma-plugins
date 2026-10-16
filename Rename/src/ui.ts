import type { PluginToUIMessage, SelectionSnapshot, UIToPluginMessage } from "./shared/messages";
import {
  buildRenameResults,
  validateQuickConfig,
  validateReplaceConfig,
  type Direction,
  type LetterCase,
  type QuickRenameConfig,
  type RenameMode,
  type RenameResult,
  type ReplaceConfig,
  type TokenKind
} from "./shared/rename";
import { buildTextResults, validateTextConfig } from "./shared/text";

const quickConfig: QuickRenameConfig = {
  baseName: "",
  number: { enabled: false, digits: null, direction: "asc" },
  letter: { enabled: false, width: null, letterCase: "upper", direction: "asc" },
  tokenOrder: []
};
const replaceConfig: ReplaceConfig = { searchText: "", replacementText: "" };
const textConfig: ReplaceConfig = { searchText: "", replacementText: "" };

let mode: RenameMode = "quick";
let snapshot: SelectionSnapshot = { targets: [], textTargets: [], ignoredCount: 0, selectionCount: 0 };
let currentResults: RenameResult[] = [];
let executing = false;

const elements = {
  quickTab: byId<HTMLButtonElement>("quick-tab"),
  replaceTab: byId<HTMLButtonElement>("replace-tab"),
  textTab: byId<HTMLButtonElement>("text-tab"),
  quickPanel: byId<HTMLElement>("quick-panel"),
  replacePanel: byId<HTMLElement>("replace-panel"),
  textPanel: byId<HTMLElement>("text-panel"),
  baseName: byId<HTMLInputElement>("base-name"),
  numberDigits: byId<HTMLInputElement>("number-digits"),
  letterWidth: byId<HTMLInputElement>("letter-width"),
  toggleNumber: byId<HTMLButtonElement>("toggle-number"),
  toggleLetter: byId<HTMLButtonElement>("toggle-letter"),
  searchText: byId<HTMLInputElement>("search-text"),
  replacementText: byId<HTMLInputElement>("replacement-text"),
  textSearch: byId<HTMLInputElement>("text-search"),
  textReplacement: byId<HTMLInputElement>("text-replacement"),
  previewList: byId<HTMLElement>("preview-list"),
  selectionMeta: byId<HTMLElement>("selection-meta"),
  syncLayerName: byId<HTMLInputElement>("sync-layer-name"),
  confirmButton: byId<HTMLButtonElement>("confirm-button"),
  statusMessage: byId<HTMLElement>("status-message")
};

bindEvents();
render();
postToPlugin({ type: "UI_READY" });

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginToUIMessage }>) => {
  const message = event.data.pluginMessage;
  if (!message) return;

  if (message.type === "SELECTION_CHANGED") {
    snapshot = message.payload;
    render();
  } else if (message.type === "RENAME_SUCCEEDED") {
    executing = false;
    elements.statusMessage.textContent = `已更新 ${message.payload.changedCount} 个图层`;
    render();
  } else if (message.type === "RENAME_FAILED") {
    executing = false;
    elements.statusMessage.textContent = message.message;
    render();
  }
};

function bindEvents(): void {
  elements.quickTab.addEventListener("click", () => setMode("quick"));
  elements.replaceTab.addEventListener("click", () => setMode("replace"));
  elements.textTab.addEventListener("click", () => setMode("text"));

  elements.baseName.addEventListener("input", () => {
    quickConfig.baseName = elements.baseName.value;
    render();
  });
  elements.numberDigits.addEventListener("input", () => {
    quickConfig.number.digits = parseWidth(elements.numberDigits.value);
    if (!elements.numberDigits.value.trim() && !elements.numberDigits.validity.badInput) {
      quickConfig.number.enabled = false;
      quickConfig.tokenOrder = quickConfig.tokenOrder.filter((token) => token !== "number");
    }
    render();
  });
  elements.letterWidth.addEventListener("input", () => {
    quickConfig.letter.width = parseWidth(elements.letterWidth.value);
    if (!elements.letterWidth.value.trim() && !elements.letterWidth.validity.badInput) {
      quickConfig.letter.enabled = false;
      quickConfig.tokenOrder = quickConfig.tokenOrder.filter((token) => token !== "letter");
    }
    render();
  });
  elements.searchText.addEventListener("input", () => {
    replaceConfig.searchText = elements.searchText.value;
    render();
  });
  elements.replacementText.addEventListener("input", () => {
    replaceConfig.replacementText = elements.replacementText.value;
    render();
  });
  elements.textSearch.addEventListener("input", () => {
    textConfig.searchText = elements.textSearch.value;
    render();
  });
  elements.textReplacement.addEventListener("input", () => {
    textConfig.replacementText = elements.textReplacement.value;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".input-clear").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.clearTarget;
      if (!targetId) return;
      const input = byId<HTMLInputElement>(targetId);
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
  });

  elements.toggleNumber.addEventListener("click", () => toggleToken("number"));
  elements.toggleLetter.addEventListener("click", () => toggleToken("letter"));
  elements.syncLayerName.addEventListener("change", () => render());

  document.querySelectorAll<HTMLButtonElement>("[data-number-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      quickConfig.number.direction = button.dataset.numberDirection as Direction;
      setSegmentActive("[data-number-direction]", button);
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-letter-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      quickConfig.letter.direction = button.dataset.letterDirection as Direction;
      setSegmentActive("[data-letter-direction]", button);
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-letter-case]").forEach((button) => {
    button.addEventListener("click", () => {
      quickConfig.letter.letterCase = button.dataset.letterCase as LetterCase;
      setSegmentActive("[data-letter-case]", button);
      render();
    });
  });

  elements.confirmButton.addEventListener("click", executeRename);
  document.addEventListener("keydown", (event) => {
    if (event.target instanceof Element && event.target.closest(".input-clear")) return;
    if (event.key === "Enter" && !event.isComposing && !elements.confirmButton.disabled) executeRename();
  });
}

function setMode(nextMode: RenameMode): void {
  mode = nextMode;
  const panels = [
    { mode: "quick", tab: elements.quickTab, panel: elements.quickPanel },
    { mode: "replace", tab: elements.replaceTab, panel: elements.replacePanel },
    { mode: "text", tab: elements.textTab, panel: elements.textPanel }
  ];
  for (const item of panels) {
    const active = mode === item.mode;
    item.tab.classList.toggle("is-active", active);
    item.tab.setAttribute("aria-selected", String(active));
    item.panel.hidden = !active;
  }
  render();
}

function toggleToken(kind: TokenKind): void {
  const config = kind === "number" ? quickConfig.number : quickConfig.letter;
  if (!config.enabled) {
    const width = kind === "number" ? quickConfig.number.digits : quickConfig.letter.width;
    const maximum = kind === "number" ? 32 : 10;
    if (width === null || !Number.isInteger(width) || width < 1 || width > maximum) {
      const input = kind === "number" ? elements.numberDigits : elements.letterWidth;
      input.focus();
      render();
      return;
    }
    config.enabled = true;
    quickConfig.tokenOrder = [...quickConfig.tokenOrder.filter((token) => token !== kind), kind];
  } else {
    config.enabled = false;
    quickConfig.tokenOrder = quickConfig.tokenOrder.filter((token) => token !== kind);
  }
  render();
}

function render(): void {
  document.querySelectorAll<HTMLButtonElement>(".input-clear").forEach((button) => {
    const targetId = button.dataset.clearTarget;
    button.hidden = !targetId || byId<HTMLInputElement>(targetId).value.length === 0;
    button.parentElement?.classList.toggle("has-value", !button.hidden);
  });
  elements.toggleNumber.setAttribute("aria-label", quickConfig.number.enabled ? "移除数字" : "添加数字");
  elements.toggleNumber.title = quickConfig.number.enabled ? "移除数字" : "添加数字";
  elements.toggleNumber.classList.toggle("is-added", quickConfig.number.enabled);
  elements.toggleNumber.disabled = !quickConfig.number.enabled && !isValidWidth(quickConfig.number.digits, 32);
  elements.toggleLetter.setAttribute("aria-label", quickConfig.letter.enabled ? "移除字母" : "添加字母");
  elements.toggleLetter.title = quickConfig.letter.enabled ? "移除字母" : "添加字母";
  elements.toggleLetter.classList.toggle("is-added", quickConfig.letter.enabled);
  elements.toggleLetter.disabled = !quickConfig.letter.enabled && !isValidWidth(quickConfig.letter.width, 10);

  const targetCount = mode === "text" ? snapshot.textTargets.length : snapshot.targets.length;
  const ignoredCount = mode === "text" ? 0 : snapshot.ignoredCount;
  const ignoredText = ignoredCount > 0 ? ` · 忽略 ${ignoredCount} 个` : "";
  elements.selectionMeta.textContent = `${targetCount} 个${mode === "text" ? "文本图层" : "画板"}${ignoredText}`;
  elements.previewList.replaceChildren();

  const validation = mode === "quick" ? validateQuickConfig(quickConfig)
    : mode === "text" ? validateTextConfig(textConfig) : validateReplaceConfig(replaceConfig);
  currentResults = [];

  if (targetCount === 0) {
    appendPlaceholder(mode === "text" ? "选择包含文本的图层后显示预览" : "选择画板后显示预览");
  } else if (!validation.valid) {
    appendPlaceholder("完善命名规则后显示预览");
  } else {
    currentResults = mode === "text"
      ? buildTextResults(snapshot.textTargets, textConfig, elements.syncLayerName.checked).map((result) => ({
          id: result.id,
          originalName: result.originalText,
          nextName: result.nextText,
          changed: result.changed
        }))
      : buildRenameResults(snapshot.targets, mode, quickConfig, replaceConfig);
    renderResultNames(currentResults);
  }

  const hasChanges = currentResults.some((result) => result.changed);
  elements.confirmButton.disabled = executing || !validation.valid || targetCount === 0 || !hasChanges;
  elements.confirmButton.textContent = executing ? "处理中…" : "确定";
}

function renderResultNames(results: RenameResult[]): void {
  results.slice(0, 6).forEach((result, index) => {
    const item = document.createElement("span");
    item.className = "preview-item";
    const previewText = mode === "text" && !result.nextName ? "（空文本）" : result.nextName;
    item.textContent = previewText;
    item.title = result.nextName;
    if (index === 5 && results.length > 6) {
      item.classList.add("has-more");
      const name = document.createElement("span");
      name.className = "preview-name";
      name.textContent = previewText;
      const more = document.createElement("span");
      more.className = "preview-more";
      more.textContent = "…";
      more.title = `另有 ${results.length - 6} 个结果`;
      item.replaceChildren(name, more);
    }
    elements.previewList.append(item);
  });
}

function appendPlaceholder(text: string): void {
  const placeholder = document.createElement("span");
  placeholder.className = "preview-placeholder";
  placeholder.textContent = text;
  elements.previewList.append(placeholder);
}

function executeRename(): void {
  if (elements.confirmButton.disabled) return;
  executing = true;
  render();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  postToPlugin({
    type: "EXECUTE_RENAME",
    requestId,
    payload: {
      mode,
      quick: structuredCloneSafe(quickConfig),
      replace: { ...replaceConfig },
      text: { ...textConfig },
      syncLayerName: elements.syncLayerName.checked
    }
  });
}

function setSegmentActive(selector: string, activeButton: HTMLButtonElement): void {
  document.querySelectorAll(selector).forEach((button) => button.classList.toggle("is-active", button === activeButton));
  activeButton.parentElement?.classList.toggle("is-second-selected", activeButton === activeButton.parentElement.lastElementChild);
}

function parseWidth(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function isValidWidth(value: number | null, maximum: number): boolean {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= maximum;
}

function structuredCloneSafe(config: QuickRenameConfig): QuickRenameConfig {
  return {
    baseName: config.baseName,
    number: { ...config.number },
    letter: { ...config.letter },
    tokenOrder: [...config.tokenOrder]
  };
}

function postToPlugin(message: UIToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}
