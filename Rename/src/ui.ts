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
  type TokenKind,
  sortTargets
} from "./shared/rename";
import {
  buildNumberNamingResults,
  buildTextResults,
  validateNumberNamingConfig,
  validateTextConfig,
  type NumberNamingConfig,
  type TextRenameConfig
} from "./shared/text";

const quickConfig: QuickRenameConfig = {
  baseName: "",
  number: { enabled: false, digits: null, direction: "asc" },
  letter: { enabled: false, width: null, letterCase: "upper", direction: "asc" },
  tokenOrder: []
};
const replaceConfig: ReplaceConfig = { searchText: "", replacementText: "" };
const textConfig: TextRenameConfig = {
  searchText: "",
  replacementText: "",
  number: { enabled: false, digits: null, direction: "asc" }
};
const numberNamingConfig: NumberNamingConfig = { startValue: null, step: null, direction: "asc" };

let mode: RenameMode = "quick";
let snapshot: SelectionSnapshot = { targets: [], textTargets: [], ignoredCount: 0, selectionCount: 0 };
let currentResults: RenameResult[] = [];
let executing = false;
let awaitingCommittedSnapshot = false;
let pendingSelectionRequestId: string | null = null;
const PREVIEW_LIMIT = 12;

const elements = {
  quickTab: byId<HTMLButtonElement>("quick-tab"),
  replaceTab: byId<HTMLButtonElement>("replace-tab"),
  textTab: byId<HTMLButtonElement>("text-tab"),
  numberTab: byId<HTMLButtonElement>("number-tab"),
  quickPanel: byId<HTMLElement>("quick-panel"),
  replacePanel: byId<HTMLElement>("replace-panel"),
  textPanel: byId<HTMLElement>("text-panel"),
  numberPanel: byId<HTMLElement>("number-panel"),
  baseName: byId<HTMLInputElement>("base-name"),
  numberDigits: byId<HTMLInputElement>("number-digits"),
  letterWidth: byId<HTMLInputElement>("letter-width"),
  toggleNumber: byId<HTMLButtonElement>("toggle-number"),
  toggleLetter: byId<HTMLButtonElement>("toggle-letter"),
  searchText: byId<HTMLInputElement>("search-text"),
  replacementText: byId<HTMLInputElement>("replacement-text"),
  textSearch: byId<HTMLInputElement>("text-search"),
  textReplacement: byId<HTMLInputElement>("text-replacement"),
  textNumberDigits: byId<HTMLInputElement>("text-number-digits"),
  toggleTextNumber: byId<HTMLButtonElement>("toggle-text-number"),
  numberStart: byId<HTMLInputElement>("number-start"),
  numberStep: byId<HTMLInputElement>("number-step"),
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
    if (message.requestId && message.requestId !== pendingSelectionRequestId) return;
    pendingSelectionRequestId = null;
    const showCommittedResult = awaitingCommittedSnapshot;
    awaitingCommittedSnapshot = false;
    snapshot = message.payload;
    render(showCommittedResult);
  } else if (message.type === "RENAME_SUCCEEDED") {
    executing = false;
    awaitingCommittedSnapshot = true;
    clearAllInputValues();
    elements.statusMessage.textContent = `已更新 ${message.payload.changedCount} 个图层`;
    render();
  } else if (message.type === "RENAME_FAILED") {
    executing = false;
    awaitingCommittedSnapshot = false;
    elements.statusMessage.textContent = message.message;
    render();
  }
};

