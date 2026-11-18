import { applyFill } from './fill';
import { collectTextNodes } from './selection';
import type { FillResult, HostMessage } from '../shared/types';

declare const __html__: string;

figma.showUI(__html__, { width: 360, height: 440, themeColors: true });

const send = (message: HostMessage) => figma.ui.postMessage(message);
function selectionState() {
  send({ type: 'selection-state', count: collectTextNodes(figma.currentPage.selection).length });
}
figma.on('selectionchange', selectionState);
figma.on('currentpagechange', selectionState);
let busy = false;
figma.ui.onmessage = async (message: unknown) => {
  if (typeof message !== 'object' || !message || !('type' in message)) return;
  if (message.type === 'get-selection') { selectionState(); return; }
  if (message.type !== 'apply-quick-fill' && message.type !== 'apply-custom-fill') return;
  if (busy) {
    send({ type: 'fill-result', requestId: 'requestId' in message && typeof message.requestId === 'string' ? message.requestId : '', updated: 0, skipped: 0, error: '正在填充，请稍后重试' });
    return;
  }
  busy = true;
  let result: FillResult = {
    type: 'fill-result', requestId: 'requestId' in message && typeof message.requestId === 'string' ? message.requestId : '',
    updated: 0, skipped: 0,
  };
  try {
    const roots = [...figma.currentPage.selection];
    result = await applyFill(figma, roots, message);
    if (result.updated) figma.commitUndo();
    figma.notify(result.updated ? `已填充 ${result.updated} 个文本${result.skipped ? `，跳过 ${result.skipped} 个` : ''}` : result.error ?? '没有可填充的文本', { error: !result.updated });
  } catch (error) {
    result.error = [result.error, error instanceof Error ? error.message : '填充失败，请重试'].filter(Boolean).join('；');
  } finally {
    busy = false;
    send(result);
    selectionState();
  }
};
selectionState();
