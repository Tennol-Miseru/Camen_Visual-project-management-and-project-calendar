# 卡门 - 工程日历管理小工具
# Camen_Visual-project-management-and-project-calendar

一个工程日历小工具，核心是**可视化的日期事项条与项目工序管理**，并通过 JSON 导入/导出实现跨设备的数据迁移。
A small engineering calendar tool centered on **visual date-range bars and project workflows**, with JSON import/export for moving data between devices.

主要用于解决多项目并行时统筹思路不清晰的问题：把「什么时候做」放进日历，把「具体做到哪一步」留在工程中。
Designed to bring clarity to multiple projects running in parallel: use the calendar for *when* and project workflows for *what's next*. 

## 功能

- **可视化日历与时间轴**：月历、时间轴双视图，支持同屏显示；跨天事项以彩色日期条表示。
- **工程与工序管理**：建立多个工程，拆分、勾选和排序工序；日期条可关联工程与工序，支持筛选、进度显示及工程归档。
- **直接拖放排期**：桌面同屏模式下，将工程卡片拖到日历日期即可创建排期；在日历空白处拖动，可一次划定连续的起止日期。
- **直观调整日期**：拖动已有日期条可整体平移；拖动两端可拉伸日期范围；时间轴的独立手柄仍可用于排序。拖动到边缘时支持自动滚动。
- **撤销与数据保护**：支持撤销/重做、本地历史快照、导入前备份与数据冲突提示；修复了月末跳月和归档后偶发拖放失效等问题。
- **轻量外观与操作**：10 套皮肤、16 种内置工程颜色、可选自定义色与点击烟花；低频设置集中收纳，手机端可通过「+ 排期」安排日期。
- **本地使用与数据迁移**：纯前端，无需服务端；使用 `localStorage` 自动保存，支持 JSON 导入/导出，方便手动备份与跨端迁移。

## 使用

1. **打开工具**：下载源码并打开根目录的 `index.html`，或者通过 GitHub Pages 部署并访问。无需安装依赖。
2. **建立工程**：新增工程并添加工序。点击工序可筛选对应日期条，拖动工程卡片左上角的排序手柄可调整顺序。
3. **快速排期**：在桌面同屏模式下将工程卡片拖到日期上；也可以在日历空白日期按住鼠标、跨天划选，松开后填写事项。触屏设备可使用工程卡片的「+ 排期」。
4. **调整日期**：拖动日期条中间可整体平移日期；拖动左右端点可调整起止日。点击日期条可编辑，时间轴上的独立排序手柄用于调整条目顺序。
5. **保存与恢复**：修改会自动保存在当前浏览器。通过右上角「设置与数据」导出 JSON 备份，或在其他浏览器、设备中导入。这里也可以管理历史快照、皮肤等设置。

**常用快捷键：** `Ctrl/Cmd + Z` 撤销，`Ctrl/Cmd + Shift + Z` 重做，`Alt + N` 新建日期条，`Alt + P` 新建工程，`Esc` 取消拖动或关闭菜单。

> **数据提醒**：本工具目前不提供在线账号同步。`localStorage` 与历史快照都保存在当前浏览器、当前网站来源下；更换设备、浏览器，或从本地文件切换到 GitHub Pages，不会自动带走原数据。请定期将 JSON 备份保存到浏览器之外。刷新页面后，当前会话的撤销记录不会保留。

可以把它保存为浏览器书签，随时打开使用。这很方便，不是吗？

## Features

- **Calendar & timeline**: Monthly calendar and timeline views, including a side-by-side layout with color-coded, multi-day task bars.
- **Project workflows**: Create projects, manage and reorder steps, track progress, archive projects, and link or filter date bars by project or step.
- **Drag-to-schedule**: In the desktop side-by-side view, drag a project card onto a calendar day to create a scheduled item. Drag across empty calendar cells to select a date range in one motion.
- **Direct date editing**: Move an existing date bar to shift its whole range, or drag either end to resize it. Separate handles preserve reordering, and edge scrolling helps with longer drags.
- **Undo & data protection**: Undo/redo, local recovery snapshots, pre-import backups, and import-conflict warnings. Includes fixes for month navigation and intermittent dragging issues after archiving.
- **Lightweight customization**: Ten visual themes, sixteen preset project colors, optional custom colors, and toggleable click-firework effects. Less-used controls are tucked into settings.
- **Portable, local-first data**: Pure front-end app with automatic `localStorage` persistence and JSON import/export for manual backups and migration.

## Usage

1. **Open the app**: Open `index.html` from the repository root, or host it through GitHub Pages. No installation or back end is required.
2. **Create projects**: Add a project and its workflow steps. Select a step to filter related date bars, or use the project card's reorder handle to change project order.
3. **Schedule work**: In the desktop side-by-side view, drag a project card onto a day; drag across empty days to select a multi-day range. On touch devices, use the card's **+ Schedule** action.
4. **Adjust dates**: Drag the middle of a date bar to move its range; drag its ends to change the start or end date. Click a bar to edit it, or use the separate timeline handle to reorder it.
5. **Back up and restore**: Changes are saved automatically in the current browser. Use **Settings & Data** in the upper-right area to export JSON, import it on another device, manage snapshots, or change themes.

**Keyboard shortcuts:** `Ctrl/Cmd + Z` to undo, `Ctrl/Cmd + Shift + Z` to redo, `Alt + N` for a new date bar, `Alt + P` for a new project, and `Esc` to cancel a drag or close a menu.

> **Data note:** There is currently no automatic cloud or account sync. Both `localStorage` data and recovery snapshots are tied to the current browser and site origin. Switching browsers, devices, or from a local file to GitHub Pages requires manual JSON export/import. Keep periodic external backups. Undo history is not retained across page reloads.

it can also be bookmarked in your browser for quick access, especially when hosted on GitHub Pages.

## 致谢

感谢赛门周先生对本项目的持续使用和反馈，列出了非常多问题和改进点，使得此项目得以改进至较高完成度。

## Acknowledgements

Thank SimonZhou for his continued use of this project and his valuable feedback. He identified numerous issues and areas for improvement, which significantly contributed to bringing the project to a high level of completion.

## 许可证 / License

MIT License，详见 [`LICENSE`](LICENSE)。
MIT License. See [`LICENSE`](LICENSE).
