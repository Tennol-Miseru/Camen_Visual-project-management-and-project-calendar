(function (ns) {
  "use strict";

  ns.bindings = ns.bindings || {};

  function init(ctx) {
    bindTabs(ctx);
    bindNav(ctx);
    bindForms(ctx);
    bindFilters(ctx);
    bindRatio(ctx);
    bindDualView(ctx);
    bindTimelineZoom(ctx);
    bindNoEnd(ctx);
    bindFPD(ctx);
    bindStats(ctx);
    document.addEventListener("dragend", () => clearDragState(ctx));

    // Mobile adaptation
    if (ns.touch) {
      ctx.runtime.isMobile = ns.touch.isMobile();
      ns.touch.onMobileChange(function (e) {
        ctx.runtime.isMobile = e.matches;
        if (ctx.runtime.isMobile && ctx.els.dualToggle) {
          ctx.els.dualToggle.checked = false;
          ctx.els.dualToggle.dispatchEvent(new Event("change"));
        }
      });
      if (ctx.runtime.isMobile && ctx.els.dualToggle) {
        ctx.els.dualToggle.checked = false;
        ctx.els.dualToggle.dispatchEvent(new Event("change"));
      }
    }
    if (ctx.els.timelineGrid) {
      ctx.els.timelineGrid.addEventListener("dragover", (e) => onGridDragOver(ctx, e));
      ctx.els.timelineGrid.addEventListener("dragleave", () => onGridDragLeave(ctx));
      ctx.els.timelineGrid.addEventListener("drop", (e) => onGridDrop(ctx, e));
    }
    ctx.state.tasks.forEach((t) => ns.actions.applyInfiniteIfDone(ctx, t));
    ns.actions.resetTaskForm(ctx);
    ns.actions.initTheme(ctx);
    ns.actions.renderStepDraft(ctx);
    bindImportExport(ctx);
    ns.render.renderAll(ctx);
  }

  // tabs
  function bindTabs(ctx) {
    ctx.els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        ctx.els.tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.target;
        ctx.els.views.forEach((v) => v.classList.toggle("active", v.id === target));
      });
    });
  }

  function bindNav(ctx) {
    document.getElementById("prev-month").addEventListener("click", () => ns.actions.changeMonth(ctx, -1));
    document.getElementById("next-month").addEventListener("click", () => ns.actions.changeMonth(ctx, 1));
  }

  function bindForms(ctx) {
    // task submit
    ctx.els.taskForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(ctx.els.taskForm));
      if (!data.title.trim()) return;
      if (!data.start) return;
      if (ctx.els.useProjectColor && ctx.els.useProjectColor.checked && data.projectId) {
        data.color = ns.actions.getProjectColor(ctx, data.projectId);
        if (ctx.els.taskForm.color) ctx.els.taskForm.color.value = data.color;
      }
      if (ctx.els.noEnd.checked) {
        data.end = ns.core.monthEnd(data.start);
        ctx.els.endDate.value = data.end;
      }
      const start = ns.core.parseDate(data.start);
      const end = ns.core.parseDate(data.end);
      if (start > end) {
        alert("结束日期必须不早于开始日期");
        return;
      }
      if (ctx.runtime.editingTaskId) {
        const t = ctx.state.tasks.find((x) => x.id === ctx.runtime.editingTaskId);
        if (t) {
          const newDone = ctx.els.taskDone?.checked || false;
          Object.assign(t, {
            title: data.title.trim(),
            start: data.start,
            end: data.end,
            color: data.color || "#00bfa6",
            projectId: data.projectId || "",
            stepId: data.stepId || "",
            note: data.note || "",
            done: newDone,
            noEnd: ctx.els.noEnd?.checked || false
          });
          // 同步：将日期条完成状态同步到所绑定的步骤
          if (t.stepId && t.projectId) {
            const proj = ctx.state.projects.find((p) => p.id === t.projectId);
            const step = proj?.steps.find((s) => s.id === t.stepId);
            if (step) step.done = newDone;
          }
        }
        if (ctx.state.fpdEnabled && t) ns.tasks.compressTask(ctx, t, true);
        ns.actions.applyInfiniteIfDone(ctx, t);
      } else {
        const newDoneVal = ctx.els.taskDone?.checked || false;
        const newTask = {
          id: ctx.uuid(),
          title: data.title.trim(),
          start: data.start,
          end: data.end,
          color: data.color || "#00bfa6",
          projectId: data.projectId || "",
          stepId: data.stepId || "",
          note: data.note || "",
          order: ctx.state.tasks.length,
          done: newDoneVal,
          noEnd: ctx.els.noEnd?.checked || false
        };
        ctx.state.tasks.push(newTask);
        // 同步：将日期条完成状态同步到所绑定的步骤
        if (newTask.stepId && newTask.projectId) {
          const proj = ctx.state.projects.find((p) => p.id === newTask.projectId);
          const step = proj?.steps.find((s) => s.id === newTask.stepId);
          if (step) step.done = newDoneVal;
        }
        if (ctx.state.fpdEnabled) ns.tasks.compressTask(ctx, newTask, true);
        ns.actions.applyInfiniteIfDone(ctx, newTask);
      }
      ns.actions.persist(ctx);
      ns.actions.resetTaskForm(ctx);
      ns.render.renderAll(ctx);
      ns.actions.showToast(ctx, "保存成功");
    });

    // project submit
    ctx.els.projectForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(ctx.els.projectForm));
      const isDraft = !!ctx.els.projectDraft?.checked;
      const existing = ctx.state.projects.find((p) => p.id === data.projectId);
      const steps = ns.actions.normalizeSteps(ctx, ctx.runtime.stepDraft, existing?.steps || [], existing?.id || "");
      if (existing) {
        Object.assign(existing, {
          name: data.name.trim(),
          description: data.description || "",
          steps,
          color: data.projectColor || existing.color || "#00bfa6",
          draft: isDraft
        });
        if (ctx.state.filterStepId && !steps.some((s) => s.id === ctx.state.filterStepId)) ctx.state.filterStepId = null;
      } else {
        ctx.state.projects.push({
          id: `proj-${ctx.uuid()}`,
          name: data.name.trim(),
          description: data.description || "",
          steps,
          color: data.projectColor || "#00bfa6",
          draft: isDraft
        });
      }
      ns.actions.persist(ctx);
      ctx.ui.projectFormLegend.textContent = "新增工程";
      ns.actions.resetProjectDraft(ctx);
      ns.render.renderAll(ctx);
      ns.actions.showToast(ctx, "保存成功");
    });

    ctx.els.projectSelect.addEventListener("change", () => ns.actions.populateStepSelect(ctx, ctx.els.projectSelect.value));
    ctx.els.projectSelect.addEventListener("change", () => {
      if (ctx.els.useProjectColor && ctx.els.useProjectColor.checked && ctx.els.projectSelect.value) {
        const c = ns.actions.getProjectColor(ctx, ctx.els.projectSelect.value);
        if (ctx.els.taskForm.color) ctx.els.taskForm.color.value = c;
      }
    });
    ctx.els.addStepBtn.addEventListener("click", () => {
      ctx.runtime.stepDraft.push({ id: `step-${ctx.uuid()}`, title: `步骤 ${ctx.runtime.stepDraft.length + 1}`, done: false });
      ns.actions.renderStepDraft(ctx);
    });

    if (ctx.els.taskNewBtn)
      ctx.els.taskNewBtn.addEventListener("click", () => {
        ns.actions.resetTaskForm(ctx);
        if (ctx.ui.taskDetails) ctx.ui.taskDetails.open = true;
      });
    if (ctx.els.projectNewBtn)
      ctx.els.projectNewBtn.addEventListener("click", () => {
        ns.actions.resetProjectDraft(ctx);
        const formDetails = document.querySelector("#projects-view details");
        if (formDetails) formDetails.open = true;
      });

    if (ctx.els.deleteTaskBtn) {
      ctx.els.deleteTaskBtn.addEventListener("click", () => {
        if (!ctx.runtime.editingTaskId) {
          alert("请先选择要删除的日期条");
          return;
        }
        ctx.state.tasks = ctx.state.tasks.filter((t) => t.id !== ctx.runtime.editingTaskId);
        ns.actions.persist(ctx);
        ns.actions.resetTaskForm(ctx);
        ns.render.renderAll(ctx);
      });
    }
  }

  function bindFilters(ctx) {
    if (ctx.els.projectFilter) {
      ctx.els.projectFilter.addEventListener("change", () => {
        ctx.state.filterProjectId = ctx.els.projectFilter.value;
        ns.render.renderAll(ctx);
      });
    }
    if (ctx.els.filterClear) {
      ctx.els.filterClear.addEventListener("click", () => {
        ctx.state.filterProjectId = "";
        ctx.state.filterStepId = null;
        if (ctx.els.projectFilter) ctx.els.projectFilter.value = "";
        ns.render.renderAll(ctx);
      });
    }
  }

  function bindDualView(ctx) {
    if (!ctx.els.dualToggle) return;
    const apply = () => {
      if (ctx.runtime.isMobile) {
        ctx.els.dualToggle.checked = false;
      }
      const on = ctx.els.dualToggle.checked;
      document.body.classList.toggle("dual-view", on);
      if (ctx.els.ratioPill) ctx.els.ratioPill.hidden = !on;
    };
    ctx.els.dualToggle.addEventListener("change", apply);
    apply();
  }

  function bindRatio(ctx) {
    if (!ctx.els.ratioRange) return;
    let saved = ctx.storage.load("calendar_ratio", ctx.constants.RATIO_DEFAULT);
    if (typeof saved !== "number" || Number.isNaN(saved)) saved = ctx.constants.RATIO_DEFAULT;
    saved = ns.core.clamp(saved, 55, 85);
    ctx.els.ratioRange.value = saved;
    ns.actions.applyRatio(ctx, saved);
    ctx.els.ratioRange.addEventListener("input", () => {
      const val = ns.core.clamp(Number(ctx.els.ratioRange.value), 55, 85);
      ns.actions.applyRatio(ctx, val);
      ctx.storage.save("calendar_ratio", val);
    });
  }

  function bindTimelineZoom(ctx) {
    if (!ctx.els.timelineZoom) return;
    let z = Number(ctx.state.timelineZoom) || 1;
    z = ns.core.clamp(z, ctx.constants.ZOOM_MIN, ctx.constants.ZOOM_MAX);
    ctx.els.timelineZoom.value = z;
    ctx.els.timelineZoom.addEventListener("input", () => {
      const val = ns.core.clamp(Number(ctx.els.timelineZoom.value), ctx.constants.ZOOM_MIN, ctx.constants.ZOOM_MAX);
      ctx.state.timelineZoom = val;
      ctx.storage.save("calendar_timeline_zoom", val);
      ns.render.renderTimeline(ctx);
    });
  }

  function bindFPD(ctx) {
    if (!ctx.els.fpdToggle) return;
    ctx.els.fpdToggle.checked = Boolean(ctx.state.fpdEnabled);
    const apply = () => {
      ctx.state.fpdEnabled = ctx.els.fpdToggle.checked;
      ctx.storage.save("calendar_fpd", ctx.state.fpdEnabled);
      ns.actions.applyParkinson(ctx, ctx.state.fpdEnabled);
      ns.render.renderAll(ctx);
      if (ctx.state.fpdEnabled) ns.actions.showToast(ctx, "已缩减日期条时长为计划的一半，取消勾选防帕金森按钮可复原");
      else ns.actions.showToast(ctx, "已还原日期条原始时长");
    };
    ctx.els.fpdToggle.addEventListener("change", apply);
    if (ctx.state.fpdEnabled) ns.actions.applyParkinson(ctx, true);
  }

  function bindNoEnd(ctx) {
    if (!ctx.els.noEnd || !ctx.els.startDate || !ctx.els.endDate) return;
    const sync = () => {
      if (ctx.els.noEnd.checked && ctx.els.startDate.value) {
        ctx.els.endDate.value = ns.core.monthEnd(ctx.els.startDate.value);
      }
    };
    ctx.els.noEnd.addEventListener("change", sync);
    ctx.els.startDate.addEventListener("change", sync);
  }

  function bindImportExport(ctx) {
    if (ctx.els.exportBtn) {
      ctx.els.exportBtn.addEventListener("click", () => {
        const payload = {
          projects: ctx.state.projects,
          tasks: ctx.state.tasks,
          theme: document.body.dataset.theme || "black",
          fpdEnabled: Boolean(ctx.state.fpdEnabled),
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

    if (ctx.els.importBtn && ctx.els.importFile) {
      ctx.els.importBtn.addEventListener("click", () => ctx.els.importFile.click());
      ctx.els.importFile.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          const projects = Array.isArray(data.projects) ? data.projects : [];
          const tasks = Array.isArray(data.tasks) ? data.tasks : [];
          if (projects.length === 0 && tasks.length === 0) throw new Error("文件中没有可导入的数据");
          const merge = !!ctx.els.importMerge?.checked;
          if (merge) {
            const projMap = new Map();
            ctx.state.projects.forEach((p) => projMap.set(p.id, p));
            projects.forEach((p) => projMap.set(p.id, p));
            ctx.state.projects = [...projMap.values()];
            const taskMap = new Map();
            ctx.state.tasks.forEach((t) => taskMap.set(t.id, t));
            tasks.forEach((t) => taskMap.set(t.id, t));
            ctx.state.tasks = [...taskMap.values()];
          } else {
            ctx.state.projects = projects;
            ctx.state.tasks = tasks;
          }
          const theme = ctx.constants.THEMES.includes(data.theme) ? data.theme : "black";
          ns.actions.applyTheme(ctx, theme);
          ctx.storage.save("calendar_theme", theme);
          if (typeof data.fpdEnabled === "boolean") {
            ctx.state.fpdEnabled = data.fpdEnabled;
            if (ctx.els.fpdToggle) ctx.els.fpdToggle.checked = data.fpdEnabled;
            ns.actions.applyParkinson(ctx, data.fpdEnabled);
          }
          ns.actions.persist(ctx);
          ns.actions.populateProjectSelect(ctx);
          ns.render.renderAll(ctx);
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

  // DnD & reorder helpers
  function clearDragState(ctx) {
    document.querySelectorAll(".timeline-row.preview").forEach((r) => r.classList.remove("preview"));
    document.querySelectorAll(".task-bar.dragging").forEach((b) => b.classList.remove("dragging"));
    document.querySelectorAll(".task-chip.dragging").forEach((c) => c.classList.remove("dragging"));
    document.querySelectorAll(".task-chip.preview").forEach((c) => c.classList.remove("preview"));
    if (ctx.els.timelineGrid) ctx.els.timelineGrid.classList.remove("preview-grid");
    ctx.runtime.draggingTaskId = null;
  }

  function onChipDragStart(ctx, e) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", e.currentTarget.dataset.taskId);
    e.currentTarget.classList.add("dragging");
  }
  function onChipDragOver(ctx, e) {
    e.preventDefault();
    const chip = e.currentTarget;
    chip.classList.add("preview");
  }
  function onChipDragLeave(ctx, e) {
    e.currentTarget.classList.remove("preview");
  }
  function onChipDrop(ctx, e) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain");
    const toId = e.currentTarget.dataset.taskId;
    if (!fromId || !toId || fromId === toId) return;
    const list = ns.tasks.visibleTasks(ctx).filter(ns.tasks.isValidTask);
    const fromIdx = list.findIndex((t) => t.id === fromId);
    const toIdx = list.findIndex((t) => t.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    list.splice(toIdx, 0, list.splice(fromIdx, 1)[0]);
    list.forEach((t, i) => {
      const real = ctx.state.tasks.find((x) => x.id === t.id);
      if (real) real.order = i;
    });
    clearDragState(ctx);
    ns.actions.persist(ctx);
    ns.render.renderAll(ctx);
  }

  function onGridDragOver(ctx, e) {
    if (!ctx.runtime.draggingTaskId) return;
    e.preventDefault();
    if (ctx.els.timelineGrid) ctx.els.timelineGrid.classList.add("preview-grid");
  }

  function onGridDragLeave(ctx) {
    if (ctx.els.timelineGrid) ctx.els.timelineGrid.classList.remove("preview-grid");
  }

  function onGridDrop(ctx, e) {
    if (!ctx.runtime.draggingTaskId) return;
    e.preventDefault();
    const list = ns.tasks.visibleTasks(ctx).filter(ns.tasks.isValidTask);
    const fromIdx = list.findIndex((t) => t.id === ctx.runtime.draggingTaskId);
    if (fromIdx === -1) return;
    const lanes = ns.tasks.packTasks(ctx, list);
    const rect = ctx.els.timelineGrid.getBoundingClientRect();
    const rowHeight = Math.max(40, rect.height / Math.max(1, lanes.length || 1));
    let targetRow = Math.floor((e.clientY - rect.top) / rowHeight);
    targetRow = ns.core.clamp(targetRow, 0, lanes.length);

    // 计算插入索引：在目标行的首个元素之前；若是新行（末尾），则放列表尾
    let insertIdx = 0;
    for (let i = 0; i < targetRow && i < lanes.length; i++) insertIdx += lanes[i].length;
    if (targetRow >= lanes.length) insertIdx = list.length;

    const [item] = list.splice(fromIdx, 1);
    list.splice(insertIdx > fromIdx ? insertIdx - 1 : insertIdx, 0, item);
    list.forEach((t, i) => {
      const real = ctx.state.tasks.find((x) => x.id === t.id);
      if (real) real.order = i;
    });
    clearDragState(ctx);
    ns.actions.persist(ctx);
    ns.render.renderAll(ctx);
  }

  // Step draft DnD
  function onStepDragStart(ctx, e, idx) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", idx.toString());
    e.currentTarget.classList.add("dragging");
  }
  function onStepDragOver(ctx, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    e.currentTarget.classList.add("dragging");
  }
  function onStepDragLeave(ctx, e) {
    e.currentTarget.classList.remove("dragging");
  }
  function onStepDrop(ctx, e, targetIdx) {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isNaN(from)) return;
    const item = ctx.runtime.stepDraft.splice(from, 1)[0];
    ctx.runtime.stepDraft.splice(targetIdx, 0, item);
    ns.actions.renderStepDraft(ctx);
  }

  // Timeline reorder DnD
  function onTaskDragStart(ctx, e) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", e.currentTarget.dataset.taskId);
    e.currentTarget.classList.add("dragging");
    ctx.runtime.draggingTaskId = e.currentTarget.dataset.taskId;
  }
  function onTaskDragOver(ctx, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const row = e.currentTarget.closest(".timeline-row");
    if (row) row.classList.add("preview");
  }
  function onTaskDragLeave(ctx, e) {
    const row = e.currentTarget.closest(".timeline-row");
    if (row) row.classList.remove("preview");
  }
  function onTaskDrop(ctx, e) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain") || ctx.runtime.draggingTaskId;
    const toId = e.currentTarget.dataset.taskId;
    if (!fromId || !toId || fromId === toId) return;
    const list = ns.tasks.visibleTasks(ctx).filter(ns.tasks.isValidTask);
    const fromIdx = list.findIndex((t) => t.id === fromId);
    const toIdx = list.findIndex((t) => t.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    list.splice(toIdx, 0, list.splice(fromIdx, 1)[0]);
    list.forEach((t, i) => {
      const real = ctx.state.tasks.find((x) => x.id === t.id);
      if (real) real.order = i;
    });
    clearDragState(ctx);
    ns.actions.persist(ctx);
    ns.render.renderAll(ctx);
  }

  function bindStats(ctx) {
    ctx.els.statsClose.addEventListener("click", () => {
      ctx.els.statsOverlay.hidden = true;
    });
    ctx.els.statsOverviewBtn.addEventListener("click", () => {
      ctx.state.statsProjectId = null;
      ctx.els.statsOverlay.hidden = false;
      ns.render.renderStats(ctx);
    });
  }

  ns.bindings.init = init;
  ns.bindings.clearDragState = clearDragState;
  ns.bindings.onChipDragStart = onChipDragStart;
  ns.bindings.onChipDragOver = onChipDragOver;
  ns.bindings.onChipDragLeave = onChipDragLeave;
  ns.bindings.onChipDrop = onChipDrop;
  ns.bindings.onGridDragOver = onGridDragOver;
  ns.bindings.onGridDragLeave = onGridDragLeave;
  ns.bindings.onGridDrop = onGridDrop;
  ns.bindings.onStepDragStart = onStepDragStart;
  ns.bindings.onStepDragOver = onStepDragOver;
  ns.bindings.onStepDragLeave = onStepDragLeave;
  ns.bindings.onStepDrop = onStepDrop;
  ns.bindings.onTaskDragStart = onTaskDragStart;
  ns.bindings.onTaskDragOver = onTaskDragOver;
  ns.bindings.onTaskDragLeave = onTaskDragLeave;
  ns.bindings.onTaskDrop = onTaskDrop;
})(window.CamenCalendar = window.CamenCalendar || {});
