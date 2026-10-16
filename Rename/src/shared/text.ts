import { sortTargets, type RenameTarget, type ReplaceConfig, type ValidationResult } from "./rename";

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

export function validateTextConfig(config: ReplaceConfig): ValidationResult {
  return config.searchText || config.replacementText
    ? { valid: true }
    : { valid: false, message: "请输入要查找或替换的文本" };
}

export function textLayerName(content: string): string {
  return Array.from(content).length <= 12 ? content : "text";
}

export function buildTextResults(targets: TextTarget[], config: ReplaceConfig, syncLayerName: boolean): TextResult[] {
  const validation = validateTextConfig(config);
  if (!validation.valid) throw new Error(validation.message);
  const byId = new Map(targets.map((target) => [target.id, target]));

  return sortTargets(targets).map(({ id }) => {
    const target = byId.get(id)!;
    const edits = findTextEdits(target.characters, config);
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
