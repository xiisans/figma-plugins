import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import addIcon from "../assets/add.svg";
import checkIcon from "../assets/check.svg";
import chevronDownIcon from "../assets/chevron-down.svg";
import chevronRightIcon from "../assets/chevron-right.svg";
import refreshIcon from "../assets/refresh.svg";
import selectDownIcon from "../assets/select-down.svg";
import { sanitizeFileName } from "../shared/normalize";
import { serializeSnapshot } from "../shared/serialize";
import { buildExportSnapshot, SnapshotBuildError } from "../shared/snapshot";
import type {
  CollectionDto,
  ColorFormat,
  ExportFormat,
  ExportSnapshotDto,
  PluginDataDto,
  PluginErrorDto,
  PluginToUiMessage,
  UiToPluginMessage,
} from "../shared/types";

export interface PluginBridge {
  send(message: UiToPluginMessage): void;
  subscribe(listener: (message: PluginToUiMessage) => void): () => void;
}

interface AppProps {
  bridge?: PluginBridge;
  initialData?: PluginDataDto;
  demoState?: string;
}

const browserBridge: PluginBridge = {
  send(message) {
    parent.postMessage({ pluginMessage: message }, "*");
  },
  subscribe(listener) {
    const handler = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
      if (event.data?.pluginMessage) listener(event.data.pluginMessage);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  },
};

type CheckState = "checked" | "unchecked" | "mixed";

function Checkbox({ state, label, onChange }: { state: CheckState; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      className={`checkbox checkbox--${state}`}
      role="checkbox"
      aria-checked={state === "mixed" ? "mixed" : state === "checked"}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
    >
      {state === "checked" && <img src={checkIcon} alt="" />}
      {state === "mixed" && <span />}
    </button>
  );
}

function collectionState(collection: CollectionDto, selected: Set<string>): CheckState {
  const count = collection.modes.filter((mode) => selected.has(mode.id)).length;
  if (count === 0) return "unchecked";
  return count === collection.modes.length ? "checked" : "mixed";
}

function allModeIds(data: PluginDataDto | null): string[] {
  return data?.collections.filter((collection) => collection.visible).flatMap((collection) => collection.modes.map((mode) => mode.id)) ?? [];
}

