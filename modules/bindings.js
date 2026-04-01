(function (ns) {
  "use strict";

  ns.bindings = ns.bindings || {};

  function init(ctx) {
    bindTabs(ctx);
    bindNav(ctx);
    bindForms(ctx);
    bindFilters(ctx);
    bindEditorMode(ctx);
    bindEditorLaunch(ctx);
    bindRatio(ctx);
    bindDualView(ctx);
    bindTimelineZoom(ctx);
    bindNoEnd(ctx);
    bindFPD(ctx);
    bindMute(ctx);
    bindStats(ctx);
    // Prime audio on first interaction to satisfy autoplay policies
    const primeAudio = () => {
      if (ctx.runtime.sfxPrimed) return;
      ctx.runtime.sfxPrimed = true;
      Object.values(ctx.sfx || {}).forEach((a) => {
        try {
          a.muted = false;
          a.currentTime = 0;
          const playPromise = a.play();
          if (playPromise?.then) playPromise.then(() => a.pause()).catch(() => {});
        } catch (_) {}
      });
      document.removeEventListener("pointerdown", primeAudio, true);
      document.removeEventListener("keydown", primeAudio, true);
    };
    document.addEventListener("pointerdown", primeAudio, true);
    document.addEventListener("keydown", primeAudio, true);
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
    ns.actions.resetTaskForm(ctx);
    ns.actions.initTheme(ctx);
    ns.actions.renderStepDraft(ctx);
    bindImportExport(ctx);
    let resizeRaf = null;
    window.addEventListener("resize", () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        ns.render.renderProjects(ctx);
        syncDualColumnHeights(ctx);
      });
    });
    if (ns.actions.applyEditorMode) ns.actions.applyEditorMode(ctx, ctx.state.editorMode);
    else ns.render.renderAll(ctx);
    // 默认使用弹窗模式
    ctx.state.editorMode = "modal";
    ctx.storage.save("calendar_editor_mode", "modal");
    if (ns.actions.applyEditorMode) ns.actions.applyEditorMode(ctx, "modal");
    syncDualColumnHeights(ctx);
  }

  function syncDualColumnHeights(ctx) {
    const calendarView = ctx.els.calendarView;
    const projectsView = ctx.els.projectsView;
    const projectsList = ctx.els.projectsList;
    const draftBox = ctx.els.draftBox;
    const archivedBox = ctx.els.archivedBox;
    const projectsPanel = projectsView?.querySelector('.panel');
    if (!calendarView || !projectsView || !projectsList || !projectsPanel) return;

    if (!document.body.classList.contains('dual-view') || ctx.runtime.isMobile) {
      projectsView.style.removeProperty('height');
      projectsPanel.style.removeProperty('height');
      projectsList.style.removeProperty('height');
      projectsList.style.removeProperty('max-height');
      return;
    }

    requestAnimationFrame(() => {
      const calendarHeight = Math.ceil(calendarView.getBoundingClientRect().height);
      if (!calendarHeight) return;
      const viewStyles = window.getComputedStyle(projectsView);
      const gap = parseFloat(viewStyles.rowGap || viewStyles.gap || '0') || 0;
      const draftHeight = draftBox ? Math.ceil(draftBox.getBoundingClientRect().height) : 0;
      const archivedHeight = archivedBox ? Math.ceil(archivedBox.getBoundingClientRect().height) : 0;
      const gapCount = (draftBox ? 1 : 0) + (archivedBox ? 1 : 0);
      const availablePanelHeight = Math.max(0, calendarHeight - draftHeight - archivedHeight - gap * gapCount);

      projectsView.style.height = calendarHeight + 'px';
      projectsPanel.style.height = availablePanelHeight + 'px';
      projectsList.style.height = 'auto';
      projectsList.style.maxHeight = 'none';
    });
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
      let archived = false;
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
            done: newDone
          });
          if (t.stepId && t.projectId) {
            const proj = ctx.state.projects.find((p) => p.id === t.projectId);
            const step = proj?.steps.find((s) => s.id === t.stepId);
            if (step) step.done = newDone;
            if (proj) archived = ns.actions.autoArchiveIfComplete(ctx, proj) || archived;
          }
        }
        if (ctx.state.fpdEnabled && t) ns.tasks.compressTask(ctx, t, true);
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
          done: newDoneVal
        };
        ctx.state.tasks.push(newTask);
        if (newTask.stepId && newTask.projectId) {
          const proj = ctx.state.projects.find((p) => p.id === newTask.projectId);
          const step = proj?.steps.find((s) => s.id === newTask.stepId);
          if (step) step.done = newDoneVal;
          if (proj) archived = ns.actions.autoArchiveIfComplete(ctx, proj) || archived;
        }
        if (ctx.state.fpdEnabled) ns.tasks.compressTask(ctx, newTask, true);
      }
      ns.actions.persist(ctx);
      ns.actions.resetTaskForm(ctx);
      if (!archived) ns.render.renderAll(ctx);
      if (!archived) ns.actions.showToast(ctx, "保存成功");
      ns.actions.playSfx(ctx, "save");
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
          draft: isDraft,
          archived: false,
          archivedAt: null
        });
      }
      ns.actions.persist(ctx);
      ctx.ui.projectFormLegend.textContent = "新增工程";
      ns.actions.resetProjectDraft(ctx);
      ns.render.renderAll(ctx);
      ns.actions.showToast(ctx, "保存成功");
      ns.actions.playSfx(ctx, "save");
    });

    ctx.els.projectSelect.addEventListener("change", () => ns.actions.populateStepSelect(ctx, ctx.els.projectSelect.value));
    ctx.els.projectSelect.addEventListener("change", () => {
      if (ctx.els.useProjectColor && ctx.els.useProjectColor.checked && ctx.els.projectSelect.value) {
        const c = ns.actions.getProjectColor(ctx, ctx.els.projectSelect.value);
        if (ctx.els.taskForm.color) ctx.els.taskForm.color.value = c;
      }
    });
    ctx.els.addStepBtn.addEventListener("click", () => {
      ctx.runtime.stepDraft.push({ id: `step-${ctx.uuid()}`, title: `新增步骤 ${ctx.runtime.stepDraft.length + 1}`, done: false });
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
        alert("请选择要删除的日期条");
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
      syncDualColumnHeights(ctx);
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
      if (ctx.state.fpdEnabled) ns.actions.showToast(ctx, "防帕金森开启：所有日期条时长减半");
      else ns.actions.showToast(ctx, "已恢复原始时长");
    };
    ctx.els.fpdToggle.addEventListener("change", apply);
    if (ctx.state.fpdEnabled) ns.actions.applyParkinson(ctx, true);
  }

  function bindMute(ctx) {
    if (!ctx.els.muteToggle) return;
    ctx.els.muteToggle.checked = Boolean(ctx.state.muted);
    const apply = () => {
      ctx.state.muted = ctx.els.muteToggle.checked;
      ctx.storage.save("calendar_muted", ctx.state.muted);
      ns.actions.showToast(ctx, ctx.state.muted ? "已静音" : "已开启音效");
    };
    ctx.els.muteToggle.addEventListener("change", apply);
  }

  function bindEditorMode(ctx) {
    if (!ctx.els.editorModeToggle) return;
    const LABEL_MODAL = "\u5f39\u7a97"; // 弹窗
    const LABEL_SPLIT = "\u5206\u5c4f"; // 分屏
    const setLabel = () => {
      ctx.els.editorModeToggle.textContent = `编辑方式: ${ctx.state.editorMode === "modal" ? LABEL_MODAL : LABEL_SPLIT}`;
      ctx.els.editorModeToggle.title = "切换编辑模式";
    };
    setLabel();
    ctx.els.editorModeToggle.addEventListener("click", () => {
      const nextMode = ctx.state.editorMode === "modal" ? "split" : "modal";
      if (ns.actions.applyEditorMode) ns.actions.applyEditorMode(ctx, nextMode);
      setLabel();
    });
  }

  function bindEditorLaunch(ctx) {
    const updateEditorVisibilityToggle = () => {
      if (!ctx.els.editorVisibilityToggle) return;
      const hidden = ctx.els.editorOverlay?.classList.contains("editor-modal-hidden-content");
      ctx.els.editorVisibilityToggle.textContent = hidden ? "展开" : "折叠";
      ctx.els.editorVisibilityToggle.setAttribute(
        "aria-label",
        hidden ? "显示弹窗内容" : "隐藏弹窗内容"
      );
      ctx.els.editorVisibilityToggle.title = hidden ? "显示" : "隐藏";
    };

    if (ctx.els.openTaskEditor) {
      ctx.els.openTaskEditor.addEventListener("click", () => openTaskEditorModal(ctx));
    }
    if (ctx.els.openProjectEditor) {
      ctx.els.openProjectEditor.addEventListener("click", () => openProjectEditorModal(ctx));
    }
    if (ctx.els.editorVisibilityToggle && ctx.els.editorOverlay) {
      updateEditorVisibilityToggle();
      ctx.els.editorVisibilityToggle.addEventListener("click", () => {
        ctx.els.editorOverlay.classList.toggle("editor-modal-hidden-content");
        updateEditorVisibilityToggle();
      });
    }
    if (ctx.els.editorClose) {
      ctx.els.editorClose.addEventListener("click", () => {
        if (ctx.els.editorOverlay) ctx.els.editorOverlay.hidden = true;
      });
    }
    if (ctx.els.editorOverlay) {
      ctx.els.editorOverlay.addEventListener("click", (e) => {
        if (e.target === ctx.els.editorOverlay) ctx.els.editorOverlay.hidden = true;
      });
    }
  }

  function renderProjectStatsPreview(ctx, target, projectId) {
    if (!target) return;
    if (!projectId) {
      target.hidden = true;
      target.innerHTML = "";
      return;
    }
    const project = ctx.state.projects.find((p) => p.id === projectId);
    if (!project) {
      target.hidden = true;
      target.innerHTML = "";
      return;
    }

    const totalDays = ns.tasks.calcProjectTotalDays(ctx, project.id);
    const progress = ns.tasks.calcProjectProgress(ctx, project);
    const weightedProgress = ns.tasks.calcProjectWeightedProgress(ctx, project);
    const taskCount = ctx.state.tasks.filter((t) => t.projectId === project.id).length;

    target.hidden = false;
    target.innerHTML = `
      <h4>${project.name}</h4>
      <p>当前工程统计</p>
      <div class="stats-mini-grid">
        <div class="stats-mini-card"><span class="stats-mini-label">步骤</span><span class="stats-mini-value">${project.steps.length}</span></div>
        <div class="stats-mini-card"><span class="stats-mini-label">日期条</span><span class="stats-mini-value">${taskCount}</span></div>
        <div class="stats-mini-card"><span class="stats-mini-label">总天数</span><span class="stats-mini-value">${totalDays}</span></div>
        <div class="stats-mini-card"><span class="stats-mini-label">完成率</span><span class="stats-mini-value">${progress}%</span></div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${weightedProgress}%;background:${project.color || "var(--accent)"}"></div></div>
      <div class="progress-label"><span>加权完成率</span><span>${weightedProgress}%</span></div>
    `;
  }

  function getTaskFormHTML() {
    return `
      <div class="task-editor-shell">
        <form id="task-form-modal" class="form-grid">
          <input type="hidden" name="taskId" id="task-id-modal">
          <label>标题
            <input required name="title" placeholder="如：方案评审">
          </label>
          <label>颜色
            <input required name="color" type="color" value="#00bfa6">
            <label class="inline">
              <input type="checkbox" id="use-project-color-modal"> 使用工程配色
            </label>
          </label>
          <label>开始日期
            <input required name="start" type="date" id="start-date-modal">
          </label>
          <label>结束日期
            <input required name="end" type="date" id="end-date-modal">
            <label class="inline">
              <input type="checkbox" id="no-end-modal"> 不限时，自动延伸至下月末
            </label>
          </label>
          <label>所属工程
            <select name="projectId" id="project-select-modal"></select>
          </label>
          <label>工程步骤
            <select name="stepId" id="step-select-modal"><option value="">（先选工程）</option></select>
          </label>
          <label>备注
            <input name="note" placeholder="可选">
          </label>
          <label class="inline">
            <input type="checkbox" id="task-done-modal" name="done"> 标记完成
          </label>
          <div class="form-actions">
            <button type="submit">保存日期条</button>
            <button type="button" class="btn-ghost" id="delete-task-modal">删除当前</button>
          </div>
        </form>
        <aside id="task-project-stats-modal" class="project-stats-preview" hidden></aside>
      </div>
    `;
  }
  function getProjectFormHTML() {
    return `
      <form id="project-form-modal" class="form-grid">
        <input type="hidden" name="projectId" id="project-id-modal">
        <label>工程名称
          <input required name="name" placeholder="如：移动端重构">
        </label>
        <label>简介
          <input name="description" placeholder="一句话说明">
        </label>
        <label>工程颜色
          <input type="color" name="projectColor" id="project-color-modal" value="#00bfa6">
        </label>
        <label>步骤
          <div class="step-list" id="step-list-modal"></div>
          <button type="button" class="btn-ghost" id="add-step-modal">+ 添加步骤</button>
        </label>
        <label class="inline">
          <input type="checkbox" id="project-draft-modal" name="draft"> 保存为草稿
        </label>
        <button type="submit">创建工程</button>
      </form>
    `;
  }

  function openTaskEditorModal(ctx, task) {
    if (ctx.state.editorMode !== "modal" || !ctx.els.editorOverlay) return;
    if (!task) ns.actions.resetTaskForm(ctx);
    ctx.els.editorModalTitle.textContent = task ? "编辑日期条" : "新建日期条";
    ctx.els.editorModalBody.innerHTML = getTaskFormHTML();
    bindTaskFormInModal(ctx, ctx.els.editorModalBody, task || null);
    ctx.els.editorOverlay.hidden = false;
  }

  function openProjectEditorModal(ctx, project) {
    if (ctx.state.editorMode !== "modal" || !ctx.els.editorOverlay) return;
    if (!project) ns.actions.resetProjectDraft(ctx);
    ctx.els.editorModalTitle.textContent = project ? "编辑工程" : "新建工程";
    ctx.els.editorModalBody.innerHTML = getProjectFormHTML();
    bindProjectFormInModal(ctx, ctx.els.editorModalBody, project || null);
    ctx.els.editorOverlay.hidden = false;
  }

  function bindTaskFormInModal(ctx, container, task) {
    const form = container.querySelector("#task-form-modal");
    const projectSelect = container.querySelector("#project-select-modal");
    const stepSelect = container.querySelector("#step-select-modal");
    const colorInput = container.querySelector("input[name='color']");
    const useProjectColor = container.querySelector("#use-project-color-modal");
    const startDate = container.querySelector("#start-date-modal");
    const endDate = container.querySelector("#end-date-modal");
    const noEnd = container.querySelector("#no-end-modal");
    const taskDone = container.querySelector("#task-done-modal");
    const deleteBtn = container.querySelector("#delete-task-modal");
    const statsTarget = container.querySelector("#task-project-stats-modal");
    if (!form || !projectSelect || !stepSelect) return;

    projectSelect.innerHTML = `<option value="">（可选）</option>`;
    ctx.state.projects.filter((p) => !p.draft).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      projectSelect.appendChild(opt);
    });

    projectSelect.addEventListener("change", () => {
      stepSelect.innerHTML = `<option value="">${projectSelect.value ? "（可选）" : "（先选工程）"}</option>`;
      const proj = ctx.state.projects.find((p) => p.id === projectSelect.value);
      proj?.steps?.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.title;
        stepSelect.appendChild(opt);
      });
      if (useProjectColor?.checked && projectSelect.value) colorInput.value = ns.actions.getProjectColor(ctx, projectSelect.value);
      renderProjectStatsPreview(ctx, statsTarget, projectSelect.value);
    });

    useProjectColor?.addEventListener("change", () => {
      if (useProjectColor.checked && projectSelect.value) colorInput.value = ns.actions.getProjectColor(ctx, projectSelect.value);
    });

    const syncEnd = () => {
      if (noEnd?.checked && startDate?.value) endDate.value = ns.core.monthEnd(startDate.value);
    };
    noEnd?.addEventListener("change", syncEnd);
    startDate?.addEventListener("change", syncEnd);

    if (task) {
      ctx.runtime.editingTaskId = task.id;
      form.taskId.value = task.id;
      form.title.value = task.title;
      form.color.value = task.color;
      form.start.value = task.start;
      form.end.value = task.end;
      form.note.value = task.note || "";
      if (taskDone) taskDone.checked = !!task.done;
      projectSelect.value = task.projectId || "";
      projectSelect.dispatchEvent(new Event("change"));
      stepSelect.value = task.stepId || "";
      if (deleteBtn) deleteBtn.disabled = false;
      form.querySelector("button[type='submit']").textContent = "更新日期条";
    } else {
      ctx.runtime.editingTaskId = null;
      if (deleteBtn) deleteBtn.disabled = true;
      renderProjectStatsPreview(ctx, statsTarget, "");
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!data.title?.trim() || !data.start) return;
      if (useProjectColor?.checked && data.projectId) data.color = ns.actions.getProjectColor(ctx, data.projectId);
      if (noEnd?.checked) data.end = ns.core.monthEnd(data.start);
      if (ns.core.parseDate(data.start) > ns.core.parseDate(data.end)) {
        alert("结束日期必须不早于开始日期");
        return;
      }
      const payload = {
        title: data.title.trim(),
        start: data.start,
        end: data.end,
        color: data.color || "#00bfa6",
        projectId: data.projectId || "",
        stepId: data.stepId || "",
        note: data.note || "",
        done: !!taskDone?.checked
      };
      if (ctx.runtime.editingTaskId) {
        const target = ctx.state.tasks.find((t) => t.id === ctx.runtime.editingTaskId);
        if (target) Object.assign(target, payload);
      } else {
        ctx.state.tasks.push({ id: ctx.uuid(), order: ctx.state.tasks.length, ...payload });
      }
      ns.actions.persist(ctx);
      ns.actions.resetTaskForm(ctx);
      ns.render.renderAll(ctx);
      ns.actions.showToast(ctx, "保存成功");
      ctx.els.editorOverlay.hidden = true;
    });

    deleteBtn?.addEventListener("click", () => {
      if (!ctx.runtime.editingTaskId) return;
      ctx.state.tasks = ctx.state.tasks.filter((t) => t.id !== ctx.runtime.editingTaskId);
      ns.actions.persist(ctx);
      ns.actions.resetTaskForm(ctx);
      ns.render.renderAll(ctx);
      ctx.els.editorOverlay.hidden = true;
    });
  }
  function bindProjectFormInModal(ctx, container, project) {
    const form = container.querySelector("#project-form-modal");
    const stepList = container.querySelector("#step-list-modal");
    const addStepBtn = container.querySelector("#add-step-modal");
    const draftCheck = container.querySelector("#project-draft-modal");
    if (!form || !stepList) return;

    ctx.runtime.editingProjectId = project?.id || null;
    ctx.runtime.stepDraft = project ? project.steps.map((s) => ({ ...s })) : [];

    const renderSteps = () => {
      stepList.innerHTML = "";
      if (ctx.runtime.stepDraft.length === 0) stepList.innerHTML = `<div style="color:var(--muted)">暂无步骤</div>`;
      ctx.runtime.stepDraft.forEach((step, idx) => {
        const row = document.createElement("div");
        row.className = "step-row";
        row.innerHTML = `<input type="text" value="${step.title || ""}" placeholder="步骤 ${idx + 1}" data-step-index="${idx}"><button type="button" class="btn-ghost" data-remove="${idx}">删除</button>`;
        stepList.appendChild(row);
      });
      stepList.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
        ctx.runtime.stepDraft.splice(Number(btn.dataset.remove), 1);
        renderSteps();
      }));
      stepList.querySelectorAll("input[data-step-index]").forEach((input) => input.addEventListener("input", () => {
        ctx.runtime.stepDraft[Number(input.dataset.stepIndex)].title = input.value;
      }));
    };
    renderSteps();

    if (project) {
      form.projectId.value = project.id;
      form.name.value = project.name;
      form.description.value = project.description || "";
      form.projectColor.value = project.color || "#00bfa6";
      if (draftCheck) draftCheck.checked = !!project.draft;
      form.querySelector("button[type='submit']").textContent = "更新工程";
    }

    addStepBtn?.addEventListener("click", () => {
      ctx.runtime.stepDraft.push({ id: `step-${ctx.uuid()}`, title: "", done: false });
      renderSteps();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!data.name?.trim()) return;
      const steps = ctx.runtime.stepDraft.filter((s) => (s.title || "").trim()).map((s, i) => ({ ...s, title: s.title.trim(), order: i + 1 }));
      if (ctx.runtime.editingProjectId) {
        const target = ctx.state.projects.find((p) => p.id === ctx.runtime.editingProjectId);
        if (target) Object.assign(target, { name: data.name.trim(), description: data.description || "", color: data.projectColor || "#00bfa6", draft: !!draftCheck?.checked, steps });
      } else {
        ctx.state.projects.push({ id: `proj-${ctx.uuid()}`, name: data.name.trim(), description: data.description || "", color: data.projectColor || "#00bfa6", draft: !!draftCheck?.checked, archived: false, archivedAt: null, steps });
      }
      ns.actions.persist(ctx);
      ns.actions.resetProjectDraft(ctx);
      ctx.runtime.editingProjectId = null;
      ns.render.renderAll(ctx);
      ns.actions.showToast(ctx, "保存成功");
      ctx.els.editorOverlay.hidden = true;
    });
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
          if (projects.length === 0 && tasks.length === 0) throw new Error("导入内容为空或格式不对");
          ctx.state.projects = projects;
          ctx.state.tasks = tasks;
          const theme = ctx.constants.THEMES.includes(data.theme) ? data.theme : "black";
          ns.actions.applyTheme(ctx, theme);
          ctx.storage.save("calendar_theme", theme);
          ns.actions.persist(ctx);
          ns.actions.populateProjectSelect(ctx);
          ns.render.renderAll(ctx);
          alert("保存成功");
        } catch (err) {
          console.error(err);
          alert("导入失败，请确认文件为工程日历导出的 JSON 数据");
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

    // 新增工程新增步骤锟斤拷锟侥匡拷锟斤拷械锟斤拷赘锟皆拷锟街帮拷新增工程校锟侥┪诧拷新增步骤锟斤拷锟叫憋拷尾（孩子们CODEX没修注释）
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
  ns.bindings.openTaskEditorModal = openTaskEditorModal;
  ns.bindings.openProjectEditorModal = openProjectEditorModal;
})(window.CamenCalendar = window.CamenCalendar || {});

























