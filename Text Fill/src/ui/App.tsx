import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Check, CirclePlay, SlidersHorizontal } from 'lucide-react';
import { PARAMETER_KINDS, splitLines } from '../shared/generators';
import { configError } from '../shared/validation';
import { DEFAULT_CONFIGS, FILL_KINDS, FILL_LABELS, type CustomFillRequest, type FillConfig, type FillConfigMap, type FillKind, type FillRequest, type Order } from '../shared/types';
import { send, subscribe } from './bridge';
import Segmented from './Segmented';

const DATE_OPTIONS = [{ value: '-', label: '-', width: 12 }, { value: '/', label: '/', width: 12 }, { value: '文', label: '文', width: 12 }] as const;
const TIME_OPTIONS = [{ value: 'HH:MM:SS', label: 'HH:MM:SS', width: 54 }, { value: 'HH:MM', label: 'HH:MM', width: 39 }, { value: 'MM:SS', label: 'MM:SS', width: 37 }] as const;
const PHONE_OPTIONS = [{ value: 'regular', label: '常规', width: 24 }, { value: 'masked', label: '加密', width: 24 }, { value: 'spaced', label: '空格', width: 24 }] as const;
const PARAGRAPH_OPTIONS = [{ value: 'comment', label: '评论', width: 24 }, { value: 'news', label: '新闻', width: 24 }, { value: 'science', label: '科普', width: 24 }] as const;
const ORDER_OPTIONS = [
  { value: 'asc', label: '升序', content: <ArrowUp size={10} strokeWidth={2} />, width: 12 },
  { value: 'desc', label: '降序', content: <ArrowDown size={10} strokeWidth={2} />, width: 12 },
] as const;

function NumericField({ label, name, value, error, disabled, onChange, onSubmit }: {
  label: string; name: string; value: number; error?: string; disabled: boolean;
  onChange: (value: number) => void; onSubmit: () => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return <label className="numeric-field">
    <span>{label}</span>
    <input aria-label={name} title={error ?? name} inputMode="decimal" type="text" autoComplete="off" spellCheck={false}
      value={draft} disabled={disabled} aria-invalid={Boolean(error)}
      style={{ '--digits': Math.min(14, Math.max(1, draft.length)) } as CSSProperties}
      onChange={event => { setDraft(event.target.value); onChange(event.target.value.trim() ? Number(event.target.value) : NaN); }}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onSubmit(); } }} />
  </label>;
}

