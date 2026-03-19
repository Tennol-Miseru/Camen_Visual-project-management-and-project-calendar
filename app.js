// Engineering calendar main script

document.addEventListener("DOMContentLoaded", bootstrap);

function bootstrap() {
  const storage = {
    load(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    save(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  let uid = Date.now();
  const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${uid++}`);

  const seedProjects = [];
  const seedTasks = [];

  const state = {
    tasks: storage.load("calendar_tasks", seedTasks),
    projects: storage.load("calendar_projects", seedProjects),
    viewDate: new Date(),
    filterProjectId: "",
    filterStepId: null,
    timelineZoom: storage.load("calendar_timeline_zoom", 1),
    fpdEnabled: storage.load("calendar_fpd", false)
  };

  const els = {
    tabs: document.querySelectorAll(".tab"),
    views: document.querySelectorAll(".view"),
    monthLabel: document.getElementById("month-label"),
    calendarGrid: document.getElementById("calendar-grid"),
    timelineGrid: document.getElementById("timeline-grid"),
    timelineHeader: document.getElementById("timeline-header"),
    legend: document.getElementById("legend"),
    taskForm: document.getElementById("task-form"),
    taskIdInput: document.getElementById("task-id"),
    deleteTaskBtn: document.getElementById("delete-task"),
    taskDone: document.getElementById("task-done"),
    useProjectColor: document.getElementById("use-project-color"),
    taskNewBtn: document.getElementById("task-new-btn"),
    projectForm: document.getElementById("project-form"),
    projectSelect: document.getElementById("project-select"),
    stepSelect: document.getElementById("step-select"),
    projectsList: document.getElementById("projects-list"),
    stepList: document.getElementById("step-list"),
    addStepBtn: document.getElementById("add-step"),
    projectColor: document.getElementById("project-color"),
    themeSelect: document.getElementById("theme-select"),
    importBtn: document.getElementById("import-btn"),
    exportBtn: document.getElementById("export-btn"),
    importFile: document.getElementById("import-file"),
    projectFilter: document.getElementById("project-filter"),
    filterClear: document.getElementById("filter-clear"),
    dualToggle: document.getElementById("dual-toggle"),
    ratioRange: document.getElementById("ratio-range"),
    ratioPill: document.getElementById("ratio-pill"),
    timelineZoom: document.getElementById("timeline-zoom"),
    fpdToggle: document.getElementById("fpd-toggle"),
    noEnd: document.getElementById("no-end"),
    startDate: document.getElementById("start-date"),
    endDate: document.getElementById("end-date"),
    draftList: document.getElementById("draft-list"),
    projectDraft: document.getElementById("project-draft"),
    toast: document.getElementById("toast")
  };

  const ui = {
    projectFormLegend: document.querySelector("#projects-view summary"),
    projectIdInput: document.getElementById("project-id"),
    taskDetails: document.querySelector("#calendar-view details"),
    projectSubmit: document.querySelector("#project-form button[type='submit']"),
    taskSubmit: document.querySelector("#task-form button[type='submit']")
  };

  const THEMES = ["black", "white", "gray"];
  const RATIO_DEFAULT = 70;
  const ZOOM_MIN = 0.2;
  const ZOOM_MAX = 4.5;
  let stepDraft = [];
  let editingTaskId = null;
  let draggingTaskId = null;

  bindTabs();
  bindNav();
  bindForms();
  bindFilters();
  bindRatio();
  bindDualView();
  bindTimelineZoom();
  bindNoEnd();
  bindFPD();
  document.addEventListener("dragend", clearDragState);
  if (els.timelineGrid) {
    els.timelineGrid.addEventListener("dragover", onGridDragOver);
    els.timelineGrid.addEventListener("dragleave", onGridDragLeave);
    els.timelineGrid.addEventListener("drop", onGridDrop);
  }
  resetTaskForm();
  initTheme();
  renderStepDraft();
  bindImportExport();
  renderAll();

  // tabs
  function bindTabs() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        els.tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.target;
        els.views.forEach((v) => v.classList.toggle("active", v.id === target));
      });
    });
  }

  function bindNav() {
    document.getElementById("prev-month").addEventListener("click", () => changeMonth(-1));
    document.getElementById("next-month").addEventListener("click", () => changeMonth(1));
  }

  function bindForms() {
    // task submit
    els.taskForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(els.taskForm));
      if (!data.title.trim()) return;
      if (!data.start) return;
      if (els.useProjectColor && els.useProjectColor.checked && data.projectId) {
        data.color = getProjectColor(data.projectId);
        if (els.taskForm.color) els.taskForm.color.value = data.color;
      }
      if (els.noEnd.checked) {
        data.end = monthEnd(data.start);
        els.endDate.value = data.end;
      }
      const start = parseDate(data.start);
      const end = parseDate(data.end);
      if (start > end) {
        alert("结束日期必须不早于开始日期");
        return;
      }
      if (editingTaskId) {
        const t = state.tasks.find((x) => x.id === editingTaskId);
        if (t) Object.assign(t, {
          title: data.title.trim(),
          start: data.start,
          end: data.end,
          color: data.color || "#00bfa6",
          projectId: data.projectId || "",
          stepId: data.stepId || "",
          note: data.note || "",
          done: els.taskDone?.checked || false
        });
        if (state.fpdEnabled && t) compressTask(t, true);
      } else {
        const newTask = {
          id: uuid(),
          title: data.title.trim(),
          start: data.start,
          end: data.end,
          color: data.color || "#00bfa6",
          projectId: data.projectId || "",
          stepId: data.stepId || "",
          note: data.note || "",
          order: state.tasks.length,
          done: els.taskDone?.checked || false
        };
        state.tasks.push(newTask);
        if (state.fpdEnabled) compressTask(newTask, true);
      }
      persist();
      resetTaskForm();
      renderAll();
      showToast("保存成功");
    });

    // project submit
    els.projectForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(els.projectForm));
      const isDraft = !!els.projectDraft?.checked;
      const existing = state.projects.find((p) => p.id === data.projectId);
      const steps = normalizeSteps(stepDraft, existing?.steps || [], existing?.id || "");
      if (existing) {
        Object.assign(existing, {
          name: data.name.trim(),
          description: data.description || "",
          steps,
          color: data.projectColor || existing.color || "#00bfa6",
          draft: isDraft
        });
        if (state.filterStepId && !steps.some((s) => s.id === state.filterStepId)) state.filterStepId = null;
      } else {
        state.projects.push({
          id: `proj-${uuid()}`,
          name: data.name.trim(),
          description: data.description || "",
          steps,
          color: data.projectColor || "#00bfa6",
          draft: isDraft
        });
      }
      persist();
      ui.projectFormLegend.textContent = "新增工程";
      resetProjectDraft();
      renderAll();
      showToast("保存成功");
    });

    els.projectSelect.addEventListener("change", () => populateStepSelect(els.projectSelect.value));
    els.projectSelect.addEventListener("change", () => {
      if (els.useProjectColor && els.useProjectColor.checked && els.projectSelect.value) {
        const c = getProjectColor(els.projectSelect.value);
        if (els.taskForm.color) els.taskForm.color.value = c;
      }
    });
    els.addStepBtn.addEventListener("click", () => {
      stepDraft.push({ id: `step-${uuid()}`, title: `步骤 ${stepDraft.length + 1}`, done: false });
      renderStepDraft();
    });

    if (els.taskNewBtn) els.taskNewBtn.addEventListener("click", () => {
      resetTaskForm();
      if (ui.taskDetails) ui.taskDetails.open = true;
    });
    if (els.projectNewBtn) els.projectNewBtn.addEventListener("click", () => {
      resetProjectDraft();
      const formDetails = document.querySelector("#projects-view details");
      if (formDetails) formDetails.open = true;
    });

    if (els.deleteTaskBtn) {
      els.deleteTaskBtn.addEventListener("click", () => {
        if (!editingTaskId) {
          alert("请先选择要删除的日期条");
          return;
        }
        state.tasks = state.tasks.filter((t) => t.id !== editingTaskId);
        persist();
        resetTaskForm();
        renderAll();
      });
    }
  }

  function bindFilters() {
    if (els.projectFilter) {
      els.projectFilter.addEventListener("change", () => {
        state.filterProjectId = els.projectFilter.value;
        renderAll();
      });
    }
    if (els.filterClear) {
      els.filterClear.addEventListener("click", () => {
        state.filterProjectId = "";
        state.filterStepId = null;
        if (els.projectFilter) els.projectFilter.value = "";
        renderAll();
      });
    }
  }

  function bindDualView() {
    if (!els.dualToggle) return;
    const apply = () => {
      const on = els.dualToggle.checked;
      document.body.classList.toggle("dual-view", on);
      if (els.ratioPill) els.ratioPill.hidden = !on;
    };
    els.dualToggle.addEventListener("change", apply);
    apply();
  }

  function bindRatio() {
    if (!els.ratioRange) return;
    let saved = storage.load("calendar_ratio", RATIO_DEFAULT);
    if (typeof saved !== "number" || Number.isNaN(saved)) saved = RATIO_DEFAULT;
    saved = clamp(saved, 55, 85);
    els.ratioRange.value = saved;
    applyRatio(saved);
    els.ratioRange.addEventListener("input", () => {
      const val = clamp(Number(els.ratioRange.value), 55, 85);
      applyRatio(val);
      storage.save("calendar_ratio", val);
    });
  }

  function bindTimelineZoom() {
    if (!els.timelineZoom) return;
    let z = Number(state.timelineZoom) || 1;
    z = clamp(z, ZOOM_MIN, ZOOM_MAX);
    els.timelineZoom.value = z;
    els.timelineZoom.addEventListener("input", () => {
      const val = clamp(Number(els.timelineZoom.value), ZOOM_MIN, ZOOM_MAX);
      state.timelineZoom = val;
      storage.save("calendar_timeline_zoom", val);
      renderTimeline();
    });
  }

  function bindFPD() {
    if (!els.fpdToggle) return;
    els.fpdToggle.checked = Boolean(state.fpdEnabled);
    const apply = () => {
      state.fpdEnabled = els.fpdToggle.checked;
      storage.save("calendar_fpd", state.fpdEnabled);
      applyParkinson(state.fpdEnabled);
      renderAll();
      if (state.fpdEnabled) showToast("已缩减日期条时长为计划的一半，取消勾选防帕金森按钮可复原");
      else showToast("已还原日期条原始时长");
    };
    els.fpdToggle.addEventListener("change", apply);
    if (state.fpdEnabled) applyParkinson(true);
  }

  function bindNoEnd() {
    if (!els.noEnd || !els.startDate || !els.endDate) return;
    const sync = () => {
      if (els.noEnd.checked && els.startDate.value) {
        els.endDate.value = monthEnd(els.startDate.value);
      }
    };
    els.noEnd.addEventListener("change", sync);
    els.startDate.addEventListener("change", sync);
  }

  function bindImportExport() {
    if (els.exportBtn) {
      els.exportBtn.addEventListener("click", () => {
        const payload = {
          projects: state.projects,
          tasks: state.tasks,
          theme: document.body.dataset.theme || "black",
          exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `engineering-calendar-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (els.importBtn && els.importFile) {
      els.importBtn.addEventListener("click", () => els.importFile.click());
      els.importFile.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          const projects = Array.isArray(data.projects) ? data.projects : [];
          const tasks = Array.isArray(data.tasks) ? data.tasks : [];
          if (projects.length === 0 && tasks.length === 0) throw new Error("文件中没有可导入的数据");
          state.projects = projects;
          state.tasks = tasks;
          const theme = THEMES.includes(data.theme) ? data.theme : "black";
          applyTheme(theme);
          storage.save("calendar_theme", theme);
          persist();
          populateProjectSelect();
          renderAll();
          alert("导入成功");
        } catch (err) {
          console.error(err);
          alert("导入失败，请确认文件为本工具导出的 JSON。");
        } finally {
          e.target.value = "";
        }
      });
    }
  }

  // render
  function renderAll() {
    populateProjectSelect();
    populateProjectFilter();
    populateStepSelect(els.projectSelect.value);
    renderLegend();
    renderCalendar();
    renderTimeline();
    renderProjects();
    renderDrafts();
  }

  function renderLegend() {
    els.legend.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const items = state.projects.filter((p) => !p.draft).map((p) => {
      const task = state.tasks.find((t) => t.projectId === p.id && t.color);
      return { label: p.name, color: p.color || task?.color || "#94a3b8" };
    });
    if (items.length === 0) {
      const span = document.createElement("span");
      span.textContent = "暂无工程";
      span.style.color = "var(--muted)";
      fragment.appendChild(span);
    } else {
      items.forEach((item) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = item.color;
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(item.label));
        fragment.appendChild(chip);
      });
    }
    els.legend.appendChild(fragment);
    updateFilterIndicator();
  }

  function updateFilterIndicator() {
    if (!els.filterClear) return;
    const active = Boolean(state.filterProjectId || state.filterStepId);
    els.filterClear.hidden = !active;
  }

  function renderCalendar() {
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay.getDay();
    const todayStr = toDateStrLocal(new Date());
    els.monthLabel.textContent = `${year}年 ${month + 1}月`;
    els.calendarGrid.innerHTML = "";

    const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
    weekdayNames.forEach((w) => {
      const label = document.createElement("div");
      label.textContent = w;
      label.style.textAlign = "center";
      label.style.color = "var(--muted)";
      label.style.padding = "4px 0";
      els.calendarGrid.appendChild(label);
    });

    for (let i = 0; i < startOffset; i++) {
      const empty = document.createElement("div");
      empty.className = "day";
      empty.style.opacity = 0.3;
      els.calendarGrid.appendChild(empty);
    }

    const tasks = visibleTasks().filter(isValidTask);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateStrLocal(new Date(year, month, day));
      const cell = document.createElement("div");
      cell.className = "day";
      if (dateStr === todayStr) cell.classList.add("today");

      const header = document.createElement("div");
      header.className = "date";
      header.innerHTML = `<strong>${day}</strong><span>${weekdayNames[new Date(year, month, day).getDay()]}</span>`;

      const chipsBox = document.createElement("div");
      chipsBox.className = "chips";

    const dayTasks = tasks.filter((t) => dateStr >= t.start && dateStr <= t.end);
    dayTasks.forEach((t) => chipsBox.appendChild(makeTaskChip(t)));

    cell.appendChild(header);
    cell.appendChild(chipsBox);
      els.calendarGrid.appendChild(cell);
    }
  }

  function renderTimeline() {
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellSize = Math.round(20 * clamp(Number(state.timelineZoom) || 1, ZOOM_MIN, ZOOM_MAX));

    els.timelineHeader.style.gridTemplateColumns = `repeat(${daysInMonth}, minmax(${cellSize}px, 1fr))`;
    els.timelineHeader.innerHTML = "";
    for (let i = 1; i <= daysInMonth; i++) {
      const cell = document.createElement("div");
      cell.textContent = i;
      cell.style.textAlign = "center";
      cell.style.padding = "4px 0";
      cell.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
      els.timelineHeader.appendChild(cell);
    }

    const tasks = visibleTasks()
      .filter(isValidTask)
      .filter((t) => overlapsMonth(t, year, month))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || parseDate(a.start) - parseDate(b.start) || parseDate(a.end) - parseDate(b.end));

    const lanes = packTasks(tasks);
    els.timelineGrid.innerHTML = "";
    if (tasks.length === 0) {
      els.timelineGrid.textContent = "本月暂无日期条。";
      return;
    }

    lanes.forEach((lane) => {
      const row = document.createElement("div");
      row.className = "timeline-row";
      row.style.gridTemplateColumns = `repeat(${daysInMonth}, minmax(${cellSize}px, 1fr))`;
      lane.forEach((task) => {
        const bar = document.createElement("div");
        bar.className = "task-bar";
        bar.draggable = true;
        bar.dataset.taskId = task.id;
        if (isTaskDone(task)) bar.classList.add("done");
        bar.style.background = task.color;
        bar.style.gridColumn = `${clampToMonth(task.start, year, month)} / ${clampToMonth(task.end, year, month) + 1}`;
        const projectName = getProjectName(task.projectId);
        bar.textContent = task.title;
        bar.title = projectName ? `${projectName} | ${task.start} ~ ${task.end}` : `${task.start} ~ ${task.end}`;
        if (bar.classList.contains("done")) {
          bar.style.color = "#e5e7eb";
          bar.style.textDecoration = "line-through";
        } else {
          bar.style.color = "#0b1324";
          bar.style.textDecoration = "none";
        }
        bar.addEventListener("click", () => startEditTask(task));
        bar.addEventListener("dragstart", onTaskDragStart);
        bar.addEventListener("dragover", onTaskDragOver);
        bar.addEventListener("dragleave", onTaskDragLeave);
        bar.addEventListener("drop", onTaskDrop);
        row.appendChild(bar);
      });
      els.timelineGrid.appendChild(row);
    });
  }

  function renderProjects() {
    els.projectsList.innerHTML = "";
    const list = state.projects.filter((p) => !p.draft);
    if (list.length === 0) {
      els.projectsList.textContent = "暂无工程，先添加一个吧。";
      return;
    }

    list.forEach((p) => {
      const card = document.createElement("div");
      card.className = "project-card";
      const head = document.createElement("div");
      head.className = "card-head";
      const title = document.createElement("h3");
      title.textContent = p.name;
      const colorChip = document.createElement("span");
      colorChip.className = "project-color-chip";
      const chipDot = document.createElement("span");
      chipDot.className = "dot";
      chipDot.style.background = p.color || "#00bfa6";
      colorChip.appendChild(chipDot);
      head.appendChild(colorChip);
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "6px";
      const editBtn = document.createElement("button");
      editBtn.className = "btn-ghost";
      editBtn.textContent = "编辑";
      editBtn.addEventListener("click", () => startEditProject(p));
      const delBtn = document.createElement("button");
      delBtn.className = "btn-ghost";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", () => deleteProject(p.id));
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      head.appendChild(title);
      head.appendChild(actions);

      const desc = document.createElement("div");
      desc.textContent = p.description || "（无简介）";
      title.style.cursor = "pointer";
      desc.style.cursor = "pointer";
      title.addEventListener("click", () => startEditProject(p));
      desc.addEventListener("click", () => startEditProject(p));

      const stepsBox = document.createElement("div");
      stepsBox.className = "project-steps";
      p.steps.forEach((s, idx) => {
        const chip = document.createElement("div");
        chip.className = "step-chip";
        chip.dataset.stepId = s.id;
        chip.innerHTML = `<span class="badge">${idx + 1}</span> ${s.title}`;
        if (s.done) chip.classList.add("done");
        chip.addEventListener("dblclick", (ev) => {
          ev.stopPropagation();
          startEditProject(p);
        });

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = Boolean(s.done);
        check.title = "标记步骤已完成";
        check.addEventListener("click", (ev) => {
          ev.stopPropagation();
          s.done = !s.done;
          persist();
          renderProjects();
          renderAll();
        });
        chip.appendChild(check);

        stepsBox.appendChild(chip);
      });

      const related = document.createElement("div");
      related.style.color = "var(--muted)";
      const taskCount = state.tasks.filter((t) => t.projectId === p.id).length;
      related.textContent = `关联日期条：${taskCount} 条`;

      card.appendChild(head);
      card.appendChild(desc);
      card.appendChild(stepsBox);
      card.appendChild(related);
      els.projectsList.appendChild(card);
    });
  }

  function renderDrafts() {
    if (!els.draftList) return;
    els.draftList.innerHTML = "";
    const drafts = state.projects.filter((p) => p.draft);
    if (drafts.length === 0) {
      els.draftList.textContent = "暂无草稿";
      return;
    }
    drafts.forEach((p) => {
      const card = document.createElement("div");
      card.className = "project-card";
      const title = document.createElement("h3");
      title.textContent = p.name || "未命名";
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      const publish = document.createElement("button");
      publish.className = "btn-ghost";
      publish.textContent = "发布到列表";
      publish.addEventListener("click", () => {
        p.draft = false;
        persist();
        renderAll();
      });

      const remove = document.createElement("button");
      remove.className = "btn-ghost";
      remove.textContent = "删除";
      remove.addEventListener("click", () => {
        state.projects = state.projects.filter((proj) => proj.id !== p.id);
        state.tasks = state.tasks.filter((t) => t.projectId !== p.id);
        persist();
        renderAll();
      });

      card.appendChild(title);
      actions.appendChild(publish);
      actions.appendChild(remove);
      card.appendChild(actions);
      els.draftList.appendChild(card);
    });
  }

  // helpers
  function visibleTasks() {
    let list = state.tasks.slice();
    if (state.filterProjectId) list = list.filter((t) => t.projectId === state.filterProjectId);
    if (state.filterStepId) list = list.filter((t) => t.stepId === state.filterStepId);
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return list;
  }

  function isValidTask(t) {
    return t && t.start && t.end;
  }

  function makeTaskChip(task) {
    const tmpl = document.getElementById("task-chip-template");
    const node = tmpl.content.firstElementChild.cloneNode(true);
    if (isTaskDone(task)) node.classList.add("done");
    node.querySelector(".dot").style.background = task.color;
    node.querySelector(".text").textContent = task.title;
    const projectName = getProjectName(task.projectId);
    const projLabel = projectName || "无所属";
    node.title = `${projLabel} | ${task.start} ~ ${task.end}`;
    node.setAttribute("data-project", projLabel);
    node.draggable = true;
    node.dataset.taskId = task.id;
    node.addEventListener("dragstart", onChipDragStart);
    node.addEventListener("dragover", onChipDragOver);
    node.addEventListener("dragleave", onChipDragLeave);
    node.addEventListener("drop", onChipDrop);
    node.addEventListener("click", () => startEditTask(task));
    return node;
  }

  function isTaskDone(task) {
    if (task.stepId) {
      const project = state.projects.find((p) => p.id === task.projectId);
      const step = project?.steps.find((s) => s.id === task.stepId);
      if (step) return Boolean(step.done);
    }
    return Boolean(task.done);
  }

  function overlapsMonth(task, year, month) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const start = parseDate(task.start);
    const end = parseDate(task.end);
    return start <= monthEnd && end >= monthStart;
  }

  function clampToMonth(dateStr, year, month) {
    const date = parseDate(dateStr);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    if (date < monthStart) return 1;
    if (date > monthEnd) return monthEnd.getDate();
    return date.getDate();
  }

  function packTasks(tasks) {
    const lanes = [];
    tasks.forEach((task) => {
      let placed = false;
      for (const lane of lanes) {
        const last = lane[lane.length - 1];
        if (parseDate(last.end) < parseDate(task.start)) {
          lane.push(task);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([task]);
    });
    return lanes;
  }

  function clearDragState() {
    document.querySelectorAll(".timeline-row.preview").forEach((r) => r.classList.remove("preview"));
    document.querySelectorAll(".task-bar.dragging").forEach((b) => b.classList.remove("dragging"));
    document.querySelectorAll(".task-chip.dragging").forEach((c) => c.classList.remove("dragging"));
    document.querySelectorAll(".task-chip.preview").forEach((c) => c.classList.remove("preview"));
    if (els.timelineGrid) els.timelineGrid.classList.remove("preview-grid");
    draggingTaskId = null;
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function onChipDragStart(e) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", e.currentTarget.dataset.taskId);
    e.currentTarget.classList.add("dragging");
  }
  function onChipDragOver(e) {
    e.preventDefault();
    const chip = e.currentTarget;
    chip.classList.add("preview");
  }
  function onChipDragLeave(e) {
    e.currentTarget.classList.remove("preview");
  }
  function onChipDrop(e) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain");
    const toId = e.currentTarget.dataset.taskId;
    if (!fromId || !toId || fromId === toId) return;
    const list = visibleTasks().filter(isValidTask);
    const fromIdx = list.findIndex((t) => t.id === fromId);
    const toIdx = list.findIndex((t) => t.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    list.splice(toIdx, 0, list.splice(fromIdx, 1)[0]);
    list.forEach((t, i) => {
      const real = state.tasks.find((x) => x.id === t.id);
      if (real) real.order = i;
    });
    clearDragState();
    persist();
    renderAll();
  }

  function onGridDragOver(e) {
    if (!draggingTaskId) return;
    e.preventDefault();
    if (els.timelineGrid) els.timelineGrid.classList.add("preview-grid");
  }

  function onGridDragLeave() {
    if (els.timelineGrid) els.timelineGrid.classList.remove("preview-grid");
  }

  function onGridDrop(e) {
    if (!draggingTaskId) return;
    e.preventDefault();
    const list = visibleTasks().filter(isValidTask);
    const fromIdx = list.findIndex((t) => t.id === draggingTaskId);
    if (fromIdx === -1) return;
    const lanes = packTasks(list);
    const rect = els.timelineGrid.getBoundingClientRect();
    const rowHeight = Math.max(40, rect.height / Math.max(1, lanes.length || 1));
    let targetRow = Math.floor((e.clientY - rect.top) / rowHeight);
    targetRow = clamp(targetRow, 0, lanes.length);

    // 计算插入索引：在目标行的首个元素之前；若是新行（末尾），则放列表尾
    let insertIdx = 0;
    for (let i = 0; i < targetRow && i < lanes.length; i++) insertIdx += lanes[i].length;
    if (targetRow >= lanes.length) insertIdx = list.length;

    const [item] = list.splice(fromIdx, 1);
    list.splice(insertIdx > fromIdx ? insertIdx - 1 : insertIdx, 0, item);
    list.forEach((t, i) => {
      const real = state.tasks.find((x) => x.id === t.id);
      if (real) real.order = i;
    });
    clearDragState();
    persist();
    renderAll();
  }

  function dateStrOffset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return toDateStrLocal(d);
  }

  function toDateStrLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function monthEnd(startStr) {
    // extend to the end of the next month (跨月末尾)
    const [y, m] = startStr.split("-").map(Number);
    return toDateStrLocal(new Date(y, m + 1, 0));
  }

  function parseDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function changeMonth(delta) {
    const d = new Date(state.viewDate);
    d.setMonth(d.getMonth() + delta);
    state.viewDate = d;
    renderCalendar();
    renderTimeline();
  }

  function populateProjectSelect() {
    els.projectSelect.innerHTML = `<option value="">（可选）</option>`;
    state.projects.filter((p) => !p.draft).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      els.projectSelect.appendChild(opt);
    });
  }

  function populateProjectFilter() {
    if (!els.projectFilter) return;
    const current = els.projectFilter.value;
    els.projectFilter.innerHTML = `<option value="">全部工程</option>`;
    state.projects.filter((p) => !p.draft).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      els.projectFilter.appendChild(opt);
    });
    if ([...els.projectFilter.options].some((o) => o.value === current)) els.projectFilter.value = current;
  }

  function populateStepSelect(projectId) {
    els.stepSelect.innerHTML = "";
    if (!projectId) {
      els.stepSelect.innerHTML = `<option value="">（先选工程）</option>`;
      return;
    }
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    els.stepSelect.innerHTML = `<option value="">（可选）</option>`;
    project.steps.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.title;
      els.stepSelect.appendChild(opt);
    });
  }

  function startEditTask(task) {
    editingTaskId = task.id;
    if (els.taskIdInput) els.taskIdInput.value = task.id;
    els.taskForm.title.value = task.title;
    els.taskForm.color.value = task.color;
    els.taskForm.start.value = task.start;
    els.taskForm.end.value = task.end;
    els.noEnd.checked = false;
    els.taskForm.note.value = task.note || "";
    if (els.taskDone) els.taskDone.checked = !!task.done;
    els.projectSelect.value = task.projectId || "";
    populateStepSelect(task.projectId || "");
    els.stepSelect.value = task.stepId || "";
    if (els.useProjectColor && task.projectId) {
      const projColor = getProjectColor(task.projectId);
      els.useProjectColor.checked = task.color === projColor;
    } else if (els.useProjectColor) {
      els.useProjectColor.checked = false;
    }
    if (ui.taskDetails) ui.taskDetails.open = true;
    const submitBtn = els.taskForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "更新日期条";
    if (els.deleteTaskBtn) els.deleteTaskBtn.disabled = false;
    document.querySelector('[data-target="calendar-view"]').click();
  }

  function startEditProject(project) {
    ui.projectIdInput.value = project.id;
    els.projectForm.name.value = project.name;
    els.projectForm.description.value = project.description || "";
    if (els.projectColor) els.projectColor.value = project.color || "#00bfa6";
    stepDraft = project.steps.map((s) => ({ ...s }));
    renderStepDraft();
    ui.projectFormLegend.textContent = "编辑工程";
    if (ui.projectSubmit) ui.projectSubmit.textContent = "更新工程";
    if (els.projectDraft) els.projectDraft.checked = !!project.draft;
    const formDetails = document.querySelector("#projects-view details");
    if (formDetails) formDetails.open = true;
    document.querySelector('[data-target="projects-view"]').click();
  }

  function deleteProject(projectId) {
    if (!confirm("删除工程会同时移除关联的日期条，确定吗？")) return;
    state.projects = state.projects.filter((p) => p.id !== projectId);
    state.tasks = state.tasks.filter((t) => t.projectId !== projectId);
    state.filterStepId = null;
    persist();
    populateProjectSelect();
    renderAll();
  }

  function normalizeSteps(draft, existingSteps, projectId) {
    const clean = draft
      .map((s) => ({ ...s, title: (s.title || "").trim() }))
      .filter((s) => s.title.length > 0)
      .map((s, idx) => ({
        id: s.id || existingSteps[idx]?.id || `step-${uuid()}`,
        title: s.title,
        done: existingSteps[idx]?.done ?? s.done ?? false,
        order: idx + 1
      }));

    if (projectId) {
      const validIds = new Set(clean.map((s) => s.id));
      state.tasks.forEach((t) => {
        if (t.projectId === projectId && t.stepId && !validIds.has(t.stepId)) t.stepId = "";
      });
    }
    return clean;
  }

  function renderStepDraft() {
    els.stepList.innerHTML = "";
    if (stepDraft.length === 0) {
      const hint = document.createElement("div");
      hint.style.color = "var(--muted)";
      hint.textContent = "暂无步骤，点击下方“＋ 添加步骤”";
      els.stepList.appendChild(hint);
      return;
    }

    stepDraft.forEach((step, idx) => {
      const row = document.createElement("div");
      row.className = "step-row";
      row.draggable = false;
      row.dataset.idx = idx;

      const handle = document.createElement("div");
      handle.className = "drag-handle";
      handle.textContent = "↕";
      handle.draggable = true;
      handle.addEventListener("dragstart", (e) => onStepDragStart(e, idx));
      handle.addEventListener("dragover", onStepDragOver);
      handle.addEventListener("dragleave", onStepDragLeave);
      handle.addEventListener("drop", (e) => onStepDrop(e, idx));
      row.appendChild(handle);

      const input = document.createElement("input");
      input.value = step.title;
      input.placeholder = `步骤 ${idx + 1}`;
      input.addEventListener("input", (e) => {
        stepDraft[idx].title = e.target.value;
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn-ghost";
      remove.textContent = "删除";
      remove.addEventListener("click", () => {
        stepDraft.splice(idx, 1);
        renderStepDraft();
      });

      row.addEventListener("dragover", onStepDragOver);
      row.addEventListener("dragleave", onStepDragLeave);
      row.addEventListener("drop", (e) => onStepDrop(e, idx));

      row.appendChild(input);
      row.appendChild(remove);
      els.stepList.appendChild(row);
    });
  }

  function onStepDragStart(e, idx) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", idx.toString());
    e.currentTarget.classList.add("dragging");
  }
  function onStepDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    e.currentTarget.classList.add("dragging");
  }
  function onStepDragLeave(e) {
    e.currentTarget.classList.remove("dragging");
  }
  function onStepDrop(e, targetIdx) {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isNaN(from)) return;
    const item = stepDraft.splice(from, 1)[0];
    stepDraft.splice(targetIdx, 0, item);
    renderStepDraft();
  }

  function onTaskDragStart(e) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", e.currentTarget.dataset.taskId);
    e.currentTarget.classList.add("dragging");
    draggingTaskId = e.currentTarget.dataset.taskId;
  }
  function onTaskDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const row = e.currentTarget.closest(".timeline-row");
    if (row) row.classList.add("preview");
  }
  function onTaskDragLeave(e) {
    const row = e.currentTarget.closest(".timeline-row");
    if (row) row.classList.remove("preview");
  }
  function onTaskDrop(e) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain") || draggingTaskId;
    const toId = e.currentTarget.dataset.taskId;
    if (!fromId || !toId || fromId === toId) return;
    const list = visibleTasks().filter(isValidTask);
    const fromIdx = list.findIndex((t) => t.id === fromId);
    const toIdx = list.findIndex((t) => t.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    list.splice(toIdx, 0, list.splice(fromIdx, 1)[0]);
    list.forEach((t, i) => {
      const real = state.tasks.find((x) => x.id === t.id);
      if (real) real.order = i;
    });
    clearDragState();
    persist();
    renderAll();
  }

  function resetTaskForm() {
    editingTaskId = null;
    if (els.taskIdInput) els.taskIdInput.value = "";
    if (els.taskForm) els.taskForm.reset();
    if (els.noEnd) els.noEnd.checked = false;
    if (els.taskDone) els.taskDone.checked = false;
    if (els.useProjectColor) els.useProjectColor.checked = false;
    const submitBtn = els.taskForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "保存日期条";
    if (els.deleteTaskBtn) els.deleteTaskBtn.disabled = true;
  }

  function resetProjectDraft() {
    ui.projectIdInput.value = "";
    stepDraft = [];
    renderStepDraft();
    ui.projectFormLegend.textContent = "新增工程";
    if (ui.projectSubmit) ui.projectSubmit.textContent = "创建工程";
    if (els.projectDraft) els.projectDraft.checked = false;
    if (els.projectColor) els.projectColor.value = "#00bfa6";
  }

  function persist() {
    storage.save("calendar_tasks", state.tasks);
    storage.save("calendar_projects", state.projects);
  }

  function initTheme() {
    let saved = storage.load("calendar_theme", "black");
    if (!THEMES.includes(saved)) saved = "black";
    applyTheme(saved);
    if (els.themeSelect) {
      els.themeSelect.value = saved;
      els.themeSelect.addEventListener("change", () => {
        const next = THEMES.includes(els.themeSelect.value) ? els.themeSelect.value : "black";
        applyTheme(next);
        storage.save("calendar_theme", next);
      });
    }
  }

  function applyTheme(name) {
    document.body.dataset.theme = name;
  }

  function applyRatio(percent) {
    const left = clamp(percent, 55, 85);
    const right = Math.max(5, 100 - left);
    document.documentElement.style.setProperty("--dual-left", `${left}%`);
    document.documentElement.style.setProperty("--dual-right", `${right}%`);
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  function getProjectName(projectId) {
    return state.projects.find((p) => p.id === projectId)?.name || "";
  }

  function getProjectColor(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (project?.color) return project.color;
    const firstTask = state.tasks.find((t) => t.projectId === projectId && t.color);
    if (firstTask) return firstTask.color;
    return "#00bfa6";
  }

  function applyParkinson(enable) {
    state.tasks.forEach((t) => {
      if (enable) {
        if (!t.origEnd || t.end === t.origEnd) compressTask(t, true);
      } else if (t.origEnd) {
        t.end = t.origEnd;
        delete t.origEnd;
      }
    });
    persist();
  }

  function compressTask(task, resetOrig = false) {
    if (!task) return;
    if (resetOrig || !task.origEnd) task.origEnd = task.end;
    const startDate = parseDate(task.start);
    const endBase = parseDate(task.origEnd || task.end);
    const dur = (endBase - startDate) / (1000 * 60 * 60 * 24) + 1;
    if (dur <= 1) {
      task.end = toDateStrLocal(endBase);
      return;
    }
    const half = Math.max(1, Math.ceil(dur / 2));
    const newEnd = new Date(startDate);
    newEnd.setDate(newEnd.getDate() + (half - 1));
    task.end = toDateStrLocal(newEnd);
  }
}
