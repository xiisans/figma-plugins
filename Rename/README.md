# Figma 批量重命名插件

用于批量重命名当前选中的 Figma 画板类节点，支持“快速命名”和“选择替换”两种模式。

## 功能

- 按画布从上到下、从左到右的顺序重命名当前选择。
- 用基础名称组合数字序列、字母序列。
- 数字与字母片段按点击“添加”的顺序拼接。
- 对现有名称执行区分大小写的全文字面替换。
- 实时预览前 6 个结果并提示重复名称、无匹配和无效选择。
- 使用 Figma 主题变量自动适配亮色、暗色模式。
- 画板名称与图层面板名称是同一个节点属性，会自动同步更新。

插件不会修改 Figma 项目文件名称，也不会发起网络请求。

## 本地开发

```bash
npm install
npm run check
```

然后在 Figma 桌面端打开：

1. `Plugins` → `Development` → `Import plugin from manifest...`
2. 选择本目录中的 `manifest.json`。
3. 选择若干 Frame、Section、Component 或 Component Set 后运行插件。

## 常用命令

```bash
npm run build      # 生成 dist/code.js 和 dist/ui.html
npm run typecheck  # TypeScript 类型检查
npm test           # 运行命名核心单元测试
npm run check      # 依次执行类型检查、测试和构建
```
