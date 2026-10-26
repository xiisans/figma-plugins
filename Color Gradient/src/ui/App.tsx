import { useEffect, useMemo, useRef, useState } from 'react';
import chevronDown from '../assets/chevron-down.svg';
import refreshIcon from '../assets/refresh.svg';
import { buildGradient, describeColor } from '../shared/color';
import type {
  CollectionOption,
  ColorModel,
  Distribution,
  GradientConfig,
  GradientMode,
  OutputMode,
  PluginToUiMessage,
  SelectionState,
  StepCount,
  UiToPluginMessage,
} from '../shared/types';

const EMPTY_SELECTION: SelectionState = { status: 'empty' };
const FIXTURE_SELECTION: SelectionState = {
  status: 'valid',
  color: {
    r: 123 / 255,
    g: 94 / 255,
    b: 241 / 255,
    a: 1,
    hex: '#7B5EF1',
    nodeId: 'fixture:1',
    nodeType: 'FRAME',
    bounds: { x: 100, y: 100, width: 120, height: 120 },
  },
};
const FIXTURE_COLLECTIONS: CollectionOption[] = [
  { id: 'color', name: 'color', groups: ['blue', 'brand', 'gray'] },
  { id: 'space', name: 'space', groups: ['base'] },
  { id: 'font', name: 'font', groups: ['size'] },
  { id: 'button', name: 'button', groups: ['primary'] },
];

function postPluginMessage(message: UiToPluginMessage): void {
  if (window.parent !== window) parent.postMessage({ pluginMessage: message }, '*');
}

