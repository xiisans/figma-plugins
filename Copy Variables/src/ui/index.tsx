import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronRight, Circle, Folder, Layers3, RefreshCw } from 'lucide-react';
import type { ClipboardData, CurrentVariablesPayload, PluginResponse, TreeCollection, TreeGroup, TreeNode, TreeVariable } from '../shared/types';
import { collectionToTree, flattenVariableKeys } from '../shared/tree';
import './styles.css';

type Mode = 'copy' | 'paste';

const send = (message: unknown) => parent.postMessage({ pluginMessage: message }, '*');

function countVariables(nodes: TreeCollection[]) {
  return nodes.reduce((total, node) => total + flattenVariableKeys(node).length, 0);
}

function clipboardTrees(clipboard: ClipboardData | null): TreeCollection[] {
  return clipboard ? clipboard.collections.map(collectionToTree) : [];
}

function descendants(node: TreeNode): string[] {
  if (node.kind === 'variable') return [node.key];
  return [...node.children.flatMap(descendants), ...node.variables.map((variable) => variable.key)];
}

function SelectionCheckbox({ state, onChange }: { state: 'checked' | 'mixed' | 'empty'; onChange: () => void }) {
  return (
    <button
      type="button"
      className={`check ${state}`}
      aria-label={state === 'checked' ? '取消选择' : '选择'}
      onClick={(event) => { event.stopPropagation(); onChange(); }}
    >
      {state === 'checked' ? '✓' : state === 'mixed' ? '−' : ''}
    </button>
  );
}

