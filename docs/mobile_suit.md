# 移动端适配文档 (Mobile Adaptation)

## 概述

本项目通过 **CSS 媒体查询**（主要方法）和 **JS 触摸事件 polyfill**（辅助方法）实现移动端适配。
不引入任何第三方库，全部使用浏览器原生 API。

---

## 断点设计

| 断点 | 用途 | 说明 |
|------|------|------|
| `820px` | 原有断点 | 轻度布局调整（日历2列、时间轴滚动） |
| `768px` | **主要移动断点** | 全面移动布局（7列紧凑日历、触摸优化、双视图禁用） |
| `480px` | 小屏手机 | 标签页全宽均分、标题进一步缩小 |

---

## Viewport 设置

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

禁止双指缩放，防止用户在操作日历或拖拽时意外缩放页面。

---

## CSS 适配详情

### 显示控制类

| Class | 作用 |
|-------|------|
| `.desktop-only` | 仅桌面端显示，768px 以下 `display: none !important` |
| `.mobile-only` | 仅移动端显示，768px 以上 `display: none`，以下 `display: flex !important` |

### 768px 断点（主要移动适配）

**顶栏布局：**
- `.topbar` — 保持横向单行，标题区 `flex: 1` 自适应
- 标题 `h1` — 字号缩至 20px
- 桌面专属控件（同屏开关、宽度滑块、主题下拉、本地数据提示）全部隐藏（`.desktop-only`）
- 右上角仅显示主题循环按钮（`.mobile-only`，36px 圆形按钮）

**日历网格（核心优化）：**
- 从之前的 2 列/1 列改为 **7 列紧凑网格**，与周日~周六表头对齐
- 每个日期格子：`padding: 4px`，`border-radius: 8px`，取消 `min-height`
- 格内隐藏星期文字（`.day .date span { display: none }`），仅保留日期数字
- 任务 chip 缩小：`padding: 3px 4px`，`font-size: 11px`，dot 缩至 8px
- 任务文字溢出截断：`text-overflow: ellipsis`

**其他布局变更：**
- 双视图 — 强制单列，隐藏比例滑块
- 工具栏 `.toolbar` — 纵向排列
- 图例 `.legend` — 隐藏
- 表单 — 强制单列，按钮全宽
- 页脚 — 纵向堆叠
- 统计弹层 — 网格单列、饼图缩小
- 项目列表 — 单列

**触摸目标尺寸（44px 最小标准）：**
- `.month-nav button` — 44x44px
- `.btn-ghost` — padding 10px 14px, min-height 44px
- `.tab` — padding 12px 16px
- `.step-chip` — padding 10px 12px, min-height 44px
- `.drag-handle` — min-height 44px, min-width 44px
- 所有 `button` — min-height 44px
- 注意：日历内 `.task-chip` 为紧凑模式，不强制 44px（优先保证 7 列布局可用性）

### 480px 断点（小屏手机）
- `h1` — 18px
- 标签页 — 全宽，每个标签均分

---

## 主题切换按钮（移动端）

### HTML
```html
<button type="button" class="theme-toggle-btn mobile-only" id="theme-cycle-btn" title="切换主题">🎨</button>
```

### CSS
```css
.theme-toggle-btn {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--grid-line); background: var(--chip-bg);
}
```

### JS 逻辑（`actions.js` → `initTheme()`）
点击循环切换 `black → white → gray → black`，同步更新 `themeSelect` 下拉值和 localStorage。

元素引用：`ctx.els.themeCycleBtn`（`core.js` els 对象中注册）。

---

## JavaScript 适配详情

### 新增模块：`modules/touch.js`

提供以下工具函数，挂载在 `CamenCalendar.touch` 命名空间下：

#### `isTouchDevice()`
检测设备是否支持触摸。使用 `ontouchstart in window` 和 `navigator.maxTouchPoints`。

#### `isMobile()`
检测当前是否为移动端视口。使用 `window.matchMedia("(max-width: 768px)")`。

#### `enableTouchDrag(el, options)`
触摸拖拽 polyfill。将 `touchstart` / `touchmove` / `touchend` 转译为类似 HTML5 Drag API 的事件流。

