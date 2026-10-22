import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Folder,
  RefreshCw,
  Type,
} from 'lucide-react';
import { buildSuffixes } from '../shared/logic';
import type {
  CollectionOption,
  Direction,
  PluginToUiMessage,
  SelectionState,
  UiToPluginMessage,
} from '../shared/types';

const EMPTY_SELECTION: SelectionState = { status: 'empty', items: [] };

function postPluginMessage(message: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function isDarkColor(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  const hex = normalized.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const raw = hex[1];
    const channels = raw.length <= 4
      ? raw.slice(0, 3).split('').map((channel) => parseInt(channel + channel, 16))
      : [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16));
    return channels.reduce((sum, channel) => sum + channel, 0) / 3 < 128;
  }

  const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]].reduce((sum, channel) => sum + Number(channel), 0) / 3 < 128;
  }

  return undefined;
}

function readFigmaDarkMode(mediaQuery: MediaQueryList): boolean {
  const root = document.documentElement;
  const body = document.body;
  if (root.classList.contains('figma-dark') || body.classList.contains('figma-dark')) return true;
  if (root.classList.contains('figma-light') || body.classList.contains('figma-light')) return false;

  const figmaBackground = getComputedStyle(root).getPropertyValue('--figma-color-bg');
  return isDarkColor(figmaBackground) ?? mediaQuery.matches;
}

interface ComboInputProps {
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ id: string; label: string }>;
  emptyText: string;
  onRefresh?: () => void;
  onChange: (value: string) => void;
  onSelect: (id: string, label: string) => void;
}

