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

const quickConfig: QuickRenameConfig = {
  baseName: "",
  number: { enabled: false, digits: null, direction: "asc" },
  letter: { enabled: false, width: null, letterCase: "upper", direction: "asc" },
  tokenOrder: []
};
const replaceConfig: ReplaceConfig = { searchText: "", replacementText: "" };

let mode: RenameMode = "quick";
let snapshot: SelectionSnapshot = { targets: [], ignoredCount: 0, selectionCount: 0 };
let currentResults: RenameResult[] = [];
let executing = false;

const elements = {
  quickTab: byId<HTMLButtonElement>("quick-tab"),
  replaceTab: byId<HTMLButtonElement>("replace-tab"),
  quickPanel: byId<HTMLElement>("quick-panel"),
  replacePanel: byId<HTMLElement>("replace-panel"),
  baseName: byId<HTMLInputElement>("base-name"),
  numberDigits: byId<HTMLInputElement>("number-digits"),
  letterWidth: byId<HTMLInputElement>("letter-width"),
  toggleNumber: byId<HTMLButtonElement>("toggle-number"),
  toggleLetter: byId<HTMLButtonElement>("toggle-letter"),
  searchText: byId<HTMLInputElement>("search-text"),
  replacementText: byId<HTMLInputElement>("replacement-text"),
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
    elements.statusMessage.textContent = `已重命名 ${message.payload.changedCount} 个画板`;
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
    if (event.key === "Enter" && !event.isComposing && !elements.confirmButton.disabled) executeRename();
  });
}

function setMode(nextMode: RenameMode): void {
  mode = nextMode;
  const quickActive = mode === "quick";
  elements.quickTab.classList.toggle("is-active", quickActive);
  elements.quickTab.setAttribute("aria-selected", String(quickActive));
  elements.replaceTab.classList.toggle("is-active", !quickActive);
  elements.replaceTab.setAttribute("aria-selected", String(!quickActive));
  elements.quickPanel.hidden = !quickActive;
  elements.replacePanel.hidden = quickActive;
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
  elements.toggleNumber.textContent = quickConfig.number.enabled ? "移除" : "添加";
  elements.toggleNumber.classList.toggle("is-added", quickConfig.number.enabled);
  elements.toggleLetter.textContent = quickConfig.letter.enabled ? "移除" : "添加";
  elements.toggleLetter.classList.toggle("is-added", quickConfig.letter.enabled);

  const ignoredText = snapshot.ignoredCount > 0 ? ` · 忽略 ${snapshot.ignoredCount} 个` : "";
  elements.selectionMeta.textContent = `${snapshot.targets.length} 个画板${ignoredText}`;
  elements.previewList.replaceChildren();

  const validation = mode === "quick" ? validateQuickConfig(quickConfig) : validateReplaceConfig(replaceConfig);
  currentResults = [];

  if (snapshot.targets.length === 0) {
    appendPlaceholder("选择画板后显示预览");
  } else if (!validation.valid) {
    appendPlaceholder("完善命名规则后显示预览");
  } else {
    currentResults = buildRenameResults(snapshot.targets, mode, quickConfig, replaceConfig);
    renderResultNames(currentResults);
  }

  const hasChanges = currentResults.some((result) => result.changed);
  elements.confirmButton.disabled = executing || !validation.valid || snapshot.targets.length === 0 || !hasChanges;
  elements.confirmButton.textContent = executing ? "处理中…" : "确定";
}

function renderResultNames(results: RenameResult[]): void {
  results.slice(0, 6).forEach((result, index) => {
    const item = document.createElement("span");
    item.className = "preview-item";
    item.textContent = result.nextName;
    item.title = result.nextName;
    if (index === 5 && results.length > 6) {
      item.classList.add("has-more");
      const name = document.createElement("span");
      name.className = "preview-name";
      name.textContent = result.nextName;
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
