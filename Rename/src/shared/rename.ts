export type RenameMode = "quick" | "replace" | "text";
export type Direction = "asc" | "desc";
export type LetterCase = "upper" | "lower";
export type TokenKind = "number" | "letter";

export interface RenameTarget {
  id: string;
  type: string;
  originalName: string;
  x: number;
  y: number;
  sourceIndex: number;
}

export interface NumberTokenConfig {
  enabled: boolean;
  digits: number | null;
  direction: Direction;
}

export interface LetterTokenConfig {
  enabled: boolean;
  width: number | null;
  letterCase: LetterCase;
  direction: Direction;
}

export interface QuickRenameConfig {
  baseName: string;
  number: NumberTokenConfig;
  letter: LetterTokenConfig;
  tokenOrder: TokenKind[];
}

export interface ReplaceConfig {
  searchText: string;
  replacementText: string;
}

export interface RenameResult {
  id: string;
  originalName: string;
  nextName: string;
  changed: boolean;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const ROW_TOLERANCE = 8;
const MAX_NUMBER_WIDTH = 32;
const MAX_LETTER_WIDTH = 10;

export function sortTargets(targets: RenameTarget[]): RenameTarget[] {
  const byVerticalPosition = [...targets].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.sourceIndex - b.sourceIndex || a.id.localeCompare(b.id)
  );
  const rows: Array<{ anchorY: number; items: RenameTarget[] }> = [];

  for (const target of byVerticalPosition) {
    const row = rows.find((candidate) => Math.abs(candidate.anchorY - target.y) <= ROW_TOLERANCE);
    if (row) {
      row.items.push(target);
      row.anchorY = Math.min(row.anchorY, target.y);
    } else {
      rows.push({ anchorY: target.y, items: [target] });
    }
  }

  rows.sort((a, b) => a.anchorY - b.anchorY);
  return rows.flatMap((row) =>
    row.items.sort(
      (a, b) => a.x - b.x || a.y - b.y || a.sourceIndex - b.sourceIndex || a.id.localeCompare(b.id)
    )
  );
}

export function validateQuickConfig(config: QuickRenameConfig): ValidationResult {
  if (!config.baseName.trim()) {
    return { valid: false, message: "请输入画板名称" };
  }

  if (config.number.enabled && !isValidWidth(config.number.digits, MAX_NUMBER_WIDTH)) {
    return { valid: false, message: `数字位数应为 1-${MAX_NUMBER_WIDTH} 的整数` };
  }

  if (config.letter.enabled && !isValidWidth(config.letter.width, MAX_LETTER_WIDTH)) {
    return { valid: false, message: `字母位数应为 1-${MAX_LETTER_WIDTH} 的整数` };
  }

  return { valid: true };
}

export function validateReplaceConfig(config: ReplaceConfig): ValidationResult {
  if (!config.searchText) {
    return { valid: false, message: "请输入要替换的文字" };
  }
  if (config.searchText === config.replacementText) {
    return { valid: false, message: "替换前后的文字不能相同" };
  }
  return { valid: true };
}

export function buildRenameResults(
  targets: RenameTarget[],
  mode: Exclude<RenameMode, "text">,
  quick: QuickRenameConfig,
  replace: ReplaceConfig
): RenameResult[] {
  const sortedTargets = sortTargets(targets);
  if (mode === "quick") {
    const validation = validateQuickConfig(quick);
    if (!validation.valid) throw new Error(validation.message);
    return buildQuickResults(sortedTargets, quick);
  }

  const validation = validateReplaceConfig(replace);
  if (!validation.valid) throw new Error(validation.message);
  return sortedTargets.map((target) => {
    const nextName = replaceAllLiteral(target.originalName, replace.searchText, replace.replacementText);
    return toResult(target, nextName);
  });
}

export function replaceAllLiteral(value: string, searchText: string, replacementText: string): string {
  if (!searchText) return value;
  return value.split(searchText).join(replacementText);
}

export function numberSequenceValue(index: number, count: number, digits: number, direction: Direction): string {
  const value = direction === "asc" ? index + 1 : count - index;
  return String(value).padStart(digits, "0");
}

export function letterSequenceValue(
  index: number,
  count: number,
  width: number,
  direction: Direction,
  letterCase: LetterCase
): string {
  const startOrdinal = minimumOrdinalForWidth(width);
  const offset = direction === "asc" ? index : count - index - 1;
  const value = toSpreadsheetLetters(startOrdinal + offset);
  return letterCase === "lower" ? value.toLowerCase() : value;
}

export function hasDuplicateNextNames(results: RenameResult[]): boolean {
  const names = new Set<string>();
  for (const result of results) {
    if (names.has(result.nextName)) return true;
    names.add(result.nextName);
  }
  return false;
}

function buildQuickResults(targets: RenameTarget[], config: QuickRenameConfig): RenameResult[] {
  const baseName = config.baseName.trim();
  const activeOrder = config.tokenOrder.filter(
    (kind, index, order) =>
      order.indexOf(kind) === index && (kind === "number" ? config.number.enabled : config.letter.enabled)
  );

  return targets.map((target, index) => {
    const suffix = activeOrder
      .map((kind) => {
        if (kind === "number") {
          return numberSequenceValue(index, targets.length, config.number.digits!, config.number.direction);
        }
        return letterSequenceValue(
          index,
          targets.length,
          config.letter.width!,
          config.letter.direction,
          config.letter.letterCase
        );
      })
      .join("");
    return toResult(target, `${baseName}${suffix}`);
  });
}

function isValidWidth(value: number | null, maximum: number): value is number {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= maximum;
}

function minimumOrdinalForWidth(width: number): number {
  let ordinal = 1;
  for (let currentWidth = 1; currentWidth < width; currentWidth += 1) {
    ordinal += 26 ** currentWidth;
  }
  return ordinal;
}

function toSpreadsheetLetters(ordinal: number): string {
  let value = ordinal;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function toResult(target: RenameTarget, nextName: string): RenameResult {
  return {
    id: target.id,
    originalName: target.originalName,
    nextName,
    changed: target.originalName !== nextName
  };
}
