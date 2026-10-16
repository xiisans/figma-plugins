import type { QuickRenameConfig, RenameMode, RenameTarget, ReplaceConfig } from "./rename";
import type { TextRenameConfig, TextTarget } from "./text";

export interface SelectionSnapshot {
  targets: RenameTarget[];
  textTargets: TextTarget[];
  ignoredCount: number;
  selectionCount: number;
}

export interface ExecuteRenamePayload {
  mode: RenameMode;
  quick: QuickRenameConfig;
  replace: ReplaceConfig;
  text: TextRenameConfig;
  syncLayerName: boolean;
}

export type UIToPluginMessage =
  | { type: "UI_READY" }
  | { type: "REQUEST_SELECTION"; requestId: string }
  | { type: "EXECUTE_RENAME"; requestId: string; payload: ExecuteRenamePayload };

export type PluginToUIMessage =
  | { type: "SELECTION_CHANGED"; requestId?: string; payload: SelectionSnapshot }
  | {
      type: "RENAME_SUCCEEDED";
      requestId: string;
      payload: { changedCount: number; skippedCount: number };
    }
  | { type: "RENAME_FAILED"; requestId: string; message: string };