function bindEvents(): void {
  elements.quickTab.addEventListener("click", () => setMode("quick"));
  elements.replaceTab.addEventListener("click", () => setMode("replace"));
  elements.textTab.addEventListener("click", () => setMode("text"));
  elements.numberTab.addEventListener("click", () => setMode("number"));

  elements.baseName.addEventListener("input", () => {
    quickConfig.baseName = elements.baseName.value;
    refreshSelectionBeforeRender();
  });
  elements.numberDigits.addEventListener("input", () => {
    quickConfig.number.digits = parseWidth(elements.numberDigits.value);
    if (!elements.numberDigits.value.trim() && !elements.numberDigits.validity.badInput) {
      quickConfig.number.enabled = false;
      quickConfig.tokenOrder = quickConfig.tokenOrder.filter((token) => token !== "number");
    }
    refreshSelectionBeforeRender();
  });
  elements.letterWidth.addEventListener("input", () => {
    quickConfig.letter.width = parseWidth(elements.letterWidth.value);
    if (!elements.letterWidth.value.trim() && !elements.letterWidth.validity.badInput) {
      quickConfig.letter.enabled = false;
      quickConfig.tokenOrder = quickConfig.tokenOrder.filter((token) => token !== "letter");
    }
    refreshSelectionBeforeRender();
  });
  elements.searchText.addEventListener("input", () => {
    replaceConfig.searchText = elements.searchText.value;
    refreshSelectionBeforeRender();
  });
  elements.replacementText.addEventListener("input", () => {
    replaceConfig.replacementText = elements.replacementText.value;
    refreshSelectionBeforeRender();
  });
  elements.textSearch.addEventListener("input", () => {
    textConfig.searchText = elements.textSearch.value;
    refreshSelectionBeforeRender();
  });
  elements.textReplacement.addEventListener("input", () => {
    textConfig.replacementText = elements.textReplacement.value;
    refreshSelectionBeforeRender();
  });
  elements.textNumberDigits.addEventListener("input", () => {
    textConfig.number.digits = parseWidth(elements.textNumberDigits.value);
    if (!elements.textNumberDigits.value.trim() && !elements.textNumberDigits.validity.badInput) {
      textConfig.number.enabled = false;
    }
    refreshSelectionBeforeRender();
  });
  elements.numberStart.addEventListener("input", () => {
    numberNamingConfig.startValue = parseInteger(elements.numberStart.value);
    refreshSelectionBeforeRender();
  });
  elements.numberStep.addEventListener("input", () => {
    numberNamingConfig.step = parseInteger(elements.numberStep.value);
    refreshSelectionBeforeRender();
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
  elements.toggleTextNumber.addEventListener("click", toggleTextNumber);
  elements.syncLayerName.addEventListener("change", refreshSelectionBeforeRender);

  document.querySelectorAll<HTMLButtonElement>("[data-number-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      quickConfig.number.direction = button.dataset.numberDirection as Direction;
      setSegmentActive("[data-number-direction]", button);
      refreshSelectionBeforeRender();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-letter-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      quickConfig.letter.direction = button.dataset.letterDirection as Direction;
      setSegmentActive("[data-letter-direction]", button);
      refreshSelectionBeforeRender();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-letter-case]").forEach((button) => {
    button.addEventListener("click", () => {
      quickConfig.letter.letterCase = button.dataset.letterCase as LetterCase;
      setSegmentActive("[data-letter-case]", button);
      refreshSelectionBeforeRender();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-text-number-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      textConfig.number.direction = button.dataset.textNumberDirection as Direction;
      setSegmentActive("[data-text-number-direction]", button);
      refreshSelectionBeforeRender();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-number-naming-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      numberNamingConfig.direction = button.dataset.numberNamingDirection as Direction;
      setSegmentActive("[data-number-naming-direction]", button);
      refreshSelectionBeforeRender();
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
    { mode: "text", tab: elements.textTab, panel: elements.textPanel },
    { mode: "number", tab: elements.numberTab, panel: elements.numberPanel }
  ];
  for (const item of panels) {
    const active = mode === item.mode;
    item.tab.classList.toggle("is-active", active);
    item.tab.setAttribute("aria-selected", String(active));
    item.panel.hidden = !active;
  }
  refreshSelectionBeforeRender();
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
  refreshSelectionBeforeRender();
}

function toggleTextNumber(): void {
  if (textConfig.number.enabled) {
    textConfig.number.enabled = false;
  } else if (isValidWidth(textConfig.number.digits, 32)) {
    textConfig.number.enabled = true;
  } else {
    elements.textNumberDigits.focus();
  }
  refreshSelectionBeforeRender();
}

function render(showCommittedResult = false): void {
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
  elements.toggleTextNumber.setAttribute("aria-label", textConfig.number.enabled ? "移除文本数字" : "添加文本数字");
  elements.toggleTextNumber.title = textConfig.number.enabled ? "移除文本数字" : "添加文本数字";
  elements.toggleTextNumber.classList.toggle("is-added", textConfig.number.enabled);
  elements.toggleTextNumber.disabled = !textConfig.number.enabled && !isValidWidth(textConfig.number.digits, 32);

  const textTargetMode = mode === "text" || mode === "number";
  const targetCount = textTargetMode ? snapshot.textTargets.length : snapshot.targets.length;
  const ignoredCount = textTargetMode ? 0 : snapshot.ignoredCount;
  const ignoredText = ignoredCount > 0 ? ` · 忽略 ${ignoredCount} 个` : "";
  elements.selectionMeta.textContent = `${targetCount} 个${textTargetMode ? "文本图层" : "画板"}${ignoredText}`;
  elements.previewList.replaceChildren();

  const validation = mode === "quick" ? validateQuickConfig(quickConfig)
    : mode === "text" ? validateTextConfig(textConfig)
      : mode === "number" ? validateNumberNamingConfig(numberNamingConfig)
        : validateReplaceConfig(replaceConfig);
  currentResults = [];

  if (targetCount === 0) {
    appendPlaceholder(textTargetMode ? "选择包含文本的图层后显示预览" : "选择画板后显示预览");
  } else if (showCommittedResult) {
    if (textTargetMode) {
      const textById = new Map(snapshot.textTargets.map((target) => [target.id, target.characters]));
      currentResults = sortTargets(snapshot.textTargets).map((target) => {
        const value = textById.get(target.id) ?? "";
        return { id: target.id, originalName: value, nextName: value, changed: false };
      });
    } else {
      currentResults = snapshot.targets.map((target) => ({
        id: target.id,
        originalName: target.originalName,
        nextName: target.originalName,
        changed: false
      }));
    }
    renderResultNames(currentResults);
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
      : mode === "number"
        ? buildNumberNamingResults(snapshot.textTargets, numberNamingConfig, elements.syncLayerName.checked).map((result) => ({
            id: result.id,
            originalName: result.originalText,
            nextName: result.nextText,
            changed: result.changed
          }))
      : buildRenameResults(snapshot.targets, mode, quickConfig, replaceConfig);
    renderResultNames(currentResults);
  }

  const hasChanges = currentResults.some((result) => result.changed);
  elements.confirmButton.disabled = executing || showCommittedResult || !validation.valid || targetCount === 0 || !hasChanges;
  elements.confirmButton.textContent = executing ? "处理中…" : "确定";
}

function renderResultNames(results: RenameResult[]): void {
  results.slice(0, PREVIEW_LIMIT).forEach((result, index) => {
    const item = document.createElement("span");
    item.className = "preview-item";
    const previewText = (mode === "text" || mode === "number") && !result.nextName ? "（空文本）" : result.nextName;
    item.textContent = previewText;
    item.title = result.nextName;
    if (index === PREVIEW_LIMIT - 1 && results.length > PREVIEW_LIMIT) {
      item.classList.add("has-more");
      const name = document.createElement("span");
      name.className = "preview-name";
      name.textContent = previewText;
      const more = document.createElement("span");
      more.className = "preview-more";
      more.textContent = "…";
      more.title = `另有 ${results.length - PREVIEW_LIMIT} 个结果`;
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
      text: { ...textConfig, number: { ...textConfig.number } },
      numberNaming: { ...numberNamingConfig },
      syncLayerName: elements.syncLayerName.checked
    }
  });
}

function clearAllInputValues(): void {
  elements.baseName.value = "";
  elements.numberDigits.value = "";
  elements.letterWidth.value = "";
  elements.searchText.value = "";
  elements.replacementText.value = "";
  elements.textSearch.value = "";
  elements.textReplacement.value = "";
  elements.textNumberDigits.value = "";
  elements.numberStart.value = "";
  elements.numberStep.value = "";

  quickConfig.baseName = "";
  quickConfig.number.enabled = false;
  quickConfig.number.digits = null;
  quickConfig.letter.enabled = false;
  quickConfig.letter.width = null;
  quickConfig.tokenOrder = [];
  replaceConfig.searchText = "";
  replaceConfig.replacementText = "";
  textConfig.searchText = "";
  textConfig.replacementText = "";
  textConfig.number.enabled = false;
  textConfig.number.digits = null;
  numberNamingConfig.startValue = null;
  numberNamingConfig.step = null;
}

function refreshSelectionBeforeRender(): void {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  awaitingCommittedSnapshot = false;
  pendingSelectionRequestId = requestId;
  elements.confirmButton.disabled = true;
  postToPlugin({ type: "REQUEST_SELECTION", requestId });
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

function parseInteger(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
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