function TreeRow({
  node,
  selected,
  expanded,
  onToggleExpand,
  onToggleSelection,
  depth
}: {
  node: TreeNode;
  selected: Set<string>;
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  onToggleSelection: (node: TreeNode) => void;
  depth: number;
}) {
  const keys = descendants(node);
  const selectedCount = keys.filter((key) => selected.has(key)).length;
  const state = selectedCount === keys.length ? 'checked' : selectedCount ? 'mixed' : 'empty';
  const isBranch = node.kind !== 'variable';
  const label = node.kind === 'variable' ? node.name : node.name;
  const detail = node.kind === 'variable' ? node.variable.type : node.kind === 'collection' ? `${node.collection.variables.length} 个变量` : '';

  return (
    <>
      <div className="tree-row" style={{ paddingLeft: `${10 + depth * 18}px` }}>
        {isBranch ? (
          <button type="button" className={`chevron ${expanded.has(node.key) ? 'open' : ''}`} aria-label="展开或收起" onClick={() => onToggleExpand(node.key)}><ChevronRight size={14} /></button>
        ) : <span className="chevron-placeholder" />}
        <span className={`node-icon ${node.kind}`} aria-hidden="true">{node.kind === 'collection' ? <Layers3 size={13} /> : node.kind === 'group' ? <Folder size={13} /> : <Circle size={6} fill="currentColor" />}</span>
        <span className="node-label" title={node.kind === 'variable' ? node.fullName : node.name}>{label}</span>
        {detail && <span className="node-detail">{detail}</span>}
        <SelectionCheckbox state={state} onChange={() => onToggleSelection(node)} />
      </div>
      {isBranch && expanded.has(node.key) && (
        <>
          {node.children.map((child) => (
            <TreeRow key={child.key} node={child} selected={selected} expanded={expanded} onToggleExpand={onToggleExpand} onToggleSelection={onToggleSelection} depth={depth + 1} />
          ))}
          {node.variables.map((variable) => (
            <TreeRow key={variable.key} node={variable} selected={selected} expanded={expanded} onToggleExpand={onToggleExpand} onToggleSelection={onToggleSelection} depth={depth + 1} />
          ))}
        </>
      )}
    </>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>('copy');
  const [current, setCurrent] = useState<CurrentVariablesPayload | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('正在加载变量…');

  const nodes = useMemo(() => mode === 'copy' ? current?.collections ?? [] : clipboardTrees(clipboard), [clipboard, current, mode]);
  const variableCount = countVariables(nodes);
  const allVariableKeys = useMemo(() => nodes.flatMap(flattenVariableKeys), [nodes]);
  const selectedVariableCount = allVariableKeys.filter((key) => selected.has(key)).length;
  const selectAllState = selectedVariableCount === 0
    ? 'empty'
    : selectedVariableCount === allVariableKeys.length
      ? 'checked'
      : 'mixed';

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ pluginMessage?: PluginResponse }>) => {
      const response = event.data.pluginMessage;
      if (!response) return;
      if (response.type === 'data-loaded') {
        setRefreshing(false);
        setCurrent(response.current);
        setClipboard(response.clipboard);
        const isTargetFile = Boolean(response.clipboard && (
          response.clipboard.sourceFileKey && response.current.fileKey
            ? response.clipboard.sourceFileKey !== response.current.fileKey
            : response.clipboard.sourceFileName !== response.current.fileName
        ));
        setMode(isTargetFile ? 'paste' : 'copy');
        setMessage(isTargetFile || response.current.collections.length ? '' : '当前文件还没有本地变量');
      }
      if (response.type === 'operation-result') {
        setBusy(false);
        if (response.result.clipboard) setClipboard(response.result.clipboard);
        setMessage(response.result.message);
        if (response.result.ok && mode === 'copy') setMode('paste');
      }
      if (response.type === 'error') {
        setBusy(false);
        setRefreshing(false);
        setMessage(response.message);
      }
    };
    window.addEventListener('message', onMessage);
    send({ type: 'load-data' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    setSelected(new Set(mode === 'paste' ? nodes.flatMap(flattenVariableKeys) : []));
    setExpanded(new Set());
  }, [mode, clipboard, current]);

  const toggleSelection = (node: TreeNode) => {
    setSelected((previous) => {
      const next = new Set(previous);
      const keys = descendants(node);
      const shouldSelect = keys.some((key) => !next.has(key));
      keys.forEach((key) => shouldSelect ? next.add(key) : next.delete(key));
      return next;
    });
  };

  const submit = () => {
    if (!selected.size || busy) return;
    setBusy(true);
    setMessage(mode === 'copy' ? '正在复制…' : '正在粘贴…');
    send({ type: mode === 'copy' ? 'copy-selection' : 'paste-selection', keys: Array.from(selected) });
  };

  const refresh = () => {
    if (busy || refreshing) return;
    setRefreshing(true);
    setMessage('正在刷新列表…');
    send({ type: 'load-data' });
  };

  const toggleSelectAll = () => {
    setSelected(selectAllState === 'checked' ? new Set() : new Set(allVariableKeys));
  };

  const hasClipboard = Boolean(clipboard && clipboard.collections.length);
  const actionLabel = mode === 'copy' ? '复制' : '粘贴';

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1 title={current?.fileName ?? '当前文件'}>{current?.fileName ?? '当前文件'}</h1>
        <div className="header-actions">
          <button type="button" className="refresh-button" aria-label="刷新变量列表" title="刷新变量列表" disabled={busy || refreshing} onClick={refresh}>
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
          </button>
          <div className="mode-switch" role="tablist" aria-label="操作模式">
            <button className={mode === 'copy' ? 'active' : ''} onClick={() => { setMessage(''); setMode('copy'); }}>复制</button>
            <button className={mode === 'paste' ? 'active' : ''} disabled={!hasClipboard} onClick={() => { setMessage(''); setMode('paste'); }}>粘贴</button>
          </div>
        </div>
      </header>

      <section className="tree-panel" aria-label="变量列表">
        {nodes.length ? nodes.map((node) => (
          <TreeRow key={node.key} node={node} selected={selected} expanded={expanded} onToggleExpand={(key) => setExpanded((previous) => {
            const next = new Set(previous);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
          })} onToggleSelection={toggleSelection} depth={0} />
        )) : <div className="empty-state"><span className="empty-mark">◇</span><strong>{message || '暂无内容'}</strong><small>{mode === 'copy' ? '在当前文件创建本地变量后即可复制' : '先在源文件选择变量并点击复制'}</small></div>}
      </section>

      <footer className="app-footer">
        <div className="select-all-control">
          <SelectionCheckbox state={selectAllState} onChange={toggleSelectAll} />
          <span>全选</span>
        </div>
        <div className="footer-status">{message || `${selectedVariableCount} 项已选择 · ${variableCount} 个变量`}</div>
        <button className="primary-action" disabled={!selected.size || busy || !nodes.length} onClick={submit}>{busy ? '处理中…' : actionLabel}</button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
