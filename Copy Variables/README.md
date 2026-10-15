# 自由复制变量

用于在多个 Figma 文件之间复制和粘贴本地变量的插件。支持集合、分组和单个变量选择，保留模式、变量路径、元数据及本地变量别名关系。

## 本地构建

```powershell
npm install
npm run test
npm run typecheck
npm run build
```

在 Figma 桌面端打开 `Plugins > Development > Import plugin from manifest...`，选择项目根目录下的 `manifest.json`。

`manifest.json` 中当前使用开发占位 ID。准备发布到 Figma Community 或团队前，请先在 Figma 的“Create new plugin”流程中获取 Figma 分配的正式插件 ID，并替换清单中的 `id`。

## 使用方式

1. 在源文件打开插件，在“复制”面板选择集合、分组或变量并点击“复制”。
2. 打开目标文件并再次运行插件。插件会识别跨文件复制记录并默认进入“粘贴”面板。
3. 调整需要粘贴的内容后点击“粘贴”。同名同类型变量会更新，缺失项会创建，类型冲突项会跳过并通过 Figma toast 提示。

复制记录保存在当前用户的 Figma 插件本地存储中。插件仅处理本地变量，不复制团队变量库内容，也不提供跨用户同步。