function isDarkColor(value: string): boolean | undefined {
  const match = value.trim().match(/^#([0-9a-f]{6})/i);
  if (!match) return undefined;
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
  return channels.reduce((sum, channel) => sum + channel, 0) / 3 < 128;
}

function syncTheme(mediaQuery: MediaQueryList): void {
  const params = new URLSearchParams(location.search);
  const forced = params.get('theme');
  if (forced) {
    document.documentElement.classList.toggle('dark', forced === 'dark');
    return;
  }
  const root = document.documentElement;
  const body = document.body;
  const isDark = root.classList.contains('figma-dark') || body.classList.contains('figma-dark')
    ? true
    : root.classList.contains('figma-light') || body.classList.contains('figma-light')
      ? false
      : isDarkColor(getComputedStyle(root).getPropertyValue('--figma-color-bg')) ?? mediaQuery.matches;
  root.classList.toggle('dark', isDark);
}

interface Segment<T extends string | number> {
  value: T;
  label: string;
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Segment<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          className={value === option.value ? 'is-active' : ''}
          aria-pressed={value === option.value}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface ComboInputProps {
  ariaLabel: string;
  placeholder: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  openInitially?: boolean;
  onChange: (value: string) => void;
  onSelect: (id: string, label: string) => void;
}

function ComboInput({
  ariaLabel,
  placeholder,
  value,
  options,
  openInitially,
  onChange,
  onSelect,
}: ComboInputProps) {
  const [open, setOpen] = useState(Boolean(openInitially));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className={`combo${open ? ' is-open' : ''}`} ref={rootRef}>
      <input
        aria-label={ariaLabel}
        aria-expanded={open}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
      />
      <button
        type="button"
        className="combo__trigger"
        aria-label={`展开${ariaLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <img className="asset-icon" src={chevronDown} alt="" />
      </button>
      {open && (
        <div className="combo__menu" role="listbox" aria-label={`${ariaLabel}列表`}>
          {options.length ? options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={value === option.label}
              className={value === option.label ? 'is-selected' : ''}
              key={option.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option.id, option.label);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          )) : <span className="combo__empty">暂无可选项，可直接输入</span>}
        </div>
      )}
    </div>
  );
}

function fixtureState() {
  const params = new URLSearchParams(location.search);
  if (!params.has('state')) return null;
  return {
    selection: params.get('state') === 'empty' ? EMPTY_SELECTION : FIXTURE_SELECTION,
    mode: params.get('mode') === 'alpha' ? 'alpha' as GradientMode : 'solid' as GradientMode,
    output: params.get('output') === 'variables' ? 'variables' as OutputMode : 'board' as OutputMode,
    steps: params.get('steps') === '20' ? 20 as StepCount : 10 as StepCount,
    dropdown: params.get('dropdown') ?? '',
  };
}

export default function App() {
  const fixture = useMemo(fixtureState, []);
  const [selection, setSelection] = useState<SelectionState>(fixture?.selection ?? EMPTY_SELECTION);
  const [collections, setCollections] = useState<CollectionOption[]>(fixture ? FIXTURE_COLLECTIONS : []);
  const [mode, setMode] = useState<GradientMode>(fixture?.mode ?? 'solid');
  const [model, setModel] = useState<ColorModel>('oklch');
  const [steps, setSteps] = useState<StepCount>(fixture?.steps ?? 10);
  const [distribution, setDistribution] = useState<Distribution>('centered');
  const [output, setOutput] = useState<OutputMode>(fixture?.output ?? 'board');
  const [collectionId, setCollectionId] = useState<string>();
  const fixtureHasSelection = fixture?.selection.status === 'valid';
  const [collectionName, setCollectionName] = useState(fixtureHasSelection && fixture?.dropdown !== 'collection' ? 'color' : '');
  const [groupName, setGroupName] = useState(fixtureHasSelection && fixture?.dropdown !== 'group' ? 'blue' : '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => syncTheme(media);
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    media.addEventListener?.('change', updateTheme);

    const receive = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
      const message = event.data?.pluginMessage;
      if (!message) return;
      if (message.type === 'initial-state') {
        setCollections(message.collections);
        setSelection(message.selection);
      } else if (message.type === 'selection-change') {
        setSelection(message.selection);
        setStatus('');
      } else if (message.type === 'collections-change') {
        setCollections(message.collections);
      } else if (message.type === 'operation-result') {
        setBusy(false);
        setStatus(message.success ? message.summary.message : message.message);
      }
    };
    window.addEventListener('message', receive);
    if (!fixture) postPluginMessage({ type: 'ui-ready' });
    return () => {
      observer.disconnect();
      media.removeEventListener?.('change', updateTheme);
      window.removeEventListener('message', receive);
    };
  }, [fixture]);

  const selectedCollection = useMemo(
    () => collections.find((item) => item.id === collectionId) ??
      collections.find((item) => item.name === collectionName.trim()),
    [collectionId, collectionName, collections],
  );
  const groupOptions = selectedCollection?.groups.map((name) => ({ id: name, label: name })) ?? [];
  const collectionOptions = collections.map((item) => ({ id: item.id, label: item.name }));
  const config: GradientConfig = { mode, model, steps, distribution };
  const gradient = selection.status === 'valid' ? buildGradient(selection.color, config) : null;
  const namingComplete = Boolean(collectionName.trim() && groupName.trim());
  const canGenerate = selection.status === 'valid' && !busy && (output === 'board' || namingComplete);

  const changeCollection = (value: string) => {
    const exact = collections.find((item) => item.name === value.trim());
    setCollectionName(value);
    setCollectionId(exact?.id);
    if (exact?.id !== collectionId) setGroupName('');
  };

  const generate = () => {
    if (!canGenerate || selection.status !== 'valid') return;
    setBusy(true);
    setStatus('正在生成…');
    const payload = {
      sourceNodeId: selection.color.nodeId,
      config,
      collectionId,
      collectionName,
      groupName,
    };
    if (fixture) {
      window.setTimeout(() => {
        setBusy(false);
        setStatus(output === 'variables' ? `已创建 ${steps} 个、更新 0 个颜色变量` : `已生成 ${steps} 个色板`);
      }, 50);
    } else {
      postPluginMessage({ type: output === 'variables' ? 'generate-variables' : 'generate-board', payload });
    }
  };

  const selectionMessage = selection.status === 'empty'
    ? '请选择要添加颜色梯度的色板'
    : selection.status === 'invalid'
      ? selection.message
      : '';

  return (
    <main className="plugin-shell">
      <aside className="settings-panel">
        <header className="mode-tabs" role="tablist" aria-label="梯度模式">
          <button role="tab" aria-selected={mode === 'solid'} className={mode === 'solid' ? 'is-active' : ''} onClick={() => setMode('solid')}>实色梯度</button>
          <button role="tab" aria-selected={mode === 'alpha'} className={mode === 'alpha' ? 'is-active' : ''} onClick={() => setMode('alpha')}>透明梯度</button>
        </header>

        <section className="settings-panel__body">
          <div
            className={`source-card${selection.status === 'valid' ? ' has-color' : ''}`}
            style={selection.status === 'valid' ? { backgroundColor: selection.color.hex } : undefined}
          >
            {selection.status === 'valid' ? describeColor(selection.color, mode === 'alpha' ? 'oklch' : model) : '暂未选择色板'}
          </div>

          {mode === 'solid' && (
            <div className="control-group">
              <label>计算模式</label>
              <Segmented
                label="计算模式"
                value={model}
                options={[{ value: 'oklch', label: 'OKLCH' }, { value: 'hsl', label: 'HSL' }]}
                onChange={setModel}
              />
            </div>
          )}

          <div className="control-group">
            <label>梯度</label>
            <div className="gradient-controls">
              <Segmented
                label="梯度步数"
                value={steps}
                options={[{ value: 10, label: '10步' }, { value: 20, label: '20步' }]}
                onChange={setSteps}
              />
              {mode === 'solid' && (
                <Segmented
                  label="分布方式"
                  value={distribution}
                  options={[{ value: 'uniform', label: '均匀分布' }, { value: 'centered', label: '目标居中' }]}
                  onChange={setDistribution}
                />
              )}
            </div>
          </div>

          <Segmented
            label="生成方式"
            value={output}
            options={[{ value: 'board', label: '生成画板' }, { value: 'variables', label: '生成变量' }]}
            onChange={setOutput}
          />
        </section>

        <footer className="settings-panel__footer">
          <span>HEX</span>
          <strong>{selection.status === 'valid' ? selection.color.hex : '#000000'}</strong>
        </footer>
      </aside>

      <section className={`preview-panel output-${output}`}>
        {output === 'variables' && (
          <header className="variable-toolbar">
            <div className="variable-toolbar__inputs">
              <ComboInput
                ariaLabel="集合"
                placeholder="选择集合"
                value={collectionName}
                options={collectionOptions}
                openInitially={fixture?.dropdown === 'collection'}
                onChange={changeCollection}
                onSelect={(id, label) => {
                  setCollectionId(id);
                  setCollectionName(label);
                  setGroupName('');
                }}
              />
              <ComboInput
                ariaLabel="分组"
                placeholder="选择分组"
                value={groupName}
                options={groupOptions}
                openInitially={fixture?.dropdown === 'group'}
                onChange={setGroupName}
                onSelect={(_id, label) => setGroupName(label)}
              />
            </div>
            <button
              type="button"
              className="refresh-button"
              aria-label="刷新集合与分组"
              title="刷新集合与分组"
              onClick={() => postPluginMessage({ type: 'refresh-collections' })}
            >
              <img className="asset-icon" src={refreshIcon} alt="" />
            </button>
          </header>
        )}

        <div className="preview-panel__body">
          {gradient ? (
            <div className="gradient-list" aria-label="梯度预览">
              {gradient.stops.map((stop) => (
                <div className="gradient-row" key={stop.suffix}>
                  <span className="color-dot" style={{ backgroundColor: `rgba(${stop.r * 255}, ${stop.g * 255}, ${stop.b * 255}, ${stop.a})` }} />
                  <span className={`gradient-row__data mode-${mode}`}>
                    <span className="gradient-row__model">{mode === 'solid' ? stop.modelLabel : stop.hex}</span>
                    {mode === 'solid' && <span className="gradient-row__hex">{stop.hex}</span>}
                    <span className="gradient-row__alpha">{stop.alphaPercent}%</span>
                  </span>
                  <span className="gradient-row__suffix">{stop.suffix}</span>
                </div>
              ))}
            </div>
          ) : <p className={`selection-message${selection.status === 'invalid' ? ' is-error' : ''}`}>{selectionMessage}</p>}
        </div>

        <footer className="preview-panel__footer">
          <span className="footer-status">
            {status || (gradient?.targetLightnessCorrected
              ? '基准色明度已校正到 6–98'
              : gradient
                ? `已选中 ${gradient.stops.length} 个画板`
                : '')}
          </span>
          <button className="generate-button" type="button" disabled={!canGenerate} onClick={generate}>
            {busy ? '...' : output === 'variables' ? '生成变量' : '生成画板'}
          </button>
        </footer>
      </section>
    </main>
  );
}
