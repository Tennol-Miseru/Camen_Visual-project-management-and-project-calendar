(function (ns) {
  "use strict";

  ns.actions = ns.actions || {};

  const SHRED_DURATION = 720;

  function playSfx(ctx, type) {
    if (ctx.state.muted) return;
    const audio = ctx.sfx?.[type];
    if (!audio) return;
    try {
      // clone to avoid play lock when rapidly triggered
      const inst = audio.cloneNode();
      inst.muted = false;
      inst.currentTime = 0;
      inst.play().catch(() => {});
    } catch (err) {
      // ignore playback failures
    }
  }

  function persist(ctx) {
    ctx.storage.save("calendar_tasks", ctx.state.tasks);
    ctx.storage.save("calendar_projects", ctx.state.projects);
  }

  function showToast(ctx, message) {
    if (!ctx.els.toast) return;
    ctx.els.toast.textContent = message;
    ctx.els.toast.classList.add("show");
    if (ctx.runtime.toastTimer) clearTimeout(ctx.runtime.toastTimer);
    ctx.runtime.toastTimer = setTimeout(() => ctx.els.toast.classList.remove("show"), 1800);
  }

  function applyTheme(ctx, name) {
    document.body.dataset.theme = name;
  }

  function shredRelatedTasks(ctx, projectId) {
    const selectors = [
      `.task-chip[data-project-id="${projectId}"]`,
      `.task-bar[data-project-id="${projectId}"]`
    ];
    const nodes = document.querySelectorAll(selectors.join(","));
    nodes.forEach((node, idx) => {
      node.classList.add("shred-out");
      node.style.setProperty("--shred-delay", `${idx * 18}ms`);
    });
    return nodes.length;
  }

  function archiveProject(ctx, projectId, options = {}) {
    const project = ctx.state.projects.find((p) => p.id === projectId);
    if (!project || project.archived) return false;
    project.archived = true;
    project.archivedAt = new Date().toISOString();
    if (ctx.state.filterProjectId === projectId) ctx.state.filterProjectId = "";
    if (ctx.state.filterStepId && !project.steps.some((s) => s.id === ctx.state.filterStepId)) ctx.state.filterStepId = null;
    if (ctx.state.statsProjectId === projectId) ctx.state.statsProjectId = null;
    persist(ctx);
    const affected = shredRelatedTasks(ctx, projectId);
    showToast(ctx, options.toast || `${project.name} 已收纳至归档`);
    if (ctx.runtime.shredTimer) clearTimeout(ctx.runtime.shredTimer);
    if (affected > 0) {
      ctx.runtime.shredTimer = setTimeout(() => ns.render.renderAll(ctx), SHRED_DURATION);
    } else {
      ns.render.renderAll(ctx);
    }
    return true;
  }

  function autoArchiveIfComplete(ctx, project) {
    if (!project || project.archived || project.draft) return false;
    if (!project.steps.length) return false;
    const done = project.steps.every((s) => s.done);
    if (!done) return false;
    return archiveProject(ctx, project.id, { toast: `${project.name} 全部工序完成，已归档` });
  }

  function initTheme(ctx) {
    let saved = ctx.storage.load("calendar_theme", "black");
    if (!ctx.constants.THEMES.includes(saved)) saved = "black";
    applyTheme(ctx, saved);
    if (ctx.els.themeSelect) {
      ctx.els.themeSelect.value = saved;
      ctx.els.themeSelect.addEventListener("change", () => {
        const next = ctx.constants.THEMES.includes(ctx.els.themeSelect.value) ? ctx.els.themeSelect.value : "black";
        applyTheme(ctx, next);
        ctx.storage.save("calendar_theme", next);
      });
    }
    if (ctx.els.themeCycleBtn) {
      ctx.els.themeCycleBtn.addEventListener("click", () => {
        const current = document.body.dataset.theme || "black";
        const idx = ctx.constants.THEMES.indexOf(current);
        const next = ctx.constants.THEMES[(idx + 1) % ctx.constants.THEMES.length];
        applyTheme(ctx, next);
        ctx.storage.save("calendar_theme", next);
        if (ctx.els.themeSelect) ctx.els.themeSelect.value = next;
      });
    }
  }

  function applyRatio(ctx, percent) {
    const left = ns.core.clamp(percent, 55, 85);
    const right = Math.max(5, 100 - left);
    document.documentElement.style.setProperty("--dual-left", `${left}%`);
    document.documentElement.style.setProperty("--dual-right", `${right}%`);
  }

  function applyEditorMode(ctx, mode) {
    const nextMode = mode === "modal" ? "modal" : "split";
    ctx.state.editorMode = nextMode;
    ctx.storage.save("calendar_editor_mode", nextMode);
    if (ctx.els.editorModeToggle) ctx.els.editorModeToggle.textContent = `编辑方式: ${nextMode === "modal" ? "弹窗" : "分屏"}`;

    if (nextMode !== "modal") {
      if (ctx.els.editorOverlay) ctx.els.editorOverlay.hidden = true;
    }

    document.body.classList.toggle("editor-modal-mode", nextMode === "modal");
    ns.render.renderAll(ctx);
  }

  function getProjectName(ctx, projectId) {
    return ctx.state.projects.find((p) => p.id === projectId)?.name || "";
  }

  function getProjectColor(ctx, projectId) {
    const project = ctx.state.projects.find((p) => p.id === projectId);
    if (project?.color) return project.color;
    const firstTask = ctx.state.tasks.find((t) => t.projectId === projectId && t.color);
    if (firstTask) return firstTask.color;
    return "#00bfa6";
  }

  function applyParkinson(ctx, enable) {
    ctx.state.tasks.forEach((t) => {
      if (enable) {
        if (!t.origEnd || t.end === t.origEnd) ns.tasks.compressTask(ctx, t, true);
      } else if (t.origEnd) {
        t.end = t.origEnd;
        delete t.origEnd;
      }
    });
    persist(ctx);
  }

  function changeMonth(ctx, delta) {
    const d = new Date(ctx.state.viewDate);
    d.setMonth(d.getMonth() + delta);
    ctx.state.viewDate = d;
    ns.render.renderCalendar(ctx);
    ns.render.renderTimeline(ctx);
  }

  function populateProjectSelect(ctx) {
    ctx.els.projectSelect.innerHTML = `<option value="">（可选）</option>`;
    ctx.state.projects
      .filter((p) => !p.draft && !p.archived)
      .forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        ctx.els.projectSelect.appendChild(opt);
      });
  }

  function populateProjectFilter(ctx) {
    if (!ctx.els.projectFilter) return;
    const current = ctx.els.projectFilter.value;
    ctx.els.projectFilter.innerHTML = `<option value="">全部工程</option>`;
    ctx.state.projects
      .filter((p) => !p.draft && !p.archived)
      .forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        ctx.els.projectFilter.appendChild(opt);
      });
    if ([...ctx.els.projectFilter.options].some((o) => o.value === current)) ctx.els.projectFilter.value = current;
  }

  function populateStepSelect(ctx, projectId) {
    ctx.els.stepSelect.innerHTML = "";
    if (!projectId) {
      ctx.els.stepSelect.innerHTML = `<option value="">（先选工程）</option>`;
      return;
    }
    const project = ctx.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    ctx.els.stepSelect.innerHTML = `<option value="">（可选）</option>`;
    project.steps.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.title;
      ctx.els.stepSelect.appendChild(opt);
    });
  }

  function resetTaskForm(ctx) {
    ctx.runtime.editingTaskId = null;
    if (ctx.els.taskIdInput) ctx.els.taskIdInput.value = "";
    if (ctx.els.taskForm) ctx.els.taskForm.reset();
    if (ctx.els.noEnd) ctx.els.noEnd.checked = false;
    if (ctx.els.taskDone) ctx.els.taskDone.checked = false;
    if (ctx.els.useProjectColor) ctx.els.useProjectColor.checked = false;
    const submitBtn = ctx.els.taskForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "保存日期条";
    if (ctx.els.deleteTaskBtn) ctx.els.deleteTaskBtn.disabled = true;
  }

  function resetProjectDraft(ctx) {
    ctx.ui.projectIdInput.value = "";
    ctx.runtime.stepDraft = [];
    renderStepDraft(ctx);
    ctx.ui.projectFormLegend.textContent = "新增工程";
    if (ctx.ui.projectSubmit) ctx.ui.projectSubmit.textContent = "创建工程";
    if (ctx.els.projectDraft) ctx.els.projectDraft.checked = false;
    if (ctx.els.projectColor) ctx.els.projectColor.value = "#00bfa6";
  }

  function normalizeSteps(ctx, draft, existingSteps, projectId) {
    const clean = draft
      .map((s) => ({ ...s, title: (s.title || "").trim() }))
      .filter((s) => s.title.length > 0)
      .map((s, idx) => ({
        id: s.id || existingSteps[idx]?.id || `step-${ctx.uuid()}`,
        title: s.title,
        done: existingSteps[idx]?.done ?? s.done ?? false,
        order: idx + 1
      }));

    if (projectId) {
      const validIds = new Set(clean.map((s) => s.id));
      ctx.state.tasks.forEach((t) => {
        if (t.projectId === projectId && t.stepId && !validIds.has(t.stepId)) t.stepId = "";
      });
    }
    return clean;
  }

  function renderStepDraft(ctx) {
    ctx.els.stepList.innerHTML = "";
    if (ctx.runtime.stepDraft.length === 0) {
      const hint = document.createElement("div");
      hint.style.color = "var(--muted)";
      hint.textContent = "暂无步骤，点下面“+ 添加步骤”";
      ctx.els.stepList.appendChild(hint);
      return;
    }

    ctx.runtime.stepDraft.forEach((step, idx) => {
      const row = document.createElement("div");
      row.className = "step-row";
      row.draggable = false;
      row.dataset.idx = idx;

      const handle = document.createElement("div");
      handle.className = "drag-handle";
      handle.textContent = "≡";
      handle.draggable = true;
      handle.addEventListener("dragstart", (e) => ns.bindings.onStepDragStart(ctx, e, idx));
      handle.addEventListener("dragover", (e) => ns.bindings.onStepDragOver(ctx, e));
      handle.addEventListener("dragleave", (e) => ns.bindings.onStepDragLeave(ctx, e));
      handle.addEventListener("drop", (e) => ns.bindings.onStepDrop(ctx, e, idx));
      // Touch drag polyfill for step handles
      if (ns.touch && ns.touch.isTouchDevice()) {
        ns.touch.enableTouchDrag(handle, {
          onDragStart: function (e) { ns.bindings.onStepDragStart(ctx, e, idx); },
          onDragOver: function (e) {
            var row = e.currentTarget.closest && e.currentTarget.closest(".step-row");
            if (row) { e.currentTarget = row; ns.bindings.onStepDragOver(ctx, e); }
          },
          onDragLeave: function (e) {
            var row = e.currentTarget.closest && e.currentTarget.closest(".step-row");
            if (row) { e.currentTarget = row; ns.bindings.onStepDragLeave(ctx, e); }
          },
          onDrop: function (e) {
            var row = e.currentTarget.closest && e.currentTarget.closest(".step-row");
            if (row) {
              var targetIdx = Number(row.dataset.idx);
              e.currentTarget = row;
              ns.bindings.onStepDrop(ctx, e, targetIdx);
            }
          },
          onDragEnd: function () {}
        });
      }
      row.appendChild(handle);

      const input = document.createElement("input");
      input.value = step.title;
      input.placeholder = `步骤 ${idx + 1}`;
      input.addEventListener("input", (e) => {
        ctx.runtime.stepDraft[idx].title = e.target.value;
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn-ghost";
      remove.textContent = "删除";
      remove.addEventListener("click", () => {
        ctx.runtime.stepDraft.splice(idx, 1);
        renderStepDraft(ctx);
      });

      row.addEventListener("dragover", (e) => ns.bindings.onStepDragOver(ctx, e));
      row.addEventListener("dragleave", (e) => ns.bindings.onStepDragLeave(ctx, e));
      row.addEventListener("drop", (e) => ns.bindings.onStepDrop(ctx, e, idx));

      row.appendChild(input);
      row.appendChild(remove);
      ctx.els.stepList.appendChild(row);
    });
  }

  function startEditTask(ctx, task) {
    ctx.runtime.editingTaskId = task.id;
    if (ctx.state.editorMode === "modal" && ns.bindings?.openTaskEditorModal) {
      ns.bindings.openTaskEditorModal(ctx, task);
      return;
    }
    if (ctx.els.taskIdInput) ctx.els.taskIdInput.value = task.id;
    ctx.els.taskForm.title.value = task.title;
    ctx.els.taskForm.color.value = task.color;
    ctx.els.taskForm.start.value = task.start;
    ctx.els.taskForm.end.value = task.end;
    ctx.els.noEnd.checked = false;
    ctx.els.taskForm.note.value = task.note || "";
    if (ctx.els.taskDone) ctx.els.taskDone.checked = !!task.done;
    ctx.els.projectSelect.value = task.projectId || "";
    populateStepSelect(ctx, task.projectId || "");
    ctx.els.stepSelect.value = task.stepId || "";
    if (ctx.els.useProjectColor && task.projectId) {
      const projColor = getProjectColor(ctx, task.projectId);
      ctx.els.useProjectColor.checked = task.color === projColor;
    } else if (ctx.els.useProjectColor) {
      ctx.els.useProjectColor.checked = false;
    }
    if (ctx.ui.taskDetails) ctx.ui.taskDetails.open = true;
    const submitBtn = ctx.els.taskForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "更新日期条";
    if (ctx.els.deleteTaskBtn) ctx.els.deleteTaskBtn.disabled = false;
    document.querySelector('[data-target="calendar-view"]').click();
  }
  function startEditProject(ctx, project) {
    ctx.runtime.editingProjectId = project.id;
    if (ctx.state.editorMode === "modal" && ns.bindings?.openProjectEditorModal) {
      ns.bindings.openProjectEditorModal(ctx, project);
      return;
    }
    ctx.ui.projectIdInput.value = project.id;
    ctx.els.projectForm.name.value = project.name;
    ctx.els.projectForm.description.value = project.description || "";
    if (ctx.els.projectColor) ctx.els.projectColor.value = project.color || "#00bfa6";
    ctx.runtime.stepDraft = project.steps.map((s) => ({ ...s }));
    renderStepDraft(ctx);
    ctx.ui.projectFormLegend.textContent = "编辑工程";
    if (ctx.ui.projectSubmit) ctx.ui.projectSubmit.textContent = "更新工程";
    if (ctx.els.projectDraft) ctx.els.projectDraft.checked = !!project.draft;
    const formDetails = document.querySelector("#projects-view details");
    if (formDetails) formDetails.open = true;
    document.querySelector('[data-target="projects-view"]').click();
  }
  function deleteProject(ctx, projectId) {
    if (!confirm("删除工程会同时移除关联的日期条，确定吗？")) return;
    ctx.state.projects = ctx.state.projects.filter((p) => p.id !== projectId);
    ctx.state.tasks = ctx.state.tasks.filter((t) => t.projectId !== projectId);
    ctx.state.filterStepId = null;
    persist(ctx);
    populateProjectSelect(ctx);
    ns.render.renderAll(ctx);
  }

  function showProjectStats(ctx, projectId) {
    ctx.state.statsProjectId = projectId;
    ctx.els.statsOverlay.hidden = false;
    ns.render.renderStats(ctx);
  }

  ns.actions.persist = persist;
  ns.actions.showToast = showToast;
  ns.actions.applyTheme = applyTheme;
  ns.actions.initTheme = initTheme;
  ns.actions.applyRatio = applyRatio;
  ns.actions.applyEditorMode = applyEditorMode;
  ns.actions.getProjectName = getProjectName;
  ns.actions.getProjectColor = getProjectColor;
  ns.actions.applyParkinson = applyParkinson;
  ns.actions.changeMonth = changeMonth;
  ns.actions.populateProjectSelect = populateProjectSelect;
  ns.actions.populateProjectFilter = populateProjectFilter;
  ns.actions.populateStepSelect = populateStepSelect;
  ns.actions.resetTaskForm = resetTaskForm;
  ns.actions.resetProjectDraft = resetProjectDraft;
  ns.actions.normalizeSteps = normalizeSteps;
  ns.actions.renderStepDraft = renderStepDraft;
  ns.actions.startEditTask = startEditTask;
  ns.actions.startEditProject = startEditProject;
  ns.actions.deleteProject = deleteProject;
  ns.actions.showProjectStats = showProjectStats;
  ns.actions.archiveProject = archiveProject;
  ns.actions.autoArchiveIfComplete = autoArchiveIfComplete;
  ns.actions.playSfx = playSfx;
})(window.CamenCalendar = window.CamenCalendar || {});






