#  卡门-工程日历管理小工具
#  Camen_Visual-project-management-and-project-calendar


一个工程日历小工具，核心是可视化的日期事项条与项目工序页，并支持导入/导出数据实现跨端同步。  
A small engineering calendar tool with visual timeline bars for date-based tasks and dedicated pages for project workflows. It supports data import/export for cross-device sync.

主要用于解决多项目并行时思路不清、便签或脑内难以统筹的问题。该工具几乎全部用 Codex 完成，欢迎自用或修改。  
Primarily designed to keep clarity when running multiple projects in parallel; built almost entirely with Codex—feel free to use and modify.

功能

- 月历、时间轴双视图，可同屏，彩色跨天日期条
- 工程步骤管理，步骤可与日期条关联并筛选
- 本地 `localStorage` 自动保存；JSON 导入/导出便于备份与迁移
- 纯前端单页：直接打开 `index.html` 即可
- 因为这是html所以它可以存为浏览器书签，这太方便了不是吗？

使用

- 打开 `index.html`。  
- 日期视图：点击日期条可编辑/删除；时间轴展示跨天跨度。
- 工程视图：编辑工程和步骤，点击步骤可筛选相关日期条。
- 拖拽改变日期条和工程步骤的顺序。
- 底部“导入/导出”按钮：JSON 备份或恢复数据，跨浏览器/设备同步。

Features

Dual views of calendar and timeline, available on the same screen, featuring color-coded bars spanning multiple days.

Project workflow management: steps can be linked to date ranges and filtered

Automatic local persistence via `localStorage`; supports JSON import/export for backup and migration

Pure front-end single-page app: runs directly by opening `index.html`

Since this is HTML, it can be saved as a browser bookmark—pretty convenient, isn’t it?

Usage

Open `index.html` .

Date view: click a date bar to edit or delete; the timeline visualizes multi-day spans.

Project view: manage projects and steps; selecting a step filters related date bars.

Drag to reorder the date bars and project steps.

Use the “Import/Export” buttons at the bottom to back up or restore data via JSON, enabling cross-browser/device synchronization.
