# 西无 — 颜色梯度

面向 UI 设计师的 Figma 颜色梯度插件。支持 OKLCH/HSL 实色色阶、透明度色阶，以及变量和画板两种输出方式。

## 开发

```bash
npm install
npm run dev
```

## 验证与构建

```bash
npm run check
```

构建结果位于 `dist/`。在 Figma Desktop 中通过 **Plugins > Development > Import plugin from manifest** 选择本目录的 `manifest.json`。

## 行为约束

- 插件仅接受一个具有可见实色填充的选中节点。
- 变量输出只写入目标集合的默认 Mode；同名颜色变量会更新，类型冲突则停止整批写入。
- 画板输出位于源节点下方 24px，由横向 Auto Layout 父 Frame 和 120×120 子 Frame 组成。
