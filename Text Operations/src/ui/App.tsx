import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  ItemSpacing,
  LayoutDirection,
  MergeRule,
  Operation,
  PluginResponse,
  SelectionChangedMessage,
  SplitDelimiter,
  UiRequest,
} from '../shared/messages';
import checkIcon from './assets/check.svg';

type Tab = Operation;
type OptionValue = string | number;

const mergeOptions: Array<{ value: MergeRule; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'newline', label: '回车' },
  { value: 'space', label: '空格' },
  { value: 'comma', label: '逗号' },
  { value: 'period', label: '句号' },
  { value: 'slash', label: '斜杆' },
];

const splitOptions = mergeOptions.filter(
  (option): option is { value: SplitDelimiter; label: string } => option.value !== 'none',
);

const initialSelection: SelectionChangedMessage = {
  type: 'selection-changed',
  selectedCount: 0,
  textCount: 0,
  splitEligible: false,
};

function postPluginMessage(message: UiRequest): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

interface SegmentedProps<T extends OptionValue> {
  ariaLabel: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  compact?: boolean;
}

function Segmented<T extends OptionValue>({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
}: SegmentedProps<T>) {
  return (
    <div
      className={`segmented${compact ? ' segmented--compact' : ''}`}
      role="group"
      aria-label={ariaLabel}
      style={{ '--segments': options.length } as CSSProperties}
    >
      {options.map((option) => (
        <button
          className={`segmented__item${option.value === value ? ' is-active' : ''}`}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface ActionCardProps {
  available: boolean;
  unavailableLabel: string;
  actionLabel: string;
  processing: boolean;
  disabled: boolean;
  onAction: () => void;
}

function ActionCard({
  available,
  unavailableLabel,
  actionLabel,
  processing,
  disabled,
  onAction,
}: ActionCardProps) {
  return (
    <div className="action-card">
      {available ? (
        <button className="button button--action" type="button" disabled={disabled} onClick={onAction}>
          {processing ? '...' : actionLabel}
        </button>
      ) : (
        <span className="action-card__empty">{unavailableLabel}</span>
      )}
    </div>
  );
}

async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('copy failed');
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>('replace');
  const [selection, setSelection] = useState(initialSelection);
  const [busy, setBusy] = useState<Operation | null>(null);
  const activeRequest = useRef<string | null>(null);

  const [find, setFind] = useState('');
  const [replacement, setReplacement] = useState('');
  const [syncLayerName, setSyncLayerName] = useState(true);

  const [mergeRule, setMergeRule] = useState<MergeRule>('newline');
  const [extractedText, setExtractedText] = useState<string | null>(null);

  const [splitDelimiter, setSplitDelimiter] = useState<SplitDelimiter>('newline');
  const [keepDelimiter, setKeepDelimiter] = useState(false);
  const [direction, setDirection] = useState<LayoutDirection>('vertical');
  const [spacing, setSpacing] = useState<ItemSpacing>(4);

  useEffect(() => {
    const receiveMessage = (event: MessageEvent<{ pluginMessage?: PluginResponse }>) => {
      const message = event.data.pluginMessage;
      if (!message) return;

      if (message.type === 'selection-changed') {
        setSelection(message);
        setExtractedText(null);
        return;
      }

      if (message.requestId === activeRequest.current) {
        activeRequest.current = null;
        setBusy(null);
      }
      if (message.ok && message.operation === 'extract' && message.extractedText !== undefined) {
        setExtractedText(message.extractedText);
      }
    };

    window.addEventListener('message', receiveMessage);
    postPluginMessage({ type: 'selection-request' });
    return () => window.removeEventListener('message', receiveMessage);
  }, []);

  const beginRequest = (operation: Operation, request: UiRequest & { requestId: string }) => {
    activeRequest.current = request.requestId;
    setBusy(operation);
    postPluginMessage(request);
  };

  const runReplace = () => {
    const id = requestId();
    beginRequest('replace', {
      type: 'replace',
      requestId: id,
      find,
      replacement,
      syncLayerName,
    });
  };

  const runExtract = () => {
    const id = requestId();
    setExtractedText(null);
    beginRequest('extract', { type: 'extract', requestId: id, rule: mergeRule });
  };

  const runSplit = () => {
    const id = requestId();
    beginRequest('split', {
      type: 'split',
      requestId: id,
      delimiter: splitDelimiter,
      keepDelimiter,
      direction,
      spacing,
    });
  };

  const copyExtractedText = async () => {
    if (extractedText === null) return;
    try {
      await copyToClipboard(extractedText);
      postPluginMessage({ type: 'notify', message: '已复制到剪贴板' });
    } catch {
      postPluginMessage({ type: 'notify', message: '复制失败，请手动选择文本' });
    }
  };

  const controlsDisabled = busy !== null;
  const replaceDisabled = controlsDisabled || selection.textCount === 0 || (!find && !replacement);

  return (
    <main className="app">
      <nav className="tabs" aria-label="文本处理功能">
        {(
          [
            ['replace', '替换'],
            ['extract', '提取'],
            ['split', '拆分'],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            className={`tabs__item${tab === value ? ' is-active' : ''}`}
            type="button"
            aria-current={tab === value ? 'page' : undefined}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'replace' && (
        <section className="panel panel--replace" aria-label="文本替换">
          <div className="form-stack">
            <label className="field">
              <span className="field__label field__label--large">查找</span>
              <input
                className="text-input"
                value={find}
                disabled={controlsDisabled}
                placeholder="请输入文本，为空时则替换全部"
                onChange={(event) => setFind(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label field__label--large">替换</span>
              <input
                className="text-input"
                value={replacement}
                disabled={controlsDisabled}
                placeholder="请输入替换成的文本"
                onChange={(event) => setReplacement(event.target.value)}
              />
            </label>
          </div>

          <div className="replace-actions">
            <label className="checkbox-row">
              <input
                className="visually-hidden"
                type="checkbox"
                checked={syncLayerName}
                disabled={controlsDisabled}
                onChange={(event) => setSyncLayerName(event.target.checked)}
              />
              <span className={`checkbox${syncLayerName ? ' is-checked' : ''}`} aria-hidden="true">
                {syncLayerName && <img src={checkIcon} alt="" />}
              </span>
              <span>同步更改图层名称</span>
            </label>
            <button className="button" type="button" disabled={replaceDisabled} onClick={runReplace}>
              {busy === 'replace' ? '...' : '确定'}
            </button>
          </div>
        </section>
      )}

      {tab === 'extract' && (
        <section className="panel panel--extract" aria-label="文本提取">
          <ActionCard
            available={selection.textCount > 0}
            unavailableLabel="请选择文本"
            actionLabel="提取"
            processing={busy === 'extract'}
            disabled={controlsDisabled}
            onAction={runExtract}
          />

          <div className="option-section">
            <div className="field__label">合并规则</div>
            <Segmented
              ariaLabel="合并规则"
              value={mergeRule}
              options={mergeOptions}
              disabled={controlsDisabled}
              onChange={(value) => {
                setMergeRule(value);
                setExtractedText(null);
              }}
            />
          </div>

          <div className="preview">
            <div className="preview__header">
              <span>{extractedText === null ? '文本预览' : '已完成提取'}</span>
              <button
                className="button button--secondary button--copy"
                type="button"
                disabled={extractedText === null || controlsDisabled}
                onClick={() => void copyExtractedText()}
              >
                复制
              </button>
            </div>
            <div className={`preview__body${extractedText === null ? ' is-empty' : ''}`}>
              {extractedText ?? '暂未提取文本'}
            </div>
          </div>
        </section>
      )}

      {tab === 'split' && (
        <section className="panel panel--split" aria-label="文本拆分">
          <ActionCard
            available={selection.splitEligible}
            unavailableLabel="请选择纯文本"
            actionLabel="拆分"
            processing={busy === 'split'}
            disabled={controlsDisabled}
            onAction={runSplit}
          />

          {selection.splitEligible && (
            <>
              <div className="option-section">
                <div className="option-heading">
                  <span className="field__label">分割符</span>
                  <label className="checkbox-row checkbox-row--compact">
                    <span>保留</span>
                    <input
                      className="visually-hidden"
                      type="checkbox"
                      checked={keepDelimiter}
                      disabled={controlsDisabled}
                      onChange={(event) => setKeepDelimiter(event.target.checked)}
                    />
                    <span className={`checkbox${keepDelimiter ? ' is-checked' : ''}`} aria-hidden="true">
                      {keepDelimiter && <img src={checkIcon} alt="" />}
                    </span>
                  </label>
                </div>
                <Segmented
                  ariaLabel="分割符"
                  value={splitDelimiter}
                  options={splitOptions}
                  disabled={controlsDisabled}
                  onChange={setSplitDelimiter}
                />
              </div>

              <div className="option-section">
                <div className="field__label">排列方向</div>
                <Segmented
                  ariaLabel="排列方向"
                  value={direction}
                  options={[
                    { value: 'vertical', label: '纵向' },
                    { value: 'horizontal', label: '横向' },
                  ]}
                  disabled={controlsDisabled}
                  compact
                  onChange={setDirection}
                />
              </div>

              <div className="option-section">
                <div className="field__label">元素间距</div>
                <Segmented
                  ariaLabel="元素间距"
                  value={spacing}
                  options={([4, 8, 12, 16, 20] as ItemSpacing[]).map((value) => ({
                    value,
                    label: String(value),
                  }))}
                  disabled={controlsDisabled}
                  onChange={setSpacing}
                />
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
