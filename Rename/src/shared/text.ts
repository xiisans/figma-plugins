import {
  numberSequenceValue,
  sortTargets,
  type NumberTokenConfig,
  type RenameTarget,
  type ReplaceConfig,
  type ValidationResult
} from "./rename";

export interface TextRenameConfig extends ReplaceConfig {
  number: NumberTokenConfig;
}

export interface NumberNamingConfig {
  startValue: number | null;
  step: number | null;
  direction: "asc" | "desc";
}

export interface TextTarget extends RenameTarget {
  characters: string;
}

export interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}

export interface TextResult {
  id: string;
  originalText: string;
  nextText: string;
  nextName: string;
  edits: TextEdit[];
  textChanged: boolean;
  nameChanged: boolean;
  changed: boolean;
}

export function validateTextConfig(config: TextRenameConfig): ValidationResult {
  if (config.number.enabled && !isValidNumberWidth(config.number.digits)) {
    return { valid: false, message: "数字位数应为 1-32 的整数" };
  }
  return config.searchText || config.replacementText || config.number.enabled
    ? { valid: true }
    : { valid: false, message: "请输入文本规则或添加数字" };
}

export function textLayerName(content: string): string {
  return Array.from(content).length <= 12 ? content : "text";
}

export function buildTextResults(targets: TextTarget[], config: TextRenameConfig, syncLayerName: boolean): TextResult[] {
  const validation = validateTextConfig(config);
  if (!validation.valid) throw new Error(validation.message);
  const byId = new Map(targets.map((target) => [target.id, target]));
  const sortedTargets = sortTargets(targets);

  return sortedTargets.map(({ id }, index) => {
    const target = byId.get(id)!;
    const edits = config.searchText || config.replacementText ? findTextEdits(target.characters, config) : [];
    if (config.number.enabled) {
      edits.push({
        start: target.characters.length,
        end: target.characters.length,
        replacement: numberSequenceValue(index, sortedTargets.length, config.number.digits!, config.number.direction)
      });
    }
    let nextText = target.characters;
    for (const edit of [...edits].reverse()) {
      nextText = nextText.slice(0, edit.start) + edit.replacement + nextText.slice(edit.end);
    }
    const nextName = syncLayerName && edits.length > 0 ? textLayerName(nextText) : target.originalName;
    const textChanged = nextText !== target.characters;
    const nameChanged = nextName !== target.originalName;
    return { id, originalText: target.characters, nextText, nextName, edits, textChanged, nameChanged, changed: textChanged || nameChanged };
  });
}

export function validateNumberNamingConfig(config: NumberNamingConfig): ValidationResult {
  if (!isSafeInteger(config.startValue)) return { valid: false, message: "请输入整数起始值" };
  if (!isSafeInteger(config.step) || config.step <= 0) return { valid: false, message: "请输入大于 0 的整数步长" };
  return { valid: true };
}

export function buildNumberNamingResults(
  targets: TextTarget[],
  config: NumberNamingConfig,
  syncLayerName: boolean
): TextResult[] {
  const validation = validateNumberNamingConfig(config);
  if (!validation.valid) throw new Error(validation.message);
  const byId = new Map(targets.map((target) => [target.id, target]));
  return sortTargets(targets).map(({ id }, index) => {
    const target = byId.get(id)!;
    const offset = config.step! * index;
    const nextValue = config.direction === "asc" ? config.startValue! + offset : config.startValue! - offset;
    if (!Number.isSafeInteger(nextValue)) throw new Error("数字序列超出安全整数范围");
    const nextText = String(nextValue);
    const edits: TextEdit[] = [{ start: 0, end: target.characters.length, replacement: nextText }];
    const nextName = syncLayerName ? textLayerName(nextText) : target.originalName;
    const textChanged = nextText !== target.characters;
    const nameChanged = nextName !== target.originalName;
    return { id, originalText: target.characters, nextText, nextName, edits, textChanged, nameChanged, changed: textChanged || nameChanged };
  });
}

function isValidNumberWidth(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 32;
}

function isSafeInteger(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value);
}

function findTextEdits(value: string, config: ReplaceConfig): TextEdit[] {
  if (!config.searchText) return [{ start: 0, end: value.length, replacement: config.replacementText }];
  const edits: TextEdit[] = [];
  let start = value.indexOf(config.searchText);
  while (start !== -1) {
    const end = start + config.searchText.length;
    edits.push({ start, end, replacement: config.replacementText });
    start = value.indexOf(config.searchText, end);
  }
  return edits;
}
