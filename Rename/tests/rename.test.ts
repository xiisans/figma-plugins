import { describe, expect, it } from "vitest";
import {
  buildRenameResults,
  letterSequenceValue,
  numberSequenceValue,
  replaceAllLiteral,
  sortTargets,
  type QuickRenameConfig,
  type RenameTarget
} from "../src/shared/rename";

const targets: RenameTarget[] = [
  { id: "c", type: "FRAME", originalName: "Old C", x: 240, y: 0, sourceIndex: 2 },
  { id: "d", type: "FRAME", originalName: "Old D", x: 0, y: 120, sourceIndex: 3 },
  { id: "a", type: "FRAME", originalName: "Old A", x: 0, y: 0, sourceIndex: 0 },
  { id: "b", type: "FRAME", originalName: "Old B", x: 120, y: 5, sourceIndex: 1 }
];

const baseQuickConfig: QuickRenameConfig = {
  baseName: "登录页",
  number: { enabled: true, digits: 3, direction: "asc" },
  letter: { enabled: false, width: 1, letterCase: "upper", direction: "asc" },
  tokenOrder: ["number"]
};

describe("sequence generation", () => {
  it("pads ascending and descending number sequences", () => {
    expect(numberSequenceValue(0, 4, 3, "asc")).toBe("001");
    expect(numberSequenceValue(0, 4, 3, "desc")).toBe("004");
    expect(numberSequenceValue(99, 100, 2, "asc")).toBe("100");
  });

  it("crosses the Z to AA boundary", () => {
    expect(letterSequenceValue(25, 27, 1, "asc", "upper")).toBe("Z");
    expect(letterSequenceValue(26, 27, 1, "asc", "upper")).toBe("AA");
  });

  it("starts at the requested letter width and supports lowercase descending values", () => {
    expect(letterSequenceValue(0, 3, 2, "asc", "upper")).toBe("AA");
    expect(letterSequenceValue(0, 3, 1, "desc", "lower")).toBe("c");
  });
});

describe("target ordering and rename output", () => {
  it("orders rows top-to-bottom and items left-to-right", () => {
    expect(sortTargets(targets).map((target) => target.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("builds quick names from the same ordering used for execution", () => {
    const results = buildRenameResults(targets, "quick", baseQuickConfig, { searchText: "", replacementText: "" });
    expect(results.map((result) => result.nextName)).toEqual(["登录页001", "登录页002", "登录页003", "登录页004"]);
  });

  it("respects token insertion order", () => {
    const config: QuickRenameConfig = {
      ...baseQuickConfig,
      letter: { enabled: true, width: 1, letterCase: "upper", direction: "asc" },
      tokenOrder: ["letter", "number"]
    };
    const results = buildRenameResults(targets.slice(0, 2), "quick", config, { searchText: "", replacementText: "" });
    expect(results.map((result) => result.nextName)).toEqual(["登录页A001", "登录页B002"]);
  });
});

describe("literal replacement", () => {
  it("replaces every case-sensitive match", () => {
    expect(replaceAllLiteral("Home-home-Home", "Home", "Page")).toBe("Page-home-Page");
  });

  it("treats regular-expression characters as plain text", () => {
    expect(replaceAllLiteral("Card[v1]-Card[v1]", "[v1]", "")).toBe("Card-Card");
  });
});
