import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App, type PluginBridge } from "../src/ui/App";
import { fixtureData } from "../src/ui/fixture";

function bridge(): PluginBridge {
  return { send: vi.fn(), subscribe: () => () => undefined };
}

function controlledBridge() {
  let listener: Parameters<PluginBridge["subscribe"]>[0] | undefined;
  const value: PluginBridge = {
    send: vi.fn(),
    subscribe(next) {
      listener = next;
      return () => { listener = undefined; };
    },
  };
  return { value, emit: (message: Parameters<NonNullable<typeof listener>>[0]) => listener?.(message) };
}

describe("App", () => {
  it("does not print variables until add is clicked", () => {
    render(<App bridge={bridge()} initialData={fixtureData} />);
    expect(screen.getByText(/请选择变量/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "全选" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "加载所选变量" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "选择加载的集合01" }));
    fireEvent.click(screen.getByRole("button", { name: "加载所选变量" }));
    expect(screen.getByText(/加载的集合01 - Mode 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeEnabled();
  });

  it("supports collection tri-state selection and select all", () => {
    render(<App bridge={bridge()} initialData={fixtureData} />);
    fireEvent.click(screen.getByRole("button", { name: "展开加载的集合03" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择Mode 1" }));
    expect(screen.getByRole("checkbox", { name: "选择加载的集合03" })).toHaveAttribute("aria-checked", "mixed");
    fireEvent.click(screen.getByRole("checkbox", { name: "全选" }));
    expect(screen.getByRole("checkbox", { name: "全选" })).toHaveAttribute("aria-checked", "true");
  });

  it("switches output and color formats without rebuilding selection", () => {
    render(<App bridge={bridge()} initialData={fixtureData} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "选择加载的集合03" }));
    fireEvent.click(screen.getByRole("button", { name: "加载所选变量" }));
    const preview = document.querySelector(".code-preview");
    expect(preview).toHaveTextContent("#4567FFFF");
    fireEvent.click(screen.getByRole("button", { name: "SCSS" }));
    expect(document.querySelector(".code-preview")).toHaveTextContent("$brand-10: $primary-brand-default;");
    expect(screen.queryByText(/\$figma-variables/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CSS/SCSS" }));
    expect(document.querySelector(".code-preview")).toHaveTextContent("--brand-10: $primary-brand-default;");
    expect(document.querySelector(".code-preview")).toHaveTextContent(":root {");
    fireEvent.click(screen.getByRole("button", { name: /Hex/ }));
    fireEvent.click(screen.getByRole("option", { name: "RGB(A)" }));
    expect(preview).toHaveTextContent("rgb(69, 103, 255)");
    fireEvent.click(screen.getByRole("button", { name: "Tailwind" }));
    expect(document.querySelector(".code-preview")).toHaveTextContent("module.exports = {");
    expect(document.querySelector(".code-preview")).not.toHaveTextContent("@theme inline");
  });

  it("closes the color menu when clicking outside it", () => {
    render(<App bridge={bridge()} initialData={fixtureData} />);
    fireEvent.click(screen.getByRole("button", { name: /Hex/ }));
    expect(screen.getByRole("listbox", { name: "颜色格式" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox", { name: "颜色格式" })).not.toBeInTheDocument();
  });

  it("preserves existing selection and selects newly added modes on refresh", () => {
    const controller = controlledBridge();
    render(<App bridge={controller.value} />);
    act(() => controller.emit({ type: "data-loaded", data: fixtureData }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择加载的集合01" }));

    const refreshed = structuredClone(fixtureData);
    refreshed.collections.push({
      id: "new-collection", key: "new-key", name: "新增集合", defaultModeId: "new-mode",
      modes: [{ id: "new-mode", name: "Default", order: 0 }], variableIds: [], visible: true, order: 6,
    });
    act(() => controller.emit({ type: "data-loaded", data: refreshed }));

    expect(screen.getByRole("checkbox", { name: "选择加载的集合01" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "选择新增集合" })).toHaveAttribute("aria-checked", "true");
  });

  it("shows processing labels while copying and exporting", async () => {
    let finishCopy: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const createObjectURL = vi.fn().mockReturnValue("blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<App bridge={bridge()} initialData={fixtureData} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "选择加载的集合01" }));
    fireEvent.click(screen.getByRole("button", { name: "加载所选变量" }));
    fireEvent.click(screen.getByRole("button", { name: "复制" }));
    expect(screen.getByRole("button", { name: "..." })).toBeDisabled();
    finishCopy?.();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("--neutral-10")));
    await waitFor(() => expect(screen.getByRole("button", { name: "复制" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    expect(screen.getByRole("button", { name: "..." })).toBeDisabled();
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob)));
    await waitFor(() => expect(screen.getByRole("button", { name: "导出" })).toBeEnabled());
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});
