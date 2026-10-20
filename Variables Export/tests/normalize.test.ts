import { describe, expect, it } from "vitest";
import { naturalCompare, sanitizeFileName, toKebabCase } from "../src/shared/normalize";

describe("normalization", () => {
  it("normalizes paths and preserves unicode letters", () => {
    expect(toKebabCase(" Primary / Brand_Default ")).toBe("primary-brand-default");
    expect(toKebabCase("颜色 / 品牌")).toBe("颜色-品牌");
  });

  it("sanitizes cross-platform filenames", () => {
    expect(sanitizeFileName("西无:变量/导出. ")).toBe("西无-变量-导出.txt");
    expect(sanitizeFileName("<>:\"/\\|?* ")).toBe("figma-variables.txt");
  });

  it("sorts names naturally", () => {
    expect(["Token 10", "Token 2", "Token 1"].sort(naturalCompare)).toEqual(["Token 1", "Token 2", "Token 10"]);
    expect(["Blue/100", "Blue/10", "Blue/200", "Blue/20"].sort(naturalCompare))
      .toEqual(["Blue/10", "Blue/20", "Blue/100", "Blue/200"]);
    expect(naturalCompare("Token 9007199254740992", "Token 9007199254740993")).toBeLessThan(0);
  });
});
