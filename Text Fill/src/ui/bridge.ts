import { customValues, generateValues } from '../shared/generators';
import type { FillRequest, HostMessage, UIMessage } from '../shared/types';

declare global {
  interface Window {
    __TEXT_FILL_PREVIEW__?: { values: string[]; request: FillRequest };
  }
}

const standalone = window.parent === window;
const listeners = new Set<(message: HostMessage) => void>();
const emit = (message: HostMessage) => listeners.forEach(listener => listener(message));

export function subscribe(listener: (message: HostMessage) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

window.addEventListener('message', event => {
  // Figma can relay replies through other frames or this window, not only parent.
  // Validate the payload here; App matches completion to the pending request ID.
  if (standalone) return;
  const message = event.data?.pluginMessage as HostMessage | undefined;
  if (message?.type === 'selection-state' && Number.isInteger(message.count) && message.count >= 0) emit(message);
  if (message?.type === 'fill-result' && typeof message.requestId === 'string'
    && Number.isInteger(message.updated) && message.updated >= 0
    && Number.isInteger(message.skipped) && message.skipped >= 0
    && (message.error === undefined || typeof message.error === 'string')) emit(message);
});

export function send(message: UIMessage): void {
  if (!standalone) { window.parent.postMessage({ pluginMessage: message }, '*'); return; }
  if (message.type === 'get-selection') { emit({ type: 'selection-state', count: import.meta.env.DEV ? 8 : 0 }); return; }
  if (!import.meta.env.DEV) {
    emit({ type: 'fill-result', requestId: message.requestId, updated: 0, skipped: 0, error: '请在 Figma 中运行插件' });
    return;
  }
  window.setTimeout(() => {
    try {
      const values = message.type === 'apply-quick-fill' ? generateValues(message, 8) : customValues(message.lines, 8, message.random);
      window.__TEXT_FILL_PREVIEW__ = { request: message, values };
      emit({ type: 'fill-result', requestId: message.requestId, updated: values.length, skipped: 0 });
    } catch (error) {
      emit({ type: 'fill-result', requestId: message.requestId, updated: 0, skipped: 0, error: error instanceof Error ? error.message : '生成失败' });
    }
  }, 180);
}
