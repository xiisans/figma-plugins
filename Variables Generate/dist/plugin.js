"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/shared/logic.ts
  var INVALID_SELECTION_MESSAGE = "\u8BF7\u4FDD\u8BC1\u9009\u4E2D\u7684\u5143\u7D20\u5747\u4E3A\u586B\u5145\u753B\u677F\u6216\u5747\u4E3A\u975E\u7A7A\u6587\u672C";
  function parseStrictNumber(value) {
    const normalized = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function compareByCanvasPosition(a, b) {
    return a.y - b.y || a.x - b.x;
  }
  function deriveGroupNames(variableNames) {
    const groups = /* @__PURE__ */ new Set();
    for (const name of variableNames) {
      const separatorIndex = name.lastIndexOf("/");
      if (separatorIndex > 0) {
        groups.add(name.slice(0, separatorIndex));
      }
    }
    return [...groups].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  // src/plugin/main.ts
  figma.showUI(__html__, { width: 600, height: 400, themeColors: true });
  function send(message) {
    figma.ui.postMessage(message);
  }
  function colorToHex(r, g, b) {
    const hex = (channel) => Math.round(channel * 255).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
  }
  function getPosition(node) {
    const bounds = node.absoluteBoundingBox;
    return bounds ? { x: bounds.x, y: bounds.y } : { x: 0, y: 0 };
  }
  function getColor(node) {
    var _a;
    if (!("fills" in node) || !Array.isArray(node.fills)) return null;
    const paint = node.fills.find(
      (candidate) => candidate.type === "SOLID" && candidate.visible !== false
    );
    if (!paint) return null;
    const alpha = Math.max(0, Math.min(1, (_a = paint.opacity) != null ? _a : 1));
    const a = alpha;
    return {
      r: paint.color.r,
      g: paint.color.g,
      b: paint.color.b,
      a,
      hex: colorToHex(paint.color.r, paint.color.g, paint.color.b)
    };
  }
  function previewText(node) {
    const numericValue = parseStrictNumber(node.characters);
    const position = getPosition(node);
    return __spreadProps(__spreadValues({
      nodeId: node.id,
      nodeType: node.type
    }, position), {
      displayValue: node.characters,
      variableValue: numericValue != null ? numericValue : node.characters,
      resolvedType: numericValue === null ? "STRING" : "FLOAT"
    });
  }
  function readSelection() {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) return { status: "empty", items: [] };
    const kinds = /* @__PURE__ */ new Set();
    const items = [];
    for (const node of selection) {
      if (node.type === "TEXT") {
        if (!node.characters.trim()) {
          return { status: "invalid", items: [], message: INVALID_SELECTION_MESSAGE };
        }
        kinds.add("text");
        items.push(previewText(node));
        continue;
      }
      const color = getColor(node);
      if (!color) {
        return { status: "invalid", items: [], message: INVALID_SELECTION_MESSAGE };
      }
      kinds.add("color");
      items.push(__spreadProps(__spreadValues({
        nodeId: node.id,
        nodeType: node.type
      }, getPosition(node)), {
        displayValue: color.hex,
        variableValue: { r: color.r, g: color.g, b: color.b, a: color.a },
        resolvedType: "COLOR",
        color
      }));
    }
    if (kinds.size !== 1) {
      return { status: "invalid", items: [], message: INVALID_SELECTION_MESSAGE };
    }
    items.sort(compareByCanvasPosition);
    return { status: "valid", kind: kinds.values().next().value, items };
  }
  async function readCollections() {
    const [collections, variables] = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync()
    ]);
    return collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      groups: deriveGroupNames(
        variables.filter((variable) => variable.variableCollectionId === collection.id).map((variable) => variable.name)
      )
    })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }
  async function refreshCollections() {
    send({ type: "collections-change", collections: await readCollections() });
  }
  async function sendInitialState() {
    send({
      type: "initial-state",
      collections: await readCollections(),
      selection: readSelection()
    });
  }
  function isResolvedType(value) {
    return value === "COLOR" || value === "FLOAT" || value === "STRING";
  }
  async function generate(request) {
    var _a, _b;
    const collectionName = request.collectionName.trim();
    const groupName = request.groupName.trim().replace(/^\/+|\/+$/g, "");
    if (!collectionName || !groupName) throw new Error("\u8BF7\u586B\u5199\u96C6\u5408\u548C\u5206\u7EC4\u540D\u79F0");
    if (!Number.isSafeInteger(request.start) || !Number.isSafeInteger(request.step) || request.step <= 0) {
      throw new Error("\u8D77\u59CB\u503C\u548C\u6B65\u957F\u5FC5\u987B\u4E3A\u6574\u6570\uFF0C\u4E14\u6B65\u957F\u5927\u4E8E 0");
    }
    const selection = readSelection();
    if (selection.status !== "valid") throw new Error(INVALID_SELECTION_MESSAGE);
    const currentIds = selection.items.map((item) => item.nodeId);
    if (currentIds.length !== request.nodeIds.length || currentIds.some((id) => !request.nodeIds.includes(id))) {
      throw new Error("\u9009\u533A\u5DF2\u53D8\u5316\uFF0C\u8BF7\u786E\u8BA4\u9884\u89C8\u540E\u91CD\u65B0\u751F\u6210");
    }
    const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const collection = (_b = (_a = request.collectionId ? localCollections.find((item) => item.id === request.collectionId) : void 0) != null ? _a : localCollections.find((item) => item.name === collectionName)) != null ? _b : figma.variables.createVariableCollection(collectionName);
    const direction = request.direction === "increase" ? 1 : -1;
    const variables = selection.items.map((item, index) => ({
      name: `${groupName}/${request.start + index * request.step * direction}`,
      resolvedType: item.resolvedType,
      value: item.variableValue
    }));
    const existingByName = new Map(
      (await figma.variables.getLocalVariablesAsync()).filter((variable) => variable.variableCollectionId === collection.id).map((variable) => [variable.name, variable])
    );
    for (const planned of variables) {
      const existing = existingByName.get(planned.name);
      if (existing && existing.resolvedType !== planned.resolvedType) {
        throw new Error(`\u53D8\u91CF\u201C${planned.name}\u201D\u7C7B\u578B\u51B2\u7A81\uFF0C\u672A\u4FEE\u6539\u4EFB\u4F55\u53D8\u91CF`);
      }
      if (!isResolvedType(planned.resolvedType)) {
        throw new Error(`\u53D8\u91CF\u201C${planned.name}\u201D\u7684\u503C\u7C7B\u578B\u4E0D\u53D7\u652F\u6301`);
      }
    }
    for (const planned of variables) {
      const existing = existingByName.get(planned.name);
      const variable = existing != null ? existing : figma.variables.createVariable(
        planned.name,
        collection,
        planned.resolvedType
      );
      variable.setValueForMode(collection.defaultModeId, planned.value);
    }
    await refreshCollections();
    figma.notify(`\u5DF2\u751F\u6210 ${variables.length} \u4E2A\u53D8\u91CF`);
    send({ type: "generate-result", success: true, message: `\u5DF2\u751F\u6210 ${variables.length} \u4E2A\u53D8\u91CF` });
  }
  figma.ui.onmessage = (message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "ui-ready") {
      void sendInitialState();
    } else if (message.type === "refresh-collections") {
      void refreshCollections();
    } else if (message.type === "generate") {
      void generate(message.payload).catch((error) => {
        const errorMessage = error instanceof Error ? error.message : "\u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
        figma.notify(errorMessage, { error: true });
        send({
          type: "generate-result",
          success: false,
          message: errorMessage
        });
      });
    }
  };
  figma.on("selectionchange", () => {
    send({ type: "selection-change", selection: readSelection() });
  });
})();
