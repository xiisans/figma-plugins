import type {
  ColorFormat,
  ColorValueDto,
  ExportEntryDto,
  ExportFormat,
  ExportModeDto,
  ExportSnapshotDto,
} from "./types";

function isColor(value: unknown): value is ColorValueDto {
  return Boolean(value && typeof value === "object" && "r" in value && "g" in value && "b" in value);
}

function trimNumber(value: number, precision = 3): string {
  return Number(value.toFixed(precision)).toString();
}

function channel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function alpha(value: ColorValueDto): number {
  return Math.max(0, Math.min(1, value.a ?? 1));
}

function rgbToHsl(color: ColorValueDto): [number, number, number] {
  const r = Math.max(0, Math.min(1, color.r));
  const g = Math.max(0, Math.min(1, color.g));
  const b = Math.max(0, Math.min(1, color.b));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness * 100];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue *= 60;
  return [hue, saturation * 100, lightness * 100];
}

export function formatColor(color: ColorValueDto, format: ColorFormat): string {
  const r = channel(color.r);
  const g = channel(color.g);
  const b = channel(color.b);
  const a = alpha(color);
  if (format === "hex") {
    return `#${[r, g, b, Math.round(a * 255)].map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  if (format === "rgb") {
    return a >= 0.9995 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${trimNumber(a)})`;
  }
  const [h, s, l] = rgbToHsl(color);
  const hsl = `${trimNumber(h, 2)}, ${trimNumber(s, 2)}%, ${trimNumber(l, 2)}%`;
  return a >= 0.9995 ? `hsl(${hsl})` : `hsla(${hsl}, ${trimNumber(a)})`;
}

function literalValue(entry: ExportEntryDto, format: ColorFormat, syntax: "css" | "scss" = "css"): string {
  if (entry.aliasTarget) {
    return syntax === "scss" ? `$${entry.aliasTarget.variableSlug}` : `var(--${entry.aliasTarget.variableSlug})`;
  }
  if (isColor(entry.value)) return formatColor(entry.value, format);
  if (typeof entry.value === "string") return JSON.stringify(entry.value);
  if (typeof entry.value === "number") {
    if (!Number.isFinite(entry.value)) throw new Error(`变量“${entry.variableName}”不是有限数值。`);
    return trimNumber(entry.value, 6);
  }
  if (typeof entry.value === "boolean") return String(entry.value);
  throw new Error(`变量“${entry.variableName}”的值无法序列化。`);
}

function displayName(value: string): string {
  return value.replace(/[\\/]+/g, "-");
}

function cssSelector(mode: ExportModeDto): string {
  return mode.isDefault ? ":root" : `[data-${mode.collectionSlug}-mode="${mode.modeSlug}"]`;
}

export function serializeCss(snapshot: ExportSnapshotDto, colorFormat: ColorFormat): string {
  return snapshot.modes.map((mode) => {
    const lines = mode.entries.map((entry) => `  --${entry.variableSlug}: ${literalValue(entry, colorFormat)};`);
    return `/* ${displayName(mode.collectionName)} - ${displayName(mode.modeName)} */\n${cssSelector(mode)} {\n${lines.join("\n")}\n}`;
  }).join("\n\n");
}

export function serializeScss(snapshot: ExportSnapshotDto, colorFormat: ColorFormat): string {
  return snapshot.modes.map((mode) => {
    const lines = mode.entries.map((entry) => `$${entry.variableSlug}: ${literalValue(entry, colorFormat, "scss")};`);
    return `/* ${displayName(mode.collectionName)} - ${displayName(mode.modeName)} */\n${lines.join("\n")}`;
  }).join("\n\n");
}

function tailwindValue(entry: ExportEntryDto, colorFormat: ColorFormat): string | boolean {
  if (entry.aliasTarget) return `var(--${entry.aliasTarget.variableSlug})`;
  if (isColor(entry.value)) return formatColor(entry.value, colorFormat);
  if (typeof entry.value === "number") {
    if (!Number.isFinite(entry.value)) throw new Error(`变量“${entry.variableName}”不是有限数值。`);
    return `${trimNumber(entry.value, 6)}px`;
  }
  if (typeof entry.value === "string" || typeof entry.value === "boolean") return entry.value;
  throw new Error(`变量“${entry.variableName}”的值无法序列化。`);
}

export function serializeTailwind(snapshot: ExportSnapshotDto, colorFormat: ColorFormat): string {
  return snapshot.modes.map((mode) => {
    const sections = [
      { name: "colors", entries: mode.entries.filter((entry) => entry.resolvedType === "COLOR") },
      { name: "spacing", entries: mode.entries.filter((entry) => entry.resolvedType === "FLOAT") },
      { name: "variables", entries: mode.entries.filter((entry) => entry.resolvedType === "STRING" || entry.resolvedType === "BOOLEAN") },
    ].filter((section) => section.entries.length > 0);

    const lines = [
      `/* ${displayName(mode.collectionName)} - ${displayName(mode.modeName)} */`,
      "module.exports = {",
      "  theme: {",
      "    extend: {",
    ];
    sections.forEach((section, sectionIndex) => {
      lines.push(`      ${section.name}: {`);
      section.entries.forEach((entry) => {
        lines.push(`        ${JSON.stringify(entry.variableSlug)}: ${JSON.stringify(tailwindValue(entry, colorFormat))},`);
      });
      lines.push(`      }${sectionIndex < sections.length - 1 ? "," : ""}`);
    });
    lines.push("    }", "  }", "};");
    return lines.join("\n");
  }).join("\n\n");
}

export function serializeSnapshot(snapshot: ExportSnapshotDto, exportFormat: ExportFormat, colorFormat: ColorFormat): string {
  if (exportFormat === "scss") return serializeScss(snapshot, colorFormat);
  if (exportFormat === "tailwind") return serializeTailwind(snapshot, colorFormat);
  return serializeCss(snapshot, colorFormat);
}
