import type { Operation, OperationResultMessage, PluginResponse, UiRequest } from '../shared/messages';
import { extractText, replaceText, splitText, type OperationOutcome } from './operations';
import { getSelectionSummary } from './selection';

figma.showUI(__html__, {
  width: 360,
  height: 440,
  themeColors: true,
});

function postMessage(message: PluginResponse): void {
  figma.ui.postMessage(message);
}

function postSelection(): void {
  postMessage(getSelectionSummary(figma.currentPage.selection));
}

function operationFor(request: UiRequest): Operation | null {
  if (request.type === 'replace' || request.type === 'extract' || request.type === 'split') return request.type;
  return null;
}

async function runOperation(request: UiRequest): Promise<void> {
  const operation = operationFor(request);
  if (!operation || !('requestId' in request)) return;

  try {
    let outcome: OperationOutcome;
    if (request.type === 'replace') outcome = await replaceText(request);
    else if (request.type === 'extract') outcome = extractText(request);
    else if (request.type === 'split') outcome = await splitText(request);
    else return;

    const response: OperationResultMessage = {
      type: 'operation-result',
      requestId: request.requestId,
      operation,
      ok: true,
      message: outcome.message,
      extractedText: outcome.extractedText,
    };
    postMessage(response);
    if (operation !== 'extract') figma.notify(outcome.message);
    if (operation !== 'extract') postSelection();
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败';
    postMessage({
      type: 'operation-result',
      requestId: request.requestId,
      operation,
      ok: false,
      message,
    });
    figma.notify(message, { error: true });
  }
}

figma.ui.onmessage = (request: UiRequest) => {
  if (request.type === 'selection-request') {
    postSelection();
    return;
  }
  if (request.type === 'notify') {
    figma.notify(request.message);
    return;
  }
  void runOperation(request);
};

figma.on('selectionchange', postSelection);
postSelection();