function ComboInput({
  label,
  value,
  placeholder,
  options,
  emptyText,
  onRefresh,
  onChange,
  onSelect,
}: ComboInputProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="field" ref={rootRef}>
      <div className="field__label-row">
        <label>{label}</label>
        {onRefresh && (
          <button
            className="field__refresh tooltip-target"
            type="button"
            aria-label={`刷新${label}列表`}
            data-tooltip={`刷新${label}列表`}
            onClick={onRefresh}
          >
            <RefreshCw size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>
      <div className={`combo${open ? ' combo--open' : ''}`}>
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-expanded={open}
        />
        <button
          className="combo__trigger tooltip-target"
          type="button"
          aria-label={`展开${label}列表`}
          data-tooltip={`展开${label}列表`}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronRight size={12} strokeWidth={2} />
        </button>
        {open && (
          <div className="combo__menu" role="listbox" aria-label={`${label}列表`}>
            {options.length === 0 ? (
              <div className="combo__empty">{emptyText}</div>
            ) : (
              options.map((option) => (
                <button
                  className={`combo__option${option.label === value ? ' is-selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={option.label === value}
                  key={option.id}
                  onClick={() => {
                    onSelect(option.id, option.label);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function isSafeIntegerInput(value: string): boolean {
  return /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

export default function App() {
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [collectionId, setCollectionId] = useState<string>();
  const [collectionName, setCollectionName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [startValue, setStartValue] = useState('');
  const [stepValue, setStepValue] = useState('');
  const [direction, setDirection] = useState<Direction>('increase');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string }>();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      document.documentElement.classList.toggle('dark', readFigmaDarkMode(mediaQuery));
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    const onMediaThemeChange = () => syncTheme();
    mediaQuery.addEventListener?.('change', onMediaThemeChange);

    const receive = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
      const message = event.data?.pluginMessage;
      if (!message) return;
      if (message.type === 'initial-state') {
        setCollections(message.collections);
        setSelection(message.selection);
      } else if (message.type === 'collections-change') {
        setCollections(message.collections);
      } else if (message.type === 'selection-change') {
        setSelection(message.selection);
        setResult(undefined);
      } else if (message.type === 'generate-result') {
        setGenerating(false);
        setResult({ success: message.success, message: message.message });
      }
    };

    window.addEventListener('message', receive);
    postPluginMessage({ type: 'ui-ready' });
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener?.('change', onMediaThemeChange);
      window.removeEventListener('message', receive);
    };
  }, []);

  const selectedCollection = useMemo(
    () =>
      collections.find((collection) => collection.id === collectionId) ??
      collections.find((collection) => collection.name === collectionName.trim()),
    [collectionId, collectionName, collections],
  );

  const startIsValid = isSafeIntegerInput(startValue);
  const stepIsValid = /^\d+$/.test(stepValue) && Number(stepValue) > 0 && Number.isSafeInteger(Number(stepValue));
  const namingComplete =
    Boolean(collectionName.trim()) &&
    Boolean(groupName.trim()) &&
    startIsValid &&
    stepIsValid;
  const canGenerate = selection.status === 'valid' && namingComplete && !generating;

  const suffixes = useMemo(() => {
    if (selection.status !== 'valid' || !startIsValid || !stepIsValid) {
      return selection.items.map(() => 0);
    }
    return buildSuffixes(
      selection.items.length,
      Number(startValue),
      Number(stepValue),
      direction,
    );
  }, [direction, selection, startIsValid, startValue, stepIsValid, stepValue]);

  const changeCollection = (next: string) => {
    const exact = collections.find((collection) => collection.name === next.trim());
    if (exact?.id !== collectionId) setGroupName('');
    setCollectionId(exact?.id);
    setCollectionName(next);
  };

  const generate = () => {
    if (!canGenerate || selection.status !== 'valid') return;
    setGenerating(true);
    setResult(undefined);
    postPluginMessage({
      type: 'generate',
      payload: {
        collectionId,
        collectionName: collectionName.trim(),
        groupName: groupName.trim(),
        start: Number(startValue),
        step: Number(stepValue),
        direction,
        nodeIds: selection.items.map((item) => item.nodeId),
      },
    });
  };

  return (
    <main className="plugin-shell">
      <aside className="settings-panel">
        <section className="settings-panel__body">
          <ComboInput
            label="集合"
            value={collectionName}
            placeholder="选择集合或输入新的集合"
            options={collections.map((collection) => ({ id: collection.id, label: collection.name }))}
            emptyText="当前暂无集合"
            onRefresh={() => postPluginMessage({ type: 'refresh-collections' })}
            onChange={changeCollection}
            onSelect={(id, label) => {
              setCollectionId(id);
              setCollectionName(label);
              setGroupName('');
            }}
          />

          <ComboInput
            label="分组"
            value={groupName}
            placeholder="选择分组或输入新的分组"
            options={(selectedCollection?.groups ?? []).map((group) => ({ id: group, label: group }))}
            emptyText="当前暂无分组"
            onChange={setGroupName}
            onSelect={(_, label) => setGroupName(label)}
          />

          <div className="field">
            <label>变量</label>
            <div className="suffix-controls">
              <div className="suffix-input">
                <input
                  value={startValue}
                  inputMode="numeric"
                  placeholder="输入起始数值"
                  aria-label="输入起始数值"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/^-?\d*$/.test(value)) setStartValue(value);
                  }}
                />
              </div>
              <div className="suffix-input">
                <input
                  value={stepValue}
                  inputMode="numeric"
                  placeholder="每次叠加数值"
                  aria-label="每次叠加数值"
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/^\d*$/.test(value)) setStepValue(value);
                  }}
                />
              </div>
              <div className="direction-control" aria-label="后缀变化方向">
                <button
                  className={`tooltip-target${direction === 'increase' ? ' is-active' : ''}`}
                  type="button"
                  aria-label="递增命名"
                  data-tooltip="递增命名"
                  onClick={() => setDirection('increase')}
                >
                  <ArrowUp size={12} strokeWidth={2} />
                </button>
                <button
                  className={`tooltip-target${direction === 'decrease' ? ' is-active' : ''}`}
                  type="button"
                  aria-label="递减命名"
                  data-tooltip="递减命名"
                  onClick={() => setDirection('decrease')}
                >
                  <ArrowDown size={12} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <footer className="settings-panel__footer">
          <Folder size={16} strokeWidth={1.5} />
          <span title={`${collectionName || '集合名'}/${groupName || '分组名'}`}>
            {collectionName || '集合名'}/{groupName || '分组名'}
          </span>
        </footer>
      </aside>

      <section className="preview-panel">
        <div className="preview-panel__body">
          {selection.status === 'empty' && (
            <p className="selection-message">请选择要添加变量的色板/数字文本/文字文本</p>
          )}
          {selection.status === 'invalid' && (
            <p className="selection-message selection-message--error">{selection.message}</p>
          )}
          {selection.status === 'valid' && (
            <div className="preview-list">
              {selection.items.map((item, index) => (
                <div className="preview-row" key={item.nodeId}>
                  {item.color ? (
                    <>
                      <span
                        className="color-swatch"
                        style={{
                          backgroundColor: `rgba(${item.color.r * 255}, ${item.color.g * 255}, ${item.color.b * 255}, ${item.color.a})`,
                        }}
                      />
                      <span className="preview-row__value">{item.color.hex}</span>
                      <span className="preview-row__meta">{Math.round(item.color.a * 100)}%</span>
                    </>
                  ) : (
                    <>
                      <Type className="text-icon" size={12} strokeWidth={2} />
                      <span className="preview-row__text" title={item.displayValue}>{item.displayValue}</span>
                    </>
                  )}
                  <span className="preview-row__name">{suffixes[index] ?? 0}</span>
                </div>
              ))}
            </div>
          )}
          {result && (
            <div
              className={`result-toast ${result.success ? 'result-toast--success' : 'result-toast--error'}`}
              role="status"
            >
              {result.message}
            </div>
          )}
        </div>

        <footer className="preview-panel__footer">
          {selection.status === 'valid' && (
            <span className="selection-count">
              已选中 {selection.items.length} 个{selection.kind === 'color' ? '画板' : '文本'}
            </span>
          )}
          <button className="generate-button" type="button" disabled={!canGenerate} onClick={generate}>
            {generating ? '生成中' : '生成'}
          </button>
        </footer>
      </section>
    </main>
  );
}
