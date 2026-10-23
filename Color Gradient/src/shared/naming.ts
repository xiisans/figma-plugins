export function normalizeGroupName(value: string): string {
  return value
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

export function buildSuffixes(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * 10);
}

export function buildVariableNames(groupName: string, count: number): string[] {
  const group = normalizeGroupName(groupName);
  if (!group) throw new Error('请输入变量分组名称');
  return buildSuffixes(count).map((suffix) => `${group}/${suffix}`);
}

export function deriveGroupNames(variableNames: string[]): string[] {
  const groups = new Set<string>();
  for (const name of variableNames) {
    const separator = name.lastIndexOf('/');
    if (separator > 0) groups.add(name.slice(0, separator));
  }
  return [...groups].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
