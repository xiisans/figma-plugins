import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FillResult } from '../src/shared/types';

const { fill } = vi.hoisted(() => ({ fill: vi.fn() }));
vi.mock('../src/plugin/fill', () => ({ applyFill: fill }));

const request = (requestId = 'first') => ({ type: 'apply-quick-fill', requestId, kind: 'name', config: {} });
const success = (requestId = 'first'): FillResult => ({ type: 'fill-result', requestId, updated: 1, skipped: 0 });

async function start() {
  const api = {
    showUI: vi.fn(), on: vi.fn(), currentPage: { selection: [] },
    ui: { postMessage: vi.fn(), onmessage: undefined as ((input: unknown) => Promise<void>) | undefined },
    commitUndo: vi.fn(), notify: vi.fn(),
  };
  vi.stubGlobal('figma', api);
  vi.stubGlobal('__html__', '<html></html>');
  await import('../src/plugin/main');
  return api;
}

beforeEach(() => { vi.resetModules(); fill.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('main thread completion', () => {
  it('returns a completion result after a successful fill', async () => {
    fill.mockResolvedValue(success());
    const api = await start();
    await api.ui.onmessage!(request());
    expect(api.ui.postMessage).toHaveBeenCalledWith(success());
    expect(api.commitUndo).toHaveBeenCalledOnce();
  });

  it.each(['commitUndo', 'notify'] as const)('completes and accepts the next request when %s throws', async method => {
    fill.mockResolvedValueOnce(success()).mockResolvedValueOnce(success('second'));
    const api = await start();
    api[method].mockImplementationOnce(() => { throw new Error('host failure'); });
    await api.ui.onmessage!(request());
    expect(api.ui.postMessage).toHaveBeenCalledWith({ ...success(), error: 'host failure' });
    await api.ui.onmessage!(request('second'));
    expect(fill).toHaveBeenCalledTimes(2);
    expect(api.ui.postMessage).toHaveBeenCalledWith(success('second'));
  });

  it('reports unexpected failures and releases the execution lock', async () => {
    fill.mockRejectedValueOnce(new Error('fill failed')).mockResolvedValueOnce(success('second'));
    const api = await start();
    await api.ui.onmessage!(request());
    expect(api.ui.postMessage).toHaveBeenCalledWith({ ...success(), updated: 0, error: 'fill failed' });
    await api.ui.onmessage!(request('second'));
    expect(api.ui.postMessage).toHaveBeenCalledWith(success('second'));
  });

  it('rejects overlapping execution but accepts a request after completion', async () => {
    let finish!: (result: FillResult) => void;
    fill.mockReturnValueOnce(new Promise<FillResult>(resolve => { finish = resolve; })).mockResolvedValueOnce(success('third'));
    const api = await start();
    const running = api.ui.onmessage!(request());
    await api.ui.onmessage!(request('second'));
    expect(api.ui.postMessage).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'second', error: '正在填充，请稍后重试' }));
    expect(fill).toHaveBeenCalledOnce();
    finish(success());
    await running;
    await api.ui.onmessage!(request('third'));
    expect(api.ui.postMessage).toHaveBeenCalledWith(success('third'));
  });
});
