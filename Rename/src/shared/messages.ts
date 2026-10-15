import type { QuickRenameConfig, RenameMode, RenameTarget, ReplaceConfig } from "./rename";

export interface SelectionSnapshot {
  targets: RenameTarget[];
  ignoredCount: number;
  selectionCount: number;
}

export interface ExecuteRenamePayload {
  mode: RenameMode;
  quick: QuickRenameConfig;
  replace: ReplaceConfig;
  syncLayerName: boolean;
}

export type UIToPluginMessage =
  | { type: "UI_READY" }
  | { type: "EXECUTE_RENAME"; requestId: string; payload: ExecuteRenamePayload };

export type PluginToUIMessage =
  | { type: "SELECTION_CHANGED"; payload: SelectionSnapshot }
  | {
      type: "RENAME_SUCCEEDED";
      requestId: string;
      payload: { changedCount: number; skippedCount: number };
    }
  | { type: "RENAME_FAILED"; requestId: string; message: string };