function HighlightedCode({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <code>
      {lines.map((line, index) => {
        const declaration = line.match(/^(\s*)(--[\w-]+|\$[\w-]+)(:\s*)(.*)$/);
        let content: React.ReactNode = line;
        if (line.trimStart().startsWith("/*")) content = <span className="syntax-comment">{line}</span>;
        else if (declaration) {
          content = <>{declaration[1]}<span className="syntax-name">{declaration[2]}</span>{declaration[3]}<span className="syntax-value">{declaration[4]}</span></>;
        } else if (/^(:root|\[data-)/.test(line)) content = <span className="syntax-selector">{line}</span>;
        return <span className="code-line" key={`${index}-${line}`}>{content}{index < lines.length - 1 ? "\n" : ""}</span>;
      })}
    </code>
  );
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function App({ bridge = browserBridge, initialData, demoState }: AppProps) {
  const [data, setData] = useState<PluginDataDto | null>(initialData ?? null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(demoState === "loaded" ? ["collection-3"] : []));
  const [snapshot, setSnapshot] = useState<ExportSnapshotDto | null>(null);
  const [activeFormat, setActiveFormat] = useState<ExportFormat>("css");
  const [colorFormat, setColorFormat] = useState<ColorFormat>("hex");
  const [loading, setLoading] = useState(!initialData);
  const [generating, setGenerating] = useState(false);
  const [formatOpen, setFormatOpen] = useState(demoState === "dropdown");
  const [error, setError] = useState<PluginErrorDto | null>(null);
  const [status, setStatus] = useState("");
  const dataRef = useRef(data);
  const requestId = useRef(0);
  const previewRef = useRef<HTMLPreElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);

  const applyData = useCallback((next: PluginDataDto) => {
    const previous = dataRef.current;
    const previousIds = new Set(allModeIds(previous));
    setSelected((current) => {
      if (!previous) return new Set();
      const nextSelected = new Set<string>();
      for (const id of allModeIds(next)) {
        if (!previous || !previousIds.has(id) || current.has(id)) nextSelected.add(id);
      }
      return nextSelected;
    });
    setExpanded((current) => new Set([...current].filter((id) => next.collections.some((collection) => collection.id === id && collection.visible))));
    dataRef.current = next;
    setData(next);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    const unsubscribe = bridge.subscribe((message) => {
      if (message.type === "load-started") {
        setLoading(true);
        return;
      }
      if (message.type === "data-loaded") {
        applyData(message.data);
        return;
      }
      if (message.type === "snapshot-generated") {
        if (message.requestId !== requestId.current) return;
        setSnapshot(message.snapshot);
        setError(null);
        setGenerating(false);
        return;
      }
      if (message.type === "plugin-error") {
        if (message.requestId !== undefined && message.requestId !== requestId.current) return;
        setError(message.error);
        setGenerating(false);
        setLoading(false);
      }
    });
    if (!initialData) bridge.send({ type: "load-data", reason: "initialize" });
    return unsubscribe;
  }, [applyData, bridge, initialData]);

  useEffect(() => {
    if (!initialData || demoState !== "loaded") return;
    try {
      setSnapshot(buildExportSnapshot(initialData, allModeIds(initialData)));
    } catch {
      // The development fixture is validated by unit tests.
    }
  }, [demoState, initialData]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 1500);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!formatOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !colorMenuRef.current?.contains(event.target)) setFormatOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFormatOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [formatOpen]);

  const collections = useMemo(() => data?.collections.filter((collection) => collection.visible).sort((a, b) => a.order - b.order) ?? [], [data]);
  const modeIds = useMemo(() => allModeIds(data), [data]);
  const allState: CheckState = selected.size === 0 ? "unchecked" : modeIds.every((id) => selected.has(id)) ? "checked" : "mixed";
  const output = useMemo(() => snapshot ? serializeSnapshot(snapshot, activeFormat, colorFormat) : "", [activeFormat, colorFormat, snapshot]);

  function toggleCollection(collection: CollectionDto) {
    const state = collectionState(collection, selected);
    setSelected((current) => {
      const next = new Set(current);
      for (const mode of collection.modes) state === "checked" ? next.delete(mode.id) : next.add(mode.id);
      return next;
    });
  }

  function toggleMode(modeId: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(modeId) ? next.delete(modeId) : next.add(modeId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allState === "checked" ? new Set() : new Set(modeIds));
  }

  function generate() {
    if (!data || selected.size === 0) return;
    setGenerating(true);
    setError(null);
    if (initialData) {
      try {
        setSnapshot(buildExportSnapshot(data, [...selected]));
      } catch (cause) {
        setError(cause instanceof SnapshotBuildError ? cause.issue : { code: "LOAD_FAILED", message: "生成预览失败。" });
      } finally {
        setGenerating(false);
      }
      return;
    }
    requestId.current += 1;
    bridge.send({ type: "generate-snapshot", requestId: requestId.current, selectedModeIds: [...selected] });
  }

  async function copyOutput() {
    if (!output) return;
    const selection = window.getSelection();
    const selectedText = selection && previewRef.current && selection.rangeCount > 0
      && previewRef.current.contains(selection.anchorNode) && previewRef.current.contains(selection.focusNode)
      ? selection.toString()
      : "";
    try {
      await writeClipboard(selectedText || output);
      setStatus(selectedText ? "已复制选中内容" : "已复制全部内容");
    } catch {
      setStatus("复制失败");
    }
  }

  function downloadOutput() {
    if (!output || !data) return;
    const url = URL.createObjectURL(new Blob(["\uFEFF", output.replace(/\r\n/g, "\n")], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sanitizeFileName(data.fileName);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus("已导出 TXT");
  }

  return (
    <main className="plugin-shell">
      <section className="collections-panel" aria-label="变量集合">
        <header className="panel-header">
          <h1>集合</h1>
          <button
            type="button"
            className={`icon-button refresh-button${loading ? " is-loading" : ""}`}
            aria-label="刷新变量集合"
            title="刷新变量集合"
            disabled={loading}
            onClick={() => bridge.send({ type: "load-data", reason: "refresh" })}
          >
            <img className="icon-muted" src={refreshIcon} alt="" />
          </button>
        </header>

        <div className="collection-list">
          {loading && collections.length === 0 && <div className="list-message">正在读取变量…</div>}
          {!loading && collections.length === 0 && <div className="list-message">当前文件没有本地变量集合</div>}
          {collections.map((collection) => {
            const isExpanded = expanded.has(collection.id);
            const state = collectionState(collection, selected);
            return (
              <div className="collection-group" key={collection.id}>
                <div className="collection-row">
                  <button
                    type="button"
                    className="expand-button"
                    aria-label={`${isExpanded ? "收起" : "展开"}${collection.name}`}
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((current) => {
                      const next = new Set(current);
                      next.has(collection.id) ? next.delete(collection.id) : next.add(collection.id);
                      return next;
                    })}
                  >
                    <img className="icon-muted" src={isExpanded ? chevronDownIcon : chevronRightIcon} alt="" />
                  </button>
                  <button type="button" className="row-label" onClick={() => setExpanded((current) => {
                    const next = new Set(current);
                    next.has(collection.id) ? next.delete(collection.id) : next.add(collection.id);
                    return next;
                  })}>{collection.name}</button>
                  <Checkbox state={state} label={`选择${collection.name}`} onChange={() => toggleCollection(collection)} />
                </div>
                {isExpanded && (
                  <div className="mode-list">
                    {collection.modes.map((mode) => (
                      <div className="mode-row" key={mode.id}>
                        <span>{mode.name}</span>
                        <Checkbox state={selected.has(mode.id) ? "checked" : "unchecked"} label={`选择${mode.name}`} onChange={() => toggleMode(mode.id)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <footer className="panel-footer left-footer">
          <div className="select-all">
            <Checkbox state={allState} label="全选" onChange={toggleAll} />
            <button type="button" onClick={toggleAll}>全选</button>
          </div>
          <button type="button" className="add-button" aria-label="加载所选变量" title="加载所选变量" disabled={selected.size === 0 || loading || generating} onClick={generate}>
            <img src={addIcon} alt="" />
          </button>
        </footer>
      </section>

      <section className="preview-panel" aria-label="变量导出预览">
        <header className="panel-header preview-header">
          <nav className="format-tabs" aria-label="导出格式">
            {(["css", "scss", "css-scss", "tailwind"] as ExportFormat[]).map((format) => (
              <button type="button" key={format} className={activeFormat === format ? "active" : ""} onClick={() => setActiveFormat(format)}>
                {format === "tailwind" ? "Tailwind" : format === "css-scss" ? "CSS/SCSS" : format.toUpperCase()}
              </button>
            ))}
          </nav>
          <div className="color-menu" ref={colorMenuRef}>
            <button type="button" className="color-trigger" aria-haspopup="listbox" aria-expanded={formatOpen} onClick={() => setFormatOpen((open) => !open)}>
              <span>{colorFormat === "hex" ? "Hex" : colorFormat === "rgb" ? "RGB(A)" : "HSL(A)"}</span>
              <img className={`icon-muted${formatOpen ? " is-up" : ""}`} src={selectDownIcon} alt="" />
            </button>
            {formatOpen && (
              <div className="color-options" role="listbox" aria-label="颜色格式">
                {(["hex", "rgb", "hsl"] as ColorFormat[]).map((format) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={colorFormat === format}
                    className={colorFormat === format ? "selected" : ""}
                    key={format}
                    onClick={() => { setColorFormat(format); setFormatOpen(false); }}
                  >
                    {format === "hex" ? "Hex" : format === "rgb" ? "RGB(A)" : "HSL(A)"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="preview-body">
          {error ? (
            <div className="preview-message preview-error" role="alert">
              <strong>无法加载变量</strong>
              <span>{error.message}</span>
              {error.details?.slice(0, 4).map((detail) => <span className="error-detail" key={detail}>{detail}</span>)}
            </div>
          ) : output ? (
            <pre ref={previewRef} className="code-preview" tabIndex={0}><HighlightedCode text={output} /></pre>
          ) : (
            <div className="preview-message">请选择变量，并点击“+”进行加载</div>
          )}
        </div>

        <footer className="panel-footer action-footer">
          <span className="status-text" role="status" aria-live="polite">{status}</span>
          <button type="button" className="action-button" disabled={!output || Boolean(error)} onClick={copyOutput}>复制</button>
          <button type="button" className="action-button" disabled={!output || Boolean(error)} onClick={downloadOutput}>导出</button>
        </footer>
      </section>
    </main>
  );
}
