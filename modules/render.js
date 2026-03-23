(function (ns) {
  "use strict";

  ns.render = ns.render || {};

  function renderAll(ctx) {
    ns.actions.populateProjectSelect(ctx);
    ns.actions.populateProjectFilter(ctx);
    ns.actions.populateStepSelect(ctx, ctx.els.projectSelect.value);
    renderLegend(ctx);
    renderCalendar(ctx);
    renderTimeline(ctx);
    renderProjects(ctx);
    renderDrafts(ctx);
  }

  function renderLegend(ctx) {
    ctx.els.legend.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const items = ctx.state.projects
      .filter((p) => !p.draft)
      .map((p) => {
        const task = ctx.state.tasks.find((t) => t.projectId === p.id && t.color);
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
    ctx.els.legend.appendChild(fragment);
    updateFilterIndicator(ctx);
  }

  function updateFilterIndicator(ctx) {
    if (!ctx.els.filterClear) return;
    const active = Boolean(ctx.state.filterProjectId || ctx.state.filterStepId);
    ctx.els.filterClear.hidden = !active;
  }

  function renderCalendar(ctx) {
    const year = ctx.state.viewDate.getFullYear();
    const month = ctx.state.viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay.getDay();
    const todayStr = ns.core.toDateStrLocal(new Date());
    ctx.els.monthLabel.textContent = `${year}年 ${month + 1}月`;
    ctx.els.calendarGrid.innerHTML = "";

    const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
    weekdayNames.forEach((w) => {
      const label = document.createElement("div");
      label.textContent = w;
      label.style.textAlign = "center";
      label.style.color = "var(--muted)";
      label.style.padding = "4px 0";
      ctx.els.calendarGrid.appendChild(label);
    });

    for (let i = 0; i < startOffset; i++) {
      const empty = document.createElement("div");
      empty.className = "day";
      empty.style.opacity = 0.3;
      ctx.els.calendarGrid.appendChild(empty);
    }

    const tasks = ns.tasks.visibleTasks(ctx).filter(ns.tasks.isValidTask);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = ns.core.toDateStrLocal(new Date(year, month, day));
      const cell = document.createElement("div");
      cell.className = "day";
      if (dateStr === todayStr) cell.classList.add("today");

      const header = document.createElement("div");
      header.className = "date";
      header.innerHTML = `<strong>${day}</strong><span>${weekdayNames[new Date(year, month, day).getDay()]}</span>`;

      const chipsBox = document.createElement("div");
      chipsBox.className = "chips";

      const dayTasks = tasks.filter((t) => dateStr >= t.start && dateStr <= t.end);
      dayTasks.forEach((t) => chipsBox.appendChild(makeTaskChip(ctx, t)));

      cell.appendChild(header);
      cell.appendChild(chipsBox);
      ctx.els.calendarGrid.appendChild(cell);
    }
  }

  function makeTaskChip(ctx, task) {
    const tmpl = document.getElementById("task-chip-template");
    const node = tmpl.content.firstElementChild.cloneNode(true);
    if (ns.tasks.isTaskDone(ctx, task)) node.classList.add("done");
    node.querySelector(".dot").style.background = task.color;
    node.querySelector(".text").textContent = task.title;
    const projectName = ns.actions.getProjectName(ctx, task.projectId);
    const projLabel = projectName || "无所属";
    node.title = `${projLabel} | ${task.start} ~ ${task.end}`;
    node.setAttribute("data-project", projLabel);
    node.draggable = true;
    node.dataset.taskId = task.id;
    node.addEventListener("dragstart", (e) => ns.bindings.onChipDragStart(ctx, e));
    node.addEventListener("dragover", (e) => ns.bindings.onChipDragOver(ctx, e));
    node.addEventListener("dragleave", (e) => ns.bindings.onChipDragLeave(ctx, e));
    node.addEventListener("drop", (e) => ns.bindings.onChipDrop(ctx, e));
    node.addEventListener("click", () => ns.actions.startEditTask(ctx, task));
    // Touch drag polyfill
    if (ns.touch && ns.touch.isTouchDevice()) {
      ns.touch.enableTouchDrag(node, {
        onDragStart: function (e) { ns.bindings.onChipDragStart(ctx, e); },
        onDragOver: function (e) {
          var chip = e.currentTarget.closest && e.currentTarget.closest(".task-chip");
          if (chip) { e.currentTarget = chip; ns.bindings.onChipDragOver(ctx, e); }
        },
        onDragLeave: function (e) {
          var chip = e.currentTarget.closest && e.currentTarget.closest(".task-chip");
          if (chip) { e.currentTarget = chip; ns.bindings.onChipDragLeave(ctx, e); }
        },
        onDrop: function (e) {
          var chip = e.currentTarget.closest && e.currentTarget.closest(".task-chip");
          if (chip) { e.currentTarget = chip; ns.bindings.onChipDrop(ctx, e); }
        },
        onDragEnd: function () { ns.bindings.clearDragState(ctx); }
      });
    }
    return node;
  }

  function renderTimeline(ctx) {
    const year = ctx.state.viewDate.getFullYear();
    const month = ctx.state.viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellSize = Math.round(
      20 * ns.core.clamp(Number(ctx.state.timelineZoom) || 1, ctx.constants.ZOOM_MIN, ctx.constants.ZOOM_MAX)
    );

    ctx.els.timelineHeader.style.gridTemplateColumns = `repeat(${daysInMonth}, minmax(${cellSize}px, 1fr))`;
    ctx.els.timelineHeader.innerHTML = "";
    for (let i = 1; i <= daysInMonth; i++) {
      const cell = document.createElement("div");
      cell.textContent = i;
      cell.style.textAlign = "center";
      cell.style.padding = "4px 0";
      cell.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
      ctx.els.timelineHeader.appendChild(cell);
    }

    const tasks = ns.tasks
      .visibleTasks(ctx)
      .filter(ns.tasks.isValidTask)
      .filter((t) => ns.tasks.overlapsMonth(ctx, t, year, month))
      .sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) ||
          ns.core.parseDate(a.start) - ns.core.parseDate(b.start) ||
          ns.core.parseDate(a.end) - ns.core.parseDate(b.end)
      );

    const lanes = ns.tasks.packTasks(ctx, tasks);
    ctx.els.timelineGrid.innerHTML = "";
    if (tasks.length === 0) {
      ctx.els.timelineGrid.textContent = "本月暂无日期条。";
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
        if (ns.tasks.isTaskDone(ctx, task)) bar.classList.add("done");
        bar.style.background = task.color;
        bar.style.gridColumn = `${ns.tasks.clampToMonth(ctx, task.start, year, month)} / ${
          ns.tasks.clampToMonth(ctx, task.end, year, month) + 1
        }`;
        const projectName = ns.actions.getProjectName(ctx, task.projectId);
        bar.textContent = task.title;
        bar.title = projectName ? `${projectName} | ${task.start} ~ ${task.end}` : `${task.start} ~ ${task.end}`;
        if (bar.classList.contains("done")) {
          bar.style.color = "#e5e7eb";
          bar.style.textDecoration = "line-through";
        } else {
          bar.style.color = "#0b1324";
          bar.style.textDecoration = "none";
        }
        bar.addEventListener("click", () => ns.actions.startEditTask(ctx, task));
        bar.addEventListener("dragstart", (e) => ns.bindings.onTaskDragStart(ctx, e));
        bar.addEventListener("dragover", (e) => ns.bindings.onTaskDragOver(ctx, e));
        bar.addEventListener("dragleave", (e) => ns.bindings.onTaskDragLeave(ctx, e));
        bar.addEventListener("drop", (e) => ns.bindings.onTaskDrop(ctx, e));
        // Touch drag polyfill for timeline bars
        if (ns.touch && ns.touch.isTouchDevice()) {
          ns.touch.enableTouchDrag(bar, {
            onDragStart: function (e) { ns.bindings.onTaskDragStart(ctx, e); },
            onDragOver: function (e) { ns.bindings.onTaskDragOver(ctx, e); },
            onDragLeave: function (e) { ns.bindings.onTaskDragLeave(ctx, e); },
            onDrop: function (e) {
              var barEl = e.currentTarget.closest && e.currentTarget.closest(".task-bar");
              if (barEl) { e.currentTarget = barEl; ns.bindings.onTaskDrop(ctx, e); }
              else { ns.bindings.onGridDrop(ctx, e); }
            },
            onDragEnd: function () { ns.bindings.clearDragState(ctx); }
          });
        }
        row.appendChild(bar);
      });
      ctx.els.timelineGrid.appendChild(row);
    });
  }

  function renderProjects(ctx) {
    ctx.els.projectsList.innerHTML = "";
    const list = ctx.state.projects.filter((p) => !p.draft);
    if (list.length === 0) {
      ctx.els.projectsList.textContent = "暂无工程，先添加一个吧。";
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
      editBtn.addEventListener("click", () => ns.actions.startEditProject(ctx, p));
      const delBtn = document.createElement("button");
      delBtn.className = "btn-ghost";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", () => ns.actions.deleteProject(ctx, p.id));
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      const statsBtn = document.createElement("button");
      statsBtn.className = "btn-ghost";
      statsBtn.textContent = "统计";
      statsBtn.addEventListener("click", () => ns.actions.showProjectStats(ctx, p.id));
      actions.appendChild(statsBtn);
      head.appendChild(title);
      head.appendChild(actions);

      const desc = document.createElement("div");
      desc.textContent = p.description || "（无简介）";
      title.style.cursor = "pointer";
      desc.style.cursor = "pointer";
      title.addEventListener("click", () => ns.actions.startEditProject(ctx, p));
      desc.addEventListener("click", () => ns.actions.startEditProject(ctx, p));

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
          ns.actions.startEditProject(ctx, p);
        });
        // Long-press as dblclick alternative on touch
        if (ns.touch && ns.touch.isTouchDevice()) {
          ns.touch.enableLongPress(chip, function () {
            ns.actions.startEditProject(ctx, p);
          }, 500);
        }

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = Boolean(s.done);
        check.title = "标记步骤已完成";
        check.addEventListener("click", (ev) => {
          ev.stopPropagation();
          s.done = !s.done;
          // 同步：将步骤完成状态同步到所有绑定该步骤的日期条
          ctx.state.tasks.forEach((t) => {
            if (t.projectId === p.id && t.stepId === s.id) t.done = s.done;
          });
          ns.actions.persist(ctx);
          renderProjects(ctx);
          renderAll(ctx);
        });
        chip.appendChild(check);

        stepsBox.appendChild(chip);
      });

      const related = document.createElement("div");
      related.style.color = "var(--muted)";
      const taskCount = ctx.state.tasks.filter((t) => t.projectId === p.id).length;
      related.textContent = `关联日期条：${taskCount} 条`;

      card.appendChild(head);
      card.appendChild(desc);
      card.appendChild(stepsBox);
      card.appendChild(related);
      ctx.els.projectsList.appendChild(card);
    });
  }

  function renderDrafts(ctx) {
    if (!ctx.els.draftList) return;
    ctx.els.draftList.innerHTML = "";
    const drafts = ctx.state.projects.filter((p) => p.draft);
    if (drafts.length === 0) {
      ctx.els.draftList.textContent = "暂无草稿";
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
        ns.actions.persist(ctx);
        renderAll(ctx);
      });

      const remove = document.createElement("button");
      remove.className = "btn-ghost";
      remove.textContent = "删除";
      remove.addEventListener("click", () => {
        ctx.state.projects = ctx.state.projects.filter((proj) => proj.id !== p.id);
        ctx.state.tasks = ctx.state.tasks.filter((t) => t.projectId !== p.id);
        ns.actions.persist(ctx);
        renderAll(ctx);
      });

      card.appendChild(title);
      actions.appendChild(publish);
      actions.appendChild(remove);
      card.appendChild(actions);
      ctx.els.draftList.appendChild(card);
    });
  }

  function renderStats(ctx) {
    if (ctx.state.statsProjectId) {
      const project = ctx.state.projects.find((p) => p.id === ctx.state.statsProjectId);
      if (!project) {
        ctx.state.statsProjectId = null;
        renderStats(ctx);
        return;
      }
      renderProjectStats(ctx, project);
    } else {
      renderOverviewStats(ctx);
    }
  }

  function renderProjectStats(ctx, project) {
    ctx.els.statsTitle.textContent = `${project.name} — 统计`;
    ctx.els.statsBack.hidden = false;
    ctx.els.statsBack.onclick = () => {
      ctx.state.statsProjectId = null;
      renderStats(ctx);
    };

    const tasks = ctx.state.tasks.filter((t) => t.projectId === project.id);
    const totalDays = ns.tasks.calcProjectTotalDays(ctx, project.id);
    const progress = ns.tasks.calcProjectProgress(ctx, project);
    const doneSteps = project.steps.filter((s) => s.done).length;

    // Find project date range
    let earliest = null,
      latest = null;
    tasks.forEach((t) => {
      const s = ns.core.parseDate(t.start),
        e = ns.core.parseDate(t.end);
      if (!earliest || s < earliest) earliest = s;
      if (!latest || e > latest) latest = e;
    });
    const spanDays = earliest && latest ? Math.round((latest - earliest) / (1000 * 60 * 60 * 24)) + 1 : 0;

    let html = "";

    // Key metrics
    html += `<div class="stats-grid">`;
    html += `<div class="stat-card"><h3>工程进度</h3>
      <div class="progress-bar"><div class="progress-fill" style="width:${progress}%;background:${
      project.color || "var(--accent)"
    }"></div></div>
      <div class="progress-label"><span>${doneSteps} / ${project.steps.length} 步骤完成</span><span>${progress}%</span></div></div>`;
    html += `<div class="stat-card"><h3>关联任务</h3><div class="stat-number">${tasks.length}<span class="stat-unit">条</span></div></div>`;
    html += `<div class="stat-card"><h3>任务总工时</h3><div class="stat-number">${totalDays}<span class="stat-unit">天</span></div></div>`;
    html += `<div class="stat-card"><h3>工程跨度</h3><div class="stat-number">${spanDays}<span class="stat-unit">天</span></div></div>`;
    html += `</div>`;

    // Pie chart — step days distribution
    if (project.steps.length > 0) {
      html += `<div class="stats-section"><h3>各步骤占用天数</h3>`;
      const stepData = project.steps.map((s, i) => ({
        title: s.title,
        days: ns.tasks.calcStepDays(ctx, project.id, s.id),
        color: ctx.constants.CHART_COLORS[i % ctx.constants.CHART_COLORS.length],
        done: s.done
      }));
      // tasks not assigned to any step
      const unassignedDays = tasks
        .filter((t) => !t.stepId)
        .reduce((sum, t) => sum + ns.tasks.calcTaskDays(ctx, t), 0);
      if (unassignedDays > 0) {
        stepData.push({ title: "未分配步骤", days: unassignedDays, color: "#6b7280", done: false });
      }

      const total = stepData.reduce((s, d) => s + d.days, 0);
      if (total > 0) {
        let gradParts = [],
          acc = 0;
        stepData.forEach((d) => {
          if (d.days === 0) return;
          const pct = (d.days / total) * 100;
          gradParts.push(`${d.color} ${acc}% ${acc + pct}%`);
          acc += pct;
        });
        const grad = `conic-gradient(${gradParts.join(", ")})`;
        html += `<div class="pie-wrap">`;
        html += `<div class="pie-chart" style="background:${grad}"><div class="pie-center">${total} 天</div></div>`;
        html += `<div class="pie-legend">`;
        stepData.forEach((d) => {
          if (d.days === 0 && total > 0) return;
          const pct = total > 0 ? ((d.days / total) * 100).toFixed(1) : 0;
          html += `<div class="pie-legend-item"><span class="pie-legend-dot" style="background:${d.color}"></span>${
            d.title
          }<span class="pie-legend-value">${d.days} 天 (${pct}%)</span></div>`;
        });
        html += `</div></div>`;
      } else {
        html += `<div class="stats-empty">暂无任务数据</div>`;
      }
      html += `</div>`;
    }

    // Step detail table
    if (project.steps.length > 0) {
      html += `<div class="stats-section"><h3>步骤详情</h3>`;
      html += `<div class="table-scroll-wrapper"><table class="step-table"><thead><tr><th>序号</th><th>步骤</th><th>状态</th><th>任务数</th><th>天数</th></tr></thead><tbody>`;
      project.steps.forEach((s, i) => {
        const stepTasks = tasks.filter((t) => t.stepId === s.id);
        const days = ns.tasks.calcStepDays(ctx, project.id, s.id);
        html += `<tr><td>${i + 1}</td><td>${s.title}</td><td><span class="step-status ${
          s.done ? "done" : "pending"
        }"></span> ${s.done ? "已完成" : "进行中"}</td><td>${stepTasks.length}</td><td>${days}</td></tr>`;
      });
      html += `</tbody></table></div></div>`;
    }

    ctx.els.statsContent.innerHTML = html;
  }

  function renderOverviewStats(ctx) {
    ctx.els.statsTitle.textContent = "工程统计总览";
    ctx.els.statsBack.hidden = true;

    const projects = ctx.state.projects.filter((p) => !p.draft);
    if (projects.length === 0) {
      ctx.els.statsContent.innerHTML = `<div class="stats-empty">暂无工程数据，先创建一个工程吧。</div>`;
      return;
    }

    const totalTasks = ctx.state.tasks.length;
    const avgProgress = Math.round(projects.reduce((s, p) => s + ns.tasks.calcProjectProgress(ctx, p), 0) / projects.length);

    let html = "";

    // Summary metrics
    html += `<div class="stats-grid">`;
    html += `<div class="stat-card"><h3>工程总数</h3><div class="stat-number">${projects.length}<span class="stat-unit">个</span></div></div>`;
    html += `<div class="stat-card"><h3>任务总数</h3><div class="stat-number">${totalTasks}<span class="stat-unit">条</span></div></div>`;
    html += `<div class="stat-card"><h3>平均完成率</h3>
      <div class="progress-bar"><div class="progress-fill" style="width:${avgProgress}%;background:var(--accent)"></div></div>
      <div class="progress-label"><span>所有工程平均</span><span>${avgProgress}%</span></div></div>`;
    html += `</div>`;

    // Progress comparison bar chart
    html += `<div class="stats-section"><h3>工程进度对比</h3><div class="bar-chart">`;
    projects.forEach((p) => {
      const pct = ns.tasks.calcProjectProgress(ctx, p);
      const color = p.color || "var(--accent)";
      html += `<div class="bar-item" style="cursor:pointer" data-pid="${p.id}">
        <div class="bar-item-label" title="${p.name}">${p.name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pct, 2)}%;background:${color}">${
        pct > 15 ? pct + "%" : ""
      }</div></div>
        <div class="bar-value">${pct}%</div></div>`;
    });
    html += `</div></div>`;

    // Duration comparison bar chart
    const maxDays = Math.max(...projects.map((p) => ns.tasks.calcProjectTotalDays(ctx, p.id)), 1);
    html += `<div class="stats-section"><h3>工程工时对比（天）</h3><div class="bar-chart">`;
    projects.forEach((p) => {
      const days = ns.tasks.calcProjectTotalDays(ctx, p.id);
      const pct = (days / maxDays) * 100;
      const color = p.color || "var(--accent)";
      html += `<div class="bar-item" style="cursor:pointer" data-pid="${p.id}">
        <div class="bar-item-label" title="${p.name}">${p.name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pct, 2)}%;background:${color}">${
        days > 0 && pct > 15 ? days + "天" : ""
      }</div></div>
        <div class="bar-value">${days} 天</div></div>`;
    });
    html += `</div></div>`;

    // Tasks per project comparison
    const maxTasks = Math.max(...projects.map((p) => ctx.state.tasks.filter((t) => t.projectId === p.id).length), 1);
    html += `<div class="stats-section"><h3>各工程任务数</h3><div class="bar-chart">`;
    projects.forEach((p) => {
      const count = ctx.state.tasks.filter((t) => t.projectId === p.id).length;
      const pct = (count / maxTasks) * 100;
      const color = p.color || "var(--accent)";
      html += `<div class="bar-item" style="cursor:pointer" data-pid="${p.id}">
        <div class="bar-item-label" title="${p.name}">${p.name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(pct, 2)}%;background:${color}">${
        count > 0 && pct > 15 ? count + "条" : ""
      }</div></div>
        <div class="bar-value">${count} 条</div></div>`;
    });
    html += `</div></div>`;

    ctx.els.statsContent.innerHTML = html;

    // Click to drill into project
    ctx.els.statsContent.querySelectorAll("[data-pid]").forEach((el) => {
      el.addEventListener("click", () => ns.actions.showProjectStats(ctx, el.dataset.pid));
    });
  }

  ns.render.renderAll = renderAll;
  ns.render.renderLegend = renderLegend;
  ns.render.renderCalendar = renderCalendar;
  ns.render.renderTimeline = renderTimeline;
  ns.render.renderProjects = renderProjects;
  ns.render.renderDrafts = renderDrafts;
  ns.render.renderStats = renderStats;
})(window.CamenCalendar = window.CamenCalendar || {});
