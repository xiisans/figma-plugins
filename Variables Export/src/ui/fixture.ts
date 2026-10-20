import type { PluginDataDto } from "../shared/types";

const modes = [
  { id: "mode-1", name: "Mode 1", order: 0 },
  { id: "mode-2", name: "Mode 2", order: 1 },
];

export const fixtureData: PluginDataDto = {
  fileName: "西无 XiiSANS",
  collections: Array.from({ length: 6 }, (_, index) => ({
    id: `collection-${index + 1}`,
    key: `collection-key-${index + 1}`,
    name: `加载的集合${String(index + 1).padStart(2, "0")}`,
    defaultModeId: index === 2 ? "mode-1" : `mode-${index + 3}`,
    modes: index === 2 ? modes : [{ id: `mode-${index + 3}`, name: "Mode 1", order: 0 }],
    variableIds: index === 2
      ? ["brand-default", "brand-hover", "brand-10", "spacing", "enabled", "label"]
      : [`variable-${index + 1}`],
    visible: true,
    order: index,
  })),
  variables: [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `variable-${index + 1}`,
      key: `variable-key-${index + 1}`,
      name: `Neutral/${(index + 1) * 10}`,
      collectionId: `collection-${index + 1}`,
      resolvedType: "COLOR" as const,
      valuesByMode: { [`mode-${index + 3}`]: { r: 0.1 + index * 0.06, g: 0.12 + index * 0.05, b: 0.16 + index * 0.04, a: 1 } },
      remote: false,
    })),
    {
      id: "brand-default", key: "brand-default-key", name: "Primary/Brand/Default", collectionId: "collection-3", resolvedType: "COLOR",
      valuesByMode: { "mode-1": { r: 69 / 255, g: 103 / 255, b: 1, a: 1 }, "mode-2": { r: 92 / 255, g: 124 / 255, b: 1, a: 1 } }, remote: false,
    },
    {
      id: "brand-hover", key: "brand-hover-key", name: "Primary/Brand/Hover", collectionId: "collection-3", resolvedType: "COLOR",
      valuesByMode: { "mode-1": { r: 82 / 255, g: 113 / 255, b: 1, a: 1 }, "mode-2": { r: 104 / 255, g: 132 / 255, b: 1, a: 0.8 } }, remote: false,
    },
    {
      id: "brand-10", key: "brand-10-key", name: "Brand/10", collectionId: "collection-3", resolvedType: "COLOR",
      valuesByMode: { "mode-1": { type: "VARIABLE_ALIAS", id: "brand-default" }, "mode-2": { type: "VARIABLE_ALIAS", id: "brand-default" } }, remote: false,
    },
    {
      id: "spacing", key: "spacing-key", name: "Spacing/Base", collectionId: "collection-3", resolvedType: "FLOAT",
      valuesByMode: { "mode-1": 8, "mode-2": 10 }, remote: false,
    },
    {
      id: "enabled", key: "enabled-key", name: "Feature/Enabled", collectionId: "collection-3", resolvedType: "BOOLEAN",
      valuesByMode: { "mode-1": true, "mode-2": false }, remote: false,
    },
    {
      id: "label", key: "label-key", name: "Content/Label", collectionId: "collection-3", resolvedType: "STRING",
      valuesByMode: { "mode-1": "西无", "mode-2": "XiiSANS" }, remote: false,
    },
  ],
};
