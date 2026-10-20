import { describe, expect, it } from "vitest";
import { formatColor, serializeCss, serializeScss, serializeTailwind } from "../src/shared/serialize";
import { buildExportSnapshot, SnapshotBuildError } from "../src/shared/snapshot";
import type { PluginDataDto, VariableDto } from "../src/shared/types";

function dataWith(variables: VariableDto[]): PluginDataDto {
  return {
    fileName: "Tokens",
    collections: [{
      id: "collection", key: "collection-key", name: "System", defaultModeId: "light",
      modes: [{ id: "light", name: "Light", order: 0 }, { id: "dark", name: "Dark", order: 1 }],
      variableIds: variables.filter((variable) => variable.collectionId === "collection").map((variable) => variable.id),
      visible: true, order: 0,
    }],
    variables,
  };
}

const baseVariables: VariableDto[] = [
  {
    id: "brand", key: "brand-key", name: "Brand/Primary", collectionId: "collection", resolvedType: "COLOR", remote: false,
    valuesByMode: { light: { r: 69 / 255, g: 103 / 255, b: 1, a: 1 }, dark: { r: 1, g: 0, b: 0, a: 0.5 } },
  },
  {
    id: "alias", key: "alias-key", name: "Brand/Alias", collectionId: "collection", resolvedType: "COLOR", remote: false,
    valuesByMode: { light: { type: "VARIABLE_ALIAS", id: "brand" }, dark: { type: "VARIABLE_ALIAS", id: "brand" } },
  },
  {
    id: "space", key: "space-key", name: "Spacing/Base", collectionId: "collection", resolvedType: "FLOAT", remote: false,
    valuesByMode: { light: 8.125, dark: 10 },
  },
  {
    id: "label", key: "label-key", name: "Content/Label", collectionId: "collection", resolvedType: "STRING", remote: false,
    valuesByMode: { light: "Hello \"XiiSANS\"", dark: "Dark" },
  },
  {
    id: "enabled", key: "enabled-key", name: "Feature/Enabled", collectionId: "collection", resolvedType: "BOOLEAN", remote: false,
    valuesByMode: { light: true, dark: false },
  },
];

describe("color formatting", () => {
  it("formats hex, rgb(a), and hsl(a)", () => {
    const opaque = { r: 69 / 255, g: 103 / 255, b: 1, a: 1 };
    const translucent = { r: 1, g: 0, b: 0, a: 0.5 };
    expect(formatColor(opaque, "hex")).toBe("#4567FFFF");
    expect(formatColor(opaque, "rgb")).toBe("rgb(69, 103, 255)");
    expect(formatColor(translucent, "rgb")).toBe("rgba(255, 0, 0, 0.5)");
    expect(formatColor(translucent, "hsl")).toBe("hsla(0, 100%, 50%, 0.5)");
  });
});

