import { describe, expect, it } from "vitest";
import { orderVariablesByFigma } from "../src/shared/ordering";

function sortedNames(names: string[]): string[] {
  return orderVariablesByFigma(names.map((name) => ({ name }))).map((item) => item.name);
}

describe("Figma variable order", () => {
  it("preserves original group and nonnumeric variable order", () => {
    const names = ["Yellow/Zinc", "Yellow/Amber", "Blue/Zebra", "Blue/Alpha", "Neutral/White", "Neutral/Black"];
    expect(sortedNames(names)).toEqual(names);
  });

  it("sorts entire numeric suffixes within each original group", () => {
    expect(sortedNames(["Yellow/100", "Yellow/10", "Yellow/200", "Yellow/20", "Blue/100", "Blue/20", "Blue/10"]))
      .toEqual(["Yellow/10", "Yellow/20", "Yellow/100", "Yellow/200", "Blue/10", "Blue/20", "Blue/100"]);
  });

  it("handles numeric groups and nested names without alphabetizing other groups", () => {
    expect(sortedNames(["Size/100/item-100", "Size/100/item-20", "Color/White", "Size/20/item-30", "Size/20/item-10", "Alpha/Last"]))
      .toEqual(["Size/20/item-10", "Size/20/item-30", "Size/100/item-20", "Size/100/item-100", "Color/White", "Alpha/Last"]);
  });

  it("keeps unrelated names in place and retains equal numeric names stably", () => {
    expect(sortedNames(["blue-100", "Custom", "blue-020", "blue-20", "blue-10"]))
      .toEqual(["blue-10", "Custom", "blue-020", "blue-20", "blue-100"]);
  });
});
