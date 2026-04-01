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

  function openReviewModal(ctx) {
    ctx.runtime.reviewMonth = ctx.runtime.reviewMonth || new Date();
    ctx.els.reviewOverlay.hidden = false;
    renderReviewMonth(ctx);
  }

  function closeReviewModal(ctx) {
    ctx.els.reviewOverlay.hidden = true;
  }

  function changeReviewMonth(ctx, delta) {
    const d = ctx.runtime.reviewMonth;
    d.setMonth(d.getMonth() + delta);
    renderReviewMonth(ctx);
  }

  function renderReviewMonth(ctx) {
    const d = ctx.runtime.reviewMonth;
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthStr = `${year}年${month + 1}月`;

    ctx.els.reviewMonthLabel.textContent = monthStr;

    // 渲染日历
    renderReviewCalendar(ctx);

    // 计算该月有多少天
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    // 当月第一天和最后一天的Date对象
    const monthStartObj = new Date(year, month, 1);
    const monthEndObj = new Date(year, month + 1, 0);
    const monthStartTs = monthStartObj.getTime();
    const monthEndTs = monthEndObj.getTime();

    // 找出该月有任务的工程（包括已归档的）
    const projectsInMonth = new Map();

    ctx.state.projects.forEach((proj) => {
      // 检查该工程在这个月是否有任务
      const projTasks = ctx.state.tasks.filter((t) => {
        if (t.projectId !== proj.id) return false;
        // 任务在该月有重叠
        return t.start <= endDate && t.end >= startDate;
      });

      if (projTasks.length > 0) {
        // 获取该工程的所有任务（用于计算完整的时间分布）
        const allProjectTasks = ctx.state.tasks.filter((t) => t.projectId === proj.id);

        // 计算三个时段的统计（基于项目的所有任务）
        let beforeMonthDays = 0;   // 当月以前（天数）
        let currentMonthDays = 0; // 当月（天数）
        let afterMonthDays = 0;   // 当月以后（天数）

        let beforeCompleted = 0;
        let currentCompleted = 0;

        // 不加权：按任务数量计算
        let beforeMonthCount = 0;   // 当月以前（任务数）
        let currentMonthCount = 0; // 当月（任务数）
        let afterMonthCount = 0;   // 当月以后（任务数）

        allProjectTasks.forEach((t) => {
          // 使用原始任务日期进行分段计算
          const taskStartObj = ns.core.parseDate(t.start);
          const taskEndObj = ns.core.parseDate(t.end);
          const taskStartTs = taskStartObj.getTime();
          const taskEndTs = taskEndObj.getTime();

          // 检查任务是否完成（优先使用步骤的完成状态）
          const isDone = ns.tasks.isTaskDone(ctx, t);

          // 分配到三个时段
          if (taskEndTs < monthStartTs) {
            // 整个任务都在当月之前
            const days = ns.tasks.calcTaskDays(ctx, t);
            beforeMonthDays += days;
            beforeMonthCount += 1;
            if (isDone) beforeCompleted += days;
          } else if (taskStartTs > monthEndTs) {
            // 整个任务都在当月之后
            const days = ns.tasks.calcTaskDays(ctx, t);
            afterMonthDays += days;
            afterMonthCount += 1;
          } else {
            // 任务跨越当月，需要分段计算
            // 当月之前（如果有）
            if (taskStartTs < monthStartTs) {
              const beforeDays = Math.floor((monthStartTs - taskStartTs) / (1000 * 60 * 60 * 24));
              beforeMonthDays += beforeDays;
              beforeMonthCount += 1;
              if (isDone) beforeCompleted += beforeDays;
            }
            // 当月
            const currentStart = Math.max(taskStartTs, monthStartTs);
            const currentEnd = Math.min(taskEndTs, monthEndTs);
            const currentDays = Math.floor((currentEnd - currentStart) / (1000 * 60 * 60 * 24)) + 1;
            currentMonthDays += currentDays;
            currentMonthCount += 1;
            // 当月的完成状态取决于任务整体是否完成
            if (isDone) currentCompleted += currentDays;
            // 当月之后（如果有）
            if (taskEndTs > monthEndTs) {
              const afterDays = Math.floor((taskEndTs - monthEndTs) / (1000 * 60 * 60 * 24));
              afterMonthDays += afterDays;
            }
          }
        });

        const totalDays = beforeMonthDays + currentMonthDays + afterMonthDays;
        const totalCount = beforeMonthCount + currentMonthCount + afterMonthCount;

        // 不加权进度（按任务数量）
        const unweightedBeforePct = totalCount > 0 ? Math.round((beforeMonthCount / totalCount) * 100) : 0;
        const unweightedCurrentPct = totalCount > 0 ? Math.round((currentMonthCount / totalCount) * 100) : 0;
        const unweightedAfterPct = totalCount > 0 ? Math.round((afterMonthCount / totalCount) * 100) : 0;

        // 加权进度（按天数）
        const weightedBeforePct = totalDays > 0 ? Math.round((beforeMonthDays / totalDays) * 100) : 0;
        const weightedCurrentPct = totalDays > 0 ? Math.round((currentMonthDays / totalDays) * 100) : 0;
        const weightedAfterPct = totalDays > 0 ? Math.round((afterMonthDays / totalDays) * 100) : 0;

        const currentProgress = currentMonthDays > 0 ? Math.round((currentCompleted / currentMonthDays) * 100) : 0;

        // 计算当月相对于整个项目的进度（不包含加权）
        const projectTotalDays = ns.tasks.calcProjectTotalDays(ctx, proj.id);
        const currentMonthProgress = projectTotalDays > 0 ? Math.round((currentMonthDays / projectTotalDays) * 100) : 0;

        // 计算当月加权进度
        const projectWeightedProgress = ns.tasks.calcProjectWeightedProgress(ctx, proj);

        projectsInMonth.set(proj.id, {
          project: proj,
          taskCount: projTasks.length,
          beforeMonthDays,
          currentMonthDays,
          afterMonthDays,
          currentCompleted,
          currentProgress,
          currentMonthProgress,
          projectWeightedProgress,
          totalDays,
          totalCount,
          unweightedBeforePct,
          unweightedCurrentPct,
          unweightedAfterPct,
          weightedBeforePct,
          weightedCurrentPct,
          weightedAfterPct
        });
      }
    });

    // 渲染
    if (projectsInMonth.size === 0) {
      ctx.els.reviewContent.innerHTML = `<div class="review-empty">${monthStr} 没有相关工程记录</div>`;
      return;
    }

    const grid = document.createElement("div");
    grid.className = "review-stats-grid";

    projectsInMonth.forEach((data) => {
      const proj = data.project;
      const card = document.createElement("div");
      card.className = "review-stat-card";

      const color = proj.color || "#00bfa6";

      // 统一使用工程颜色，只是通过透明度区分
      const beforeColor = "rgba(167, 175, 190, 0.4)";
      const currentColor = color;
      const afterColor = "rgba(90, 200, 250, 0.5)";

      card.innerHTML = `
        <div class="project-name">
          <span class="dot" style="background:${color}"></span>
          ${proj.name}
        </div>
        <div class="stat-row">
          <span>日期条</span>
          <span class="stat-value">${data.taskCount}个</span>
        </div>
        <div class="stat-row month-stats">
          <span>当月天数</span>
          <span class="stat-value">${data.currentMonthDays}天</span>
        </div>
        <div class="stat-row">
          <span>当月完成</span>
          <span class="stat-value">${data.currentCompleted}/${data.currentMonthDays}天</span>
        </div>
        <div class="progress-bar">
          <div class="progress-segment before" style="width:${data.unweightedBeforePct}%;background:${beforeColor}"></div>
          <div class="progress-segment current" style="width:${data.unweightedCurrentPct}%;background:${currentColor}"></div>
          <div class="progress-segment after" style="width:${data.unweightedAfterPct}%;background:${afterColor}"></div>
        </div>
        <div class="progress-bar-label">按日期条数（不加权）</div>
        <div class="progress-bar weighted">
          <div class="progress-segment before" style="width:${data.weightedBeforePct}%;background:${beforeColor}"></div>
          <div class="progress-segment current" style="width:${data.weightedCurrentPct}%;background:${currentColor}"></div>
          <div class="progress-segment after" style="width:${data.weightedAfterPct}%;background:${afterColor}"></div>
        </div>
        <div class="progress-bar-label">按天数（加权）</div>
        <div class="progress-legend">
          <span>往月</span>
          <span>本月</span>
          <span>未来</span>
        </div>
        <div class="progress-label">
          <span class="label-row">当月 ${data.currentMonthProgress}%</span>
          <span class="label-row">(${data.currentProgress}%完成率)</span>
          <span class="label-row weighted">加权 ${data.projectWeightedProgress}%</span>
        </div>
      `;
      grid.appendChild(card);
    });

    ctx.els.reviewContent.innerHTML = "";
    ctx.els.reviewContent.appendChild(grid);
  }

  function renderReviewCalendar(ctx) {
    const d = ctx.runtime.reviewMonth;
    const year = d.getFullYear();
    const month = d.getMonth();

    // 当月天数
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    // 当月第一天是周几（0=周日）
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    // 获取所有任务（无论是否完成）
    const monthTasks = ctx.state.tasks.filter((t) => {
      return t.start <= endDate && t.end >= startDate;
    });

    // 按日期分组任务
    const tasksByDate = {};
    monthTasks.forEach((t) => {
      const proj = ctx.state.projects.find((p) => p.id === t.projectId);
      const color = proj?.color || t.color || "#00bfa6";
      for (let d = new Date(ns.core.parseDate(t.start)); d <= ns.core.parseDate(t.end); d.setDate(d.getDate() + 1)) {
        const dateStr = ns.core.toDateStrLocal(d);
        if (!tasksByDate[dateStr]) tasksByDate[dateStr] = [];
        tasksByDate[dateStr].push({ title: t.title, color });
      }
    });

    // 构建日历HTML
    const container = ctx.els.reviewCalendar;
    container.innerHTML = "";

    // 标题
    const header = document.createElement("div");
    header.className = "review-calendar-header";
    const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
    weekDays.forEach((day) => {
      const span = document.createElement("span");
      span.textContent = day;
      span.className = "header";
      header.appendChild(span);
    });
    container.appendChild(header);

    // 日历网格
    const grid = document.createElement("div");
    grid.className = "review-calendar-grid";

    // 填充空白
    for (let i = 0; i < firstDayOfMonth; i++) {
      const empty = document.createElement("div");
      empty.className = "review-calendar-day";
      grid.appendChild(empty);
    }

    // 今天的日期
    const today = ns.core.toDateStrLocal(new Date());

    // 填充日期
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEl = document.createElement("div");
      dayEl.className = "review-calendar-day current-month";
      if (dateStr === today) dayEl.classList.add("today");

      const dayNum = document.createElement("span");
      dayNum.className = "day-num";
      dayNum.textContent = day;
      dayEl.appendChild(dayNum);

      // 显示任务点
      if (tasksByDate[dateStr] && tasksByDate[dateStr].length > 0) {
        const tasksDiv = document.createElement("div");
        tasksDiv.className = "day-tasks";
        tasksByDate[dateStr].forEach((task) => {
          const dot = document.createElement("span");
          dot.className = "day-task-dot";
          dot.style.background = task.color;
          dot.title = task.title;
          tasksDiv.appendChild(dot);
        });
        dayEl.appendChild(tasksDiv);
      }

      grid.appendChild(dayEl);
    }

    container.appendChild(grid);
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
  ns.actions.openReviewModal = openReviewModal;
  ns.actions.closeReviewModal = closeReviewModal;
  ns.actions.changeReviewMonth = changeReviewMonth;
  ns.actions.renderReviewMonth = renderReviewMonth;
  ns.actions.playSfx = playSfx;
})(window.CamenCalendar = window.CamenCalendar || {});






