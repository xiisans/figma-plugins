import { describe, expect, it } from "vitest";
import { buildTextResults, textLayerName, validateTextConfig, type TextTarget } from "../src/shared/text";

function target(characters: string, originalName = "原图层名"): TextTarget {
  return { id: "text-1", type: "TEXT", originalName, characters, x: 0, y: 0, sourceIndex: 0 };
}

describe("text content replacement", () => {
  it("deletes every matching string when replacement is empty", () => {
    const [result] = buildTextResults([target("首页-按钮-按钮")], { searchText: "按钮", replacementText: "" }, false);
    expect(result.nextText).toBe("首页--");
    expect(result.nextName).toBe("原图层名");
  });

  it("overwrites the entire content when search is empty, including empty layers", () => {
    const results = buildTextResults([target("旧内容"), { ...target(""), id: "text-2" }], { searchText: "", replacementText: "新内容" }, true);
    expect(results.map((result) => result.nextText)).toEqual(["新内容", "新内容"]);
    expect(results.map((result) => result.nextName)).toEqual(["新内容", "新内容"]);
  });

  it("replaces literals case-sensitively, without regex or replacement interpolation", () => {
    const [result] = buildTextResults([target("[a]-[a]-[A]")], { searchText: "[a]", replacementText: "$&" }, false);
    expect(result.nextText).toBe("$&-$&-[A]");
  });

  it("rejects two empty fields while allowing literal spaces", () => {
    expect(validateTextConfig({ searchText: "", replacementText: "" }).valid).toBe(false);
    expect(() => buildTextResults([target("旧内容")], { searchText: "", replacementText: "" }, true)).toThrow();
    const [result] = buildTextResults([target("a b")], { searchText: " ", replacementText: "" }, false);
    expect(result.nextText).toBe("ab");
  });

  it("leaves unmatched layers and names untouched even when synchronization is checked", () => {
    const [result] = buildTextResults([target("登录")], { searchText: "退出", replacementText: "返回" }, true);
    expect(result.nextText).toBe("登录");
    expect(result.nextName).toBe("原图层名");
    expect(result.changed).toBe(false);
  });

  it("allows clearing the entire text", () => {
    const [result] = buildTextResults([target("删除")], { searchText: "删除", replacementText: "" }, true);
    expect(result.nextText).toBe("");
    expect(result.nextName).toBe("");
    expect(result.changed).toBe(true);
  });
});

describe("text layer name synchronization", () => {
  it("uses the resulting full content for the 12-character boundary", () => {
    expect(textLayerName("一二三四五六七八九十甲乙")).toBe("一二三四五六七八九十甲乙");
    expect(textLayerName("一二三四五六七八九十甲乙丙")).toBe("text");
    const [result] = buildTextResults([target("123456789012x")], { searchText: "x", replacementText: "y" }, true);
    expect(result.nextName).toBe("text");
  });

  it("counts Unicode characters rather than UTF-16 surrogate halves", () => {
    expect(textLayerName("😀".repeat(12))).toBe("😀".repeat(12));
    expect(textLayerName("😀".repeat(13))).toBe("text");
  });

  it("never changes names with synchronization off", () => {
    const [result] = buildTextResults([target("原内容")], { searchText: "", replacementText: "长文本".repeat(10) }, false);
    expect(result.textChanged).toBe(true);
    expect(result.nextName).toBe("原图层名");
    expect(result.nameChanged).toBe(false);
  });

  it("can update only the name when content already matches", () => {
    const [result] = buildTextResults([target("内容")], { searchText: "", replacementText: "内容" }, true);
    expect(result.textChanged).toBe(false);
    expect(result.nameChanged).toBe(true);
    expect(result.changed).toBe(true);
  });
});
