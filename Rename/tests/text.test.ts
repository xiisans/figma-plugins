import { describe, expect, it } from "vitest";
import { buildTextResults, textLayerName, validateTextConfig, type TextRenameConfig, type TextTarget } from "../src/shared/text";

function target(characters: string, originalName = "原图层名"): TextTarget {
  return { id: "text-1", type: "TEXT", originalName, characters, x: 0, y: 0, sourceIndex: 0 };
}

function config(searchText: string, replacementText: string, number: Partial<TextRenameConfig["number"]> = {}): TextRenameConfig {
  return { searchText, replacementText, number: { enabled: false, digits: null, direction: "asc", ...number } };
}

describe("text content replacement", () => {
  it("deletes every matching string when replacement is empty", () => {
    const [result] = buildTextResults([target("首页-按钮-按钮")], config("按钮", ""), false);
    expect(result.nextText).toBe("首页--");
    expect(result.nextName).toBe("原图层名");
  });

  it("overwrites the entire content when search is empty, including empty layers", () => {
    const results = buildTextResults([target("旧内容"), { ...target(""), id: "text-2" }], config("", "新内容"), true);
    expect(results.map((result) => result.nextText)).toEqual(["新内容", "新内容"]);
    expect(results.map((result) => result.nextName)).toEqual(["新内容", "新内容"]);
  });

  it("replaces literals case-sensitively, without regex or replacement interpolation", () => {
    const [result] = buildTextResults([target("[a]-[a]-[A]")], config("[a]", "$&"), false);
    expect(result.nextText).toBe("$&-$&-[A]");
  });

  it("rejects two empty fields while allowing literal spaces", () => {
    expect(validateTextConfig(config("", "")).valid).toBe(false);
    expect(() => buildTextResults([target("旧内容")], config("", ""), true)).toThrow();
    const [result] = buildTextResults([target("a b")], config(" ", ""), false);
    expect(result.nextText).toBe("ab");
  });

  it("leaves unmatched layers and names untouched even when synchronization is checked", () => {
    const [result] = buildTextResults([target("登录")], config("退出", "返回"), true);
    expect(result.nextText).toBe("登录");
    expect(result.nextName).toBe("原图层名");
    expect(result.changed).toBe(false);
  });

  it("allows clearing the entire text", () => {
    const [result] = buildTextResults([target("删除")], config("删除", ""), true);
    expect(result.nextText).toBe("");
    expect(result.nextName).toBe("");
    expect(result.changed).toBe(true);
  });
});

describe("text layer name synchronization", () => {
  it("uses the resulting full content for the 12-character boundary", () => {
    expect(textLayerName("一二三四五六七八九十甲乙")).toBe("一二三四五六七八九十甲乙");
    expect(textLayerName("一二三四五六七八九十甲乙丙")).toBe("text");
    const [result] = buildTextResults([target("123456789012x")], config("x", "y"), true);
    expect(result.nextName).toBe("text");
  });

  it("counts Unicode characters rather than UTF-16 surrogate halves", () => {
    expect(textLayerName("😀".repeat(12))).toBe("😀".repeat(12));
    expect(textLayerName("😀".repeat(13))).toBe("text");
  });

  it("never changes names with synchronization off", () => {
    const [result] = buildTextResults([target("原内容")], config("", "长文本".repeat(10)), false);
    expect(result.textChanged).toBe(true);
    expect(result.nextName).toBe("原图层名");
    expect(result.nameChanged).toBe(false);
  });

  it("can update only the name when content already matches", () => {
    const [result] = buildTextResults([target("内容")], config("", "内容"), true);
    expect(result.textChanged).toBe(false);
    expect(result.nameChanged).toBe(true);
    expect(result.changed).toBe(true);
  });
});

describe("text number suffix", () => {
  const orderedTargets: TextTarget[] = [
    { ...target("第三"), id: "c", x: 200, sourceIndex: 2 },
    { ...target("第一"), id: "a", x: 0, sourceIndex: 0 },
    { ...target("第二"), id: "b", x: 100, sourceIndex: 1 }
  ];

  it("appends a zero-padded ascending sequence in canvas order", () => {
    const results = buildTextResults(orderedTargets, config("", "", { enabled: true, digits: 3 }), false);
    expect(results.map((result) => result.nextText)).toEqual(["第一001", "第二002", "第三003"]);
  });

  it("supports descending sequences and composes them after replacement", () => {
    const results = buildTextResults(orderedTargets, config("第", "文本", { enabled: true, digits: 2, direction: "desc" }), true);
    expect(results.map((result) => result.nextText)).toEqual(["文本一03", "文本二02", "文本三01"]);
    expect(results.map((result) => result.nextName)).toEqual(["文本一03", "文本二02", "文本三01"]);
  });

  it("requires a valid enabled width and ignores a disabled number value", () => {
    expect(validateTextConfig(config("", "", { enabled: true, digits: null })).valid).toBe(false);
    expect(validateTextConfig(config("", "", { enabled: true, digits: 33 })).valid).toBe(false);
    expect(validateTextConfig(config("", "", { enabled: false, digits: 3 })).valid).toBe(false);
  });
});
