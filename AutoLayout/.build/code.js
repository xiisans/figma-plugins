"use strict";
const UI_WIDTH = 360;
const UI_MIN_HEIGHT = 220;
const UI_MAX_HEIGHT = 520;
figma.showUI(__html__, { width: UI_WIDTH, height: UI_MIN_HEIGHT, themeColors: true });
function postSelectionState() {
    figma.ui.postMessage({
        type: 'selection-state',
        hasSelection: figma.currentPage.selection.length > 0
    });
}
figma.on('selectionchange', postSelectionState);
postSelectionState();
function resizeUI(height) {
    const numericHeight = typeof height === 'number' && Number.isFinite(height) ? Math.ceil(height) : UI_MIN_HEIGHT;
    const nextHeight = Math.max(UI_MIN_HEIGHT, Math.min(UI_MAX_HEIGHT, numericHeight));
    figma.ui.resize(UI_WIDTH, nextHeight);
}
function isSceneNode(node) {
    return Boolean(node && typeof node.type === 'string' && node.type !== 'PAGE' && node.type !== 'DOCUMENT');
}
function hasAutoLayout(node) {
    return isSceneNode(node) && typeof node.layoutMode === 'string' && node.layoutMode !== 'NONE';
}
function protectedAncestorReason(node) {
    let current = node.parent;
    while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
        if (current.type === 'INSTANCE')
            return '节点位于组件实例内部';
        if (current.type === 'COMPONENT' || current.type === 'COMPONENT_SET') {
            return '节点位于主组件内部，请选择独立的组件本身进行处理';
        }
        current = current.parent;
    }
    return null;
}
function canHaveChildren(node) {
    return Boolean(node && typeof node.appendChild === 'function');
}
function applyToExistingAutoLayout(node, values) {
    node.paddingTop = values.top;
    node.paddingRight = values.right;
    node.paddingBottom = values.bottom;
    node.paddingLeft = values.left;
    node.itemSpacing = values.gap;
    node.layoutSizingHorizontal = 'HUG';
    node.layoutSizingVertical = 'HUG';
}
function wrapperName(node) {
    return `Auto Layout - ${node.name || node.type}`;
}
function wrapNode(node, values) {
    if (!node.parent || !canHaveChildren(node.parent)) {
        throw new Error('节点所在父级不支持重新挂载');
    }
    const parent = node.parent;
    const originalIndex = Array.isArray(parent.children) ? parent.children.indexOf(node) : -1;
    const originalX = typeof node.x === 'number' ? node.x : 0;
    const originalY = typeof node.y === 'number' ? node.y : 0;
    const originalWidth = Math.max(1, typeof node.width === 'number' ? node.width : 1);
    const originalHeight = Math.max(1, typeof node.height === 'number' ? node.height : 1);
    const originalRotation = typeof node.rotation === 'number' ? node.rotation : 0;
    const originalLayoutAlign = node.layoutAlign;
    const originalLayoutGrow = node.layoutGrow;
    const originalLayoutPositioning = node.layoutPositioning;
    const parentUsesAutoLayout = typeof parent.layoutMode === 'string' && parent.layoutMode !== 'NONE';
    const wrapper = figma.createFrame();
    let moved = false;
    try {
        wrapper.name = wrapperName(node);
        wrapper.fills = [];
        wrapper.clipsContent = false;
        wrapper.layoutMode = 'VERTICAL';
        wrapper.primaryAxisSizingMode = 'FIXED';
        wrapper.counterAxisSizingMode = 'FIXED';
        wrapper.paddingTop = values.top;
        wrapper.paddingRight = values.right;
        wrapper.paddingBottom = values.bottom;
        wrapper.paddingLeft = values.left;
        wrapper.itemSpacing = values.gap;
        wrapper.resize(originalWidth + values.left + values.right, originalHeight + values.top + values.bottom);
        if (originalIndex >= 0 && typeof parent.insertChild === 'function') {
            parent.insertChild(originalIndex, wrapper);
        }
        else {
            parent.appendChild(wrapper);
        }
        wrapper.appendChild(node);
        moved = true;
        // The resulting Auto Layout frame should adapt to its child on both axes.
        // Set this after parenting so Figma accepts HUG in every structural context.
        wrapper.layoutSizingHorizontal = 'HUG';
        wrapper.layoutSizingVertical = 'HUG';
        // Keep rotation on the original node so its rotation center and visual
        // appearance stay unchanged. The wrapper only adds the outer padding.
        wrapper.rotation = 0;
        node.rotation = originalRotation;
        if ('layoutPositioning' in node)
            node.layoutPositioning = 'AUTO';
        if (parentUsesAutoLayout) {
            if ('layoutAlign' in wrapper && originalLayoutAlign !== undefined)
                wrapper.layoutAlign = originalLayoutAlign;
            if ('layoutGrow' in wrapper && originalLayoutGrow !== undefined)
                wrapper.layoutGrow = originalLayoutGrow;
            if ('layoutPositioning' in wrapper && originalLayoutPositioning !== undefined) {
                wrapper.layoutPositioning = originalLayoutPositioning;
            }
            if (originalLayoutPositioning === 'ABSOLUTE') {
                wrapper.x = originalX;
                wrapper.y = originalY;
            }
        }
        else {
            wrapper.x = originalX - values.left;
            wrapper.y = originalY - values.top;
        }
        return wrapper;
    }
    catch (error) {
        try {
            if (moved && typeof parent.insertChild === 'function') {
                parent.insertChild(Math.max(0, originalIndex), node);
                node.x = originalX;
                node.y = originalY;
                node.rotation = originalRotation;
            }
            if (wrapper && typeof wrapper.remove === 'function')
                wrapper.remove();
        }
        catch (_) {
            // Preserve the original Figma API error.
        }
        throw error;
    }
}
function processNode(node, values) {
    const base = { name: node.name || '(未命名)', type: node.type };
    if (!isSceneNode(node)) {
        return { output: null, item: { ...base, status: 'skipped', reason: '不是可处理的图层' } };
    }
    if (node.locked) {
        return { output: node, item: { ...base, status: 'skipped', reason: '图层已锁定' } };
    }
    if (node.type === 'INSTANCE') {
        return { output: node, item: { ...base, status: 'skipped', reason: '组件实例不可安全重排' } };
    }
    const ancestorReason = protectedAncestorReason(node);
    if (ancestorReason) {
        return { output: node, item: { ...base, status: 'skipped', reason: ancestorReason } };
    }
    try {
        if (hasAutoLayout(node)) {
            applyToExistingAutoLayout(node, values);
            return { output: node, item: { ...base, status: 'success' } };
        }
        const wrapper = wrapNode(node, values);
        return { output: wrapper, item: { ...base, status: 'success' } };
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : 'Figma API 拒绝了该操作';
        return { output: node, item: { ...base, status: 'failed', reason } };
    }
}
function validateValues(values) {
    const keys = ['top', 'right', 'bottom', 'left', 'gap'];
    for (const key of keys) {
        const value = values[key];
        if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
            return `${key} 必须是非负整数`;
        }
        if (value > 10000)
            return `${key} 不能大于 10000`;
    }
    return null;
}
figma.ui.onmessage = (message) => {
    if (message && message.type === 'ui-ready') {
        postSelectionState();
        return;
    }
    if (message && message.type === 'resize') {
        resizeUI(message.height);
        return;
    }
    if (!message || message.type !== 'apply')
        return;
    const validationError = validateValues(message.values);
    if (validationError) {
        figma.ui.postMessage({ type: 'result', ok: false, message: validationError });
        return;
    }
    const selection = [...figma.currentPage.selection];
    if (selection.length === 0) {
        postSelectionState();
        figma.ui.postMessage({ type: 'complete' });
        return;
    }
    const items = [];
    const outputs = [];
    for (const node of selection) {
        const result = processNode(node, message.values);
        items.push(result.item);
        if (result.output)
            outputs.push(result.output);
    }
    figma.currentPage.selection = outputs;
    postSelectionState();
    const summary = {
        success: items.filter((item) => item.status === 'success').length,
        skipped: items.filter((item) => item.status === 'skipped').length,
        failed: items.filter((item) => item.status === 'failed').length,
        total: items.length
    };
    if (summary.success > 0 && typeof figma.commitUndo === 'function')
        figma.commitUndo();
    const hasIssues = summary.skipped > 0 || summary.failed > 0;
    figma.ui.postMessage(hasIssues ? {
        type: 'result',
        ok: summary.success > 0 && summary.failed === 0,
        message: '处理完成，但有元素被跳过或失败。',
        summary,
        items
    } : { type: 'complete' });
};