describe("snapshot and serializers", () => {
  it("exports API variable order with numeric series in every format, collection and mode", () => {
    const names = ["Yellow/100", "Yellow/10", "Yellow/20", "Blue/Zebra", "Blue/Alpha"];
    const variables = names.map((name, index) => ({ ...baseVariables[0], id: `ordered-${index}`, name }));
    const data = dataWith(variables);
    // The collection's variableIds, rather than the API result array, define Figma order.
    data.variables.reverse();
    const second = { ...data.collections[0], id: "second", name: "Alpha", order: 1 };
    data.collections = [second, data.collections[0]];
    const snapshot = buildExportSnapshot(data, ["dark", "light"]);
    expect(snapshot.modes.map((mode) => `${mode.collectionName}/${mode.modeName}`))
      .toEqual(["System/Light", "System/Dark", "Alpha/Light", "Alpha/Dark"]);
    const expected = ["yellow-10", "yellow-20", "yellow-100", "blue-zebra", "blue-alpha"];
    for (const mode of snapshot.modes) {
      expect(mode.entries.map((entry) => entry.variableSlug)).toEqual(expected);
    }
    for (const serialize of [serializeCss, serializeScss, serializeTailwind]) {
      const output = serialize(snapshot, "hex");
      const positions = expected.map((name) => output.indexOf(name));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("creates directly usable CSS for default and alternate modes", () => {
    const snapshot = buildExportSnapshot(dataWith(baseVariables), ["light", "dark"]);
    const css = serializeCss(snapshot, "hex");
    expect(css).toContain(":root {");
    expect(css).toContain('[data-system-mode="dark"]');
    expect(css).toContain("--brand-primary: #4567FFFF;");
    expect(css).toContain("--brand-alias: var(--brand-primary);");
    expect(css).toContain('--content-label: "Hello \\"XiiSANS\\"";');
    expect(css).toContain("--feature-enabled: true;");
    expect(css).toContain("--spacing-base: 8.125;");
  });

  it("creates direct SCSS variables without collection prefixes or a map", () => {
    const snapshot = buildExportSnapshot(dataWith(baseVariables), ["light"]);
    const scss = serializeScss(snapshot, "hex");
    expect(scss).toContain("/* System - Light */");
    expect(scss).toContain("$brand-primary: #4567FFFF;");
    expect(scss).toContain("$brand-alias: $brand-primary;");
    expect(scss).not.toContain("$figma-variables");
  });

  it("creates a Tailwind config object grouped by token type", () => {
    const snapshot = buildExportSnapshot(dataWith(baseVariables), ["light"]);
    const tailwind = serializeTailwind(snapshot, "rgb");
    expect(tailwind).toContain("module.exports = {");
    expect(tailwind).toContain("colors: {");
    expect(tailwind).toContain('"brand-primary": "rgb(69, 103, 255)",');
    expect(tailwind).toContain('"brand-alias": "var(--brand-primary)",');
    expect(tailwind).toContain('"spacing-base": "8.125px",');
    expect(tailwind).not.toContain("@theme");
  });

  it("keeps aliases symbolic without including dependency variables", () => {
    const onlyAlias = dataWith(baseVariables);
    onlyAlias.collections[0].variableIds = ["alias"];
    const snapshot = buildExportSnapshot(onlyAlias, ["light"]);
    expect(snapshot.modes[0].entries.map((entry) => entry.variableId)).toEqual(["alias"]);
    expect(serializeCss(snapshot, "hex")).toContain("--brand-alias: var(--brand-primary);");
    expect(serializeScss(snapshot, "hex")).toContain("$brand-alias: $brand-primary;");
  });

  it("uses hyphenated target names even when an alias becomes a self-reference", () => {
    const target = { ...baseVariables[0], id: "target", name: "Blue/10", collectionId: "dependency" };
    const source = {
      ...baseVariables[1], id: "source", name: "Blue/10", valuesByMode: {
        light: { type: "VARIABLE_ALIAS" as const, id: "target" },
        dark: { type: "VARIABLE_ALIAS" as const, id: "target" },
      },
    };
    const data = dataWith([source, target]);
    const snapshot = buildExportSnapshot(data, ["light"]);
    expect(serializeCss(snapshot, "hex")).toContain("--blue-10: var(--blue-10);");
    expect(serializeScss(snapshot, "hex")).toContain("$blue-10: $blue-10;");
    expect(snapshot.modes[0].entries).toHaveLength(1);
  });

  it("blocks normalized name collisions", () => {
    const duplicate: VariableDto = {
      ...baseVariables[0], id: "duplicate", key: "duplicate-key", name: "brand primary",
    };
    const data = dataWith([...baseVariables, duplicate]);
    expect(() => buildExportSnapshot(data, ["light"])).toThrowError(SnapshotBuildError);
    try {
      buildExportSnapshot(data, ["light"]);
    } catch (error) {
      expect((error as SnapshotBuildError).issue.code).toBe("NAME_COLLISION");
    }
  });

  it("keeps alias cycles symbolic but blocks unreadable alias names", () => {
    const first: VariableDto = { ...baseVariables[0], id: "first", name: "First", valuesByMode: { light: { type: "VARIABLE_ALIAS", id: "second" }, dark: false } };
    const second: VariableDto = { ...baseVariables[4], id: "second", name: "Second", valuesByMode: { light: { type: "VARIABLE_ALIAS", id: "first" }, dark: false } };
    const cyclic = dataWith([first, second]);
    const cyclicCss = serializeCss(buildExportSnapshot(cyclic, ["light"]), "hex");
    expect(cyclicCss).toContain("--first: var(--second);");
    expect(cyclicCss).toContain("--second: var(--first);");

    const missing = dataWith([{ ...first, valuesByMode: { light: { type: "VARIABLE_ALIAS", id: "missing" }, dark: false } }]);
    expect(() => buildExportSnapshot(missing, ["light"])).toThrowError(/无法读取/);
  });
});
