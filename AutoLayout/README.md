# 批量自动布局

一个本地 Figma 插件，为当前选中的多个元素分别应用 Auto Layout。

## 构建

在插件目录执行：

```powershell
npm install
npm run build
```

在 Figma 中选择 **Plugins > Development > Import plugin from manifest...**，然后选择项目根目录的 `manifest.json`。

## 行为说明

- 默认 Padding 为 16，Gap 为 8，单位为 px。
- 已经是 Auto Layout 容器的节点会直接更新四边 Padding 和 `itemSpacing`。
- 点击确定后，成功处理的 Auto Layout 容器和新建包装 Frame 都会设置为水平、垂直双向 `HUG（适应内容）`。
- 普通文本、矩形、图片、矢量和普通 Frame 会被各自包进一个透明、独立的垂直 Auto Layout Frame。
- 组件实例和实例内部节点不会被重排；锁定图层会跳过。
- 位于主组件内部的子节点也会跳过；选择独立主组件本身时仍可处理。
- 普通元素包装时会尽量保留原位置、父级顺序、尺寸、旋转和 Auto Layout 子项属性。默认方向为垂直方向，单子节点包装不会改变视觉布局。
- 一次点击产生一组连续的 Figma 编辑，可使用 Figma 的一次撤销操作回退。

## 已知限制

Figma 对实例节点的内部结构修改有限制，因此插件选择跳过实例及其实例内部节点，以避免破坏组件结构。部分受保护或特殊节点可能由 Figma API 拒绝，插件会在面板中列出具体失败原因。
