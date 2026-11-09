import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginResponse } from '../shared/messages';
import { App } from './App';

function sendPluginMessage(message: PluginResponse): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage: message } }));
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  });

  it('enables replacement only when selection and input are valid', async () => {
    render(<App />);
    const submit = screen.getByRole('button', { name: '确定' });
    expect(submit).toBeDisabled();

    sendPluginMessage({
      type: 'selection-changed',
      selectedCount: 1,
      textCount: 1,
      splitEligible: true,
    });
    fireEvent.change(screen.getByPlaceholderText('请输入文本，为空时则替换全部'), {
      target: { value: '模型版本' },
    });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(screen.getByRole('button', { name: '...' })).toBeDisabled();
    expect(window.parent.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pluginMessage: expect.objectContaining({ type: 'replace', find: '模型版本' }),
      }),
      '*',
    );
  });

  it('renders extracted text returned by the plugin', async () => {
    render(<App />);
    sendPluginMessage({
      type: 'selection-changed',
      selectedCount: 1,
      textCount: 2,
      splitEligible: false,
    });
    fireEvent.click(screen.getByRole('button', { name: '提取' }));
    fireEvent.click(screen.getAllByRole('button', { name: '提取' })[1]);

    const calls = vi
      .mocked(window.parent.postMessage)
      .mock.calls.map(([payload]) => payload as { pluginMessage?: { type: string; requestId?: string } })
      .reverse();
    const call = calls.find((payload) => payload.pluginMessage?.type === 'extract');
    const id = call?.pluginMessage?.requestId;
    expect(id).toBeTruthy();

    sendPluginMessage({
      type: 'operation-result',
      requestId: id!,
      operation: 'extract',
      ok: true,
      extractedText: '第一段\n第二段',
    });
    expect(await screen.findByText('已完成提取')).toBeInTheDocument();
    expect(screen.getByText(/第一段/)).toHaveTextContent('第一段 第二段');
    expect(screen.getByRole('button', { name: '复制' })).toBeEnabled();
  });

  it('shows split options only for direct text selections', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '拆分' }));
    expect(screen.getByText('请选择纯文本')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '元素间距' })).not.toBeInTheDocument();

    sendPluginMessage({
      type: 'selection-changed',
      selectedCount: 2,
      textCount: 2,
      splitEligible: true,
    });
    await waitFor(() => expect(screen.getByRole('group', { name: '元素间距' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '纵向' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '4' })).toHaveAttribute('aria-pressed', 'true');
  });
});