参数 `options`:
- `onDragStart(fakeEvent)` — 触摸移动超过 10px 时触发
- `onDragOver(fakeEvent)` — 手指移动到新目标上时触发
- `onDragLeave(fakeEvent)` — 手指离开目标时触发
- `onDrop(fakeEvent)` — 手指抬起时触发
- `onDragEnd()` — 拖拽结束清理

`fakeEvent` 包含 `dataTransfer.setData()` / `getData()` 方法，兼容现有 DnD handler。

核心技术：
- `document.elementFromPoint()` 定位手指下方元素
- 临时设置 `pointerEvents: 'none'` 避免拖拽元素遮挡
- `.closest()` 查找正确的拖放目标祖先
- 10px 移动阈值避免误触

#### `enableLongPress(el, callback, duration)`
长按手势，替代触屏上不可靠的 `dblclick`。默认 500ms。
- 手指移动超过 10px 自动取消
- 支持 `touchcancel` 清理

#### `onMobileChange(callback)`
监听移动端断点变化。内部使用 `matchMedia("(max-width: 768px)").addEventListener("change")`。

### 集成点

| 文件 | 位置 | 功能 |
|------|------|------|
| `render.js` | `makeTaskChip()` | 日历任务条触摸拖拽排序 |
| `render.js` | `renderTimeline()` | 时间轴任务条触摸拖拽排序 |
| `render.js` | `renderProjects()` | 步骤chip长按进入编辑（替代双击） |
| `render.js` | `renderProjectStats()` | 步骤表格包裹滚动容器 |
| `actions.js` | `renderStepDraft()` | 步骤拖拽手柄触摸排序 |
| `actions.js` | `initTheme()` | 主题循环按钮点击绑定 |
| `bindings.js` | `init()` | 移动端检测、双视图自动禁用 |
| `bindings.js` | `bindDualView()` | 移动端强制关闭双视图 |
| `core.js` | `els` | 添加 `themeCycleBtn` 元素引用 |
| `core.js` | `runtime` | 添加 `isMobile` 状态标记 |

---

## 脚本加载顺序

```
core.js → tasks.js → actions.js → render.js → touch.js → bindings.js → app.js
```

`touch.js` 必须在 `render.js` 之后（render.js 中引用 `ns.touch`），在 `bindings.js` 之前（bindings.js 中初始化移动端检测）。

---

## 测试清单

- [ ] Chrome DevTools 设备模拟（iPhone SE / Pixel 7）检查布局
- [ ] 日历网格在 768px 下显示 **7 列紧凑网格**
- [ ] 双指缩放被禁止
- [ ] 同屏按钮、宽度滑块、主题下拉在手机端不可见
- [ ] 右上角主题循环按钮正常工作（黑→白→灰循环）
- [ ] 触摸拖拽任务条在日历天格间重排序
- [ ] 触摸拖拽时间轴条重排序
- [ ] 触摸拖拽步骤排序手柄
- [ ] 长按步骤chip触发编辑工程（500ms）
- [ ] 双视图在移动端自动禁用
- [ ] 所有按钮触摸区域 >= 44px（日历内 chip 除外）
- [ ] 表单单列显示，按钮全宽
- [ ] 步骤表格可横向滚动
- [ ] 统计弹层在移动端正常显示
- [ ] 桌面端无回归（鼠标拖拽、双击仍正常，所有桌面控件可见）
- [ ] 主题切换在桌面端下拉和移动端按钮均正常
- [ ] 导入/导出在移动端正常

## 已知限制

1. **触摸拖拽无视觉幽灵**：不像原生 HTML5 拖拽会显示半透明副本，触摸拖拽通过 `.dragging` CSS 类提供视觉反馈
2. **不支持多指手势**：仅处理单指触摸，多指触摸会被忽略
3. **日历 chip 紧凑模式**：7 列布局下任务 chip 较小，文字会被截断，长标题需要点击查看完整内容
4. **长按与滚动冲突**：移动超过 10px 自动取消长按，但极端情况下可能误触
