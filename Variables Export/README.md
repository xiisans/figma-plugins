# 西无 — 变量导出

用于将当前 Figma 文件的本地变量导出为 CSS、SCSS 或 Tailwind 配置文本。

## 本地开发

```bash
npm install
npm run dev
```

浏览器预览地址：`http://127.0.0.1:4173/?state=loaded`。

## 构建与导入

```bash
npm run build
```

在 Figma 桌面端依次选择 **Plugins → Development → Import plugin from manifest...**，然后选择项目根目录的 `manifest.json`。

## 验证

```bash
npm run typecheck
npm test
npm run test:e2e
```