export default function App() {
  const [tab, setTab] = useState<'quick' | 'custom'>('quick');
  const [configs, setConfigs] = useState<FillConfigMap>(() => structuredClone(DEFAULT_CONFIGS));
  const [text, setText] = useState('');
  const [random, setRandom] = useState(false);
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState<{ id: string; kind: FillKind | 'custom' } | null>(null);
  const pendingRef = useRef<typeof pending>(null);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribe(message => {
      if (message.type === 'selection-state') { setCount(message.count); return; }
      if (message.requestId !== pendingRef.current?.id) return;
      pendingRef.current = null; setPending(null);
      const error = message.error ?? (message.updated === 0 ? '没有可填充的文本' : undefined);
      setNotice(error ? { message: error, error: true } : null);
    });
    send({ type: 'get-selection' });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const update = <K extends FillKind,>(kind: K, changes: Partial<FillConfigMap[K]>) => {
    setConfigs(current => ({ ...current, [kind]: { ...current[kind], ...changes } }));
  };
  const execute = (request: (FillConfig & { type: 'apply-quick-fill' }) | Omit<CustomFillRequest, 'requestId'>, kind: FillKind | 'custom') => {
    if (pendingRef.current) return;
    const id = `${Date.now()}-${++counter.current}`;
    const next = { id, kind };
    pendingRef.current = next; setPending(next); setNotice(null);
    send({ ...request, requestId: id } as FillRequest);
  };
  const quick = (kind: FillKind) => {
    const input = { kind, config: configs[kind] } as FillConfig;
    const error = configError(input);
    if (error) { setNotice({ message: error, error: true }); return; }
    execute({ type: 'apply-quick-fill', ...input }, kind);
  };
  const busy = pending !== null;

  const parameters = (kind: FillKind) => {
    const c = configs[kind];
    const error = configError({ kind, config: c });
    const number = (label: string, key: string, value: number, change: (value: number) => void) => (
      <NumericField key={key} label={label} name={`${FILL_LABELS[kind]}${label}`} value={value} error={error} disabled={busy} onChange={change} onSubmit={() => quick(kind)} />
    );
    const order = (value: Order, onChange: (value: Order) => void) => <div className="option-field"><span>排序</span><Segmented label={`${FILL_LABELS[kind]}排序`} value={value} options={ORDER_OPTIONS} onChange={onChange} disabled={busy} /></div>;
    switch (kind) {
      case 'number': return <>
        {number('最小', 'min', configs.number.min, min => update(kind, { min }))}
        {number('最大', 'max', configs.number.max, max => update(kind, { max }))}
        {number('小数', 'decimals', configs.number.decimals, decimals => update(kind, { decimals }))}
      </>;
      case 'sequence': return <>
        {number('起始', 'start', configs.sequence.start, start => update(kind, { start }))}
        {number('间隔', 'step', configs.sequence.step, step => update(kind, { step }))}
        {number('补零', 'padding', configs.sequence.padding, padding => update(kind, { padding }))}
        {order(configs.sequence.order, order => update(kind, { order }))}
      </>;
      case 'date': return <>
        <div className="option-field"><span>格式</span><Segmented label="日期格式" value={configs.date.format} options={DATE_OPTIONS} onChange={format => update(kind, { format })} disabled={busy} /></div>
        {order(configs.date.order, order => update(kind, { order }))}
      </>;
      case 'time': return <div className="option-field"><span>格式</span><Segmented label="时间格式" value={configs.time.format} options={TIME_OPTIONS} onChange={format => update(kind, { format })} disabled={busy} /></div>;
      case 'phone': return <div className="option-field"><span>格式</span><Segmented label="手机格式" value={configs.phone.format} options={PHONE_OPTIONS} onChange={format => update(kind, { format })} disabled={busy} /></div>;
      case 'age': return <>
        {number('最小', 'min', configs.age.min, min => update(kind, { min }))}
        {number('最大', 'max', configs.age.max, max => update(kind, { max }))}
      </>;
      case 'paragraph': return <>
        <div className="option-field"><span>类型</span><Segmented label="段落类型" value={configs.paragraph.category} options={PARAGRAPH_OPTIONS} onChange={category => update(kind, { category })} disabled={busy} /></div>
        {number('最少', 'min', configs.paragraph.min, min => update(kind, { min }))}
        {number('最多', 'max', configs.paragraph.max, max => update(kind, { max }))}
      </>;
      default: return null;
    }
  };

  return <main className={`plugin-panel ${tab}`} aria-label="西无 · 文本填充" aria-busy={busy}>
    <nav className="tabs" role="tablist" aria-label="填充方式">
      {(['quick', 'custom'] as const).map(value => <button type="button" key={value} id={`tab-${value}`} role="tab"
        aria-selected={tab === value} aria-controls={`panel-${value}`} tabIndex={tab === value ? 0 : -1}
        onClick={() => { setTab(value); setNotice(null); }}
        onKeyDown={event => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'quick' : event.key === 'End' ? 'custom' : value === 'quick' ? 'custom' : 'quick';
          setTab(next); setNotice(null); document.getElementById(`tab-${next}`)?.focus();
        }}>{value === 'quick' ? '快速填充' : '自定义填充'}</button>)}
    </nav>
    <section id="panel-quick" role="tabpanel" aria-labelledby="tab-quick" hidden={tab !== 'quick'} className="quick-panel">
      <div className="fill-grid">
        {FILL_KINDS.map(kind => {
          const hasParameters = PARAMETER_KINDS.includes(kind);
          return <div key={kind} className={`fill-row ${hasParameters ? 'with-parameters' : ''} kind-${kind}`} data-kind={kind}>
            <span className="fill-name">{FILL_LABELS[kind]}</span>
            {hasParameters && <>
              <span className="parameter-hint" aria-hidden="true">参数<SlidersHorizontal size={10} strokeWidth={2} /></span>
              <div className="parameters">{parameters(kind)}</div>
            </>}
            <button type="button" className="execute" aria-label={`填充${FILL_LABELS[kind]}`} title={`填充${FILL_LABELS[kind]} · ${count} 个文本`}
              onClick={() => quick(kind)} disabled={busy} aria-busy={pending?.kind === kind}>
              {pending?.kind === kind ? <span className="loading-dots">...</span> : <CirclePlay size={14} strokeWidth={2} aria-hidden="true" />}
            </button>
          </div>;
        })}
      </div>
    </section>
    <section id="panel-custom" role="tabpanel" aria-labelledby="tab-custom" hidden={tab !== 'custom'} className="custom-panel">
      <textarea aria-label="自定义文本" placeholder={'请输入自定义文本，每行填充一个文本\n用回车换行'} spellCheck={false}
        value={text} disabled={busy} onChange={event => setText(event.target.value)} />
      <div className="custom-footer">
        <label className="random-option">
          <input type="checkbox" checked={random} disabled={busy} onChange={event => setRandom(event.target.checked)} />
          <span className="checkbox" aria-hidden="true">{random && <Check size={10} strokeWidth={2} />}</span>
          <span>随机填充</span>
        </label>
        <button type="button" className="confirm" disabled={busy || splitLines(text).length === 0}
          onClick={() => execute({ type: 'apply-custom-fill', lines: splitLines(text), random }, 'custom')}>
          {pending?.kind === 'custom' ? '...' : '确定'}
        </button>
      </div>
    </section>
    {notice && <div className={`notice ${notice.error ? 'error' : ''}`} role="status" aria-live="polite">{notice.message}</div>}
  </main>;
}
