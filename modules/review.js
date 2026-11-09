/* Monthly review: restores the GitHub edition's calendar + project review while
   retaining the redesigned workspace and local data format. No dependencies. */
(function (ns) {
  "use strict";
  ns.review = ns.review || {};

  const dayMs = 86400000;
  const asTime = (s) => {
    if (typeof s !== "string" || !/^\d{4}-\d\d-\d\d$/.test(s)) return NaN;
    const [y, m, d] = s.split("-").map(Number);
    const date = Date.UTC(y, m - 1, d);
    const check = new Date(date);
    return check.getUTCFullYear() === y && check.getUTCMonth() + 1 === m && check.getUTCDate() === d ? date : NaN;
  };
  const inclusive = (start, end) => Math.max(0, Math.round((end - start) / dayMs) + 1);
  const percent = (n, total) => total > 0 ? Math.round(n / total * 100) : 0;
  const colorOf = (color) => /^#[\da-fA-F]{6}$/.test(color || "") ? color : "#665de7";

  function init(ctx) {
    const els = {
      trigger: document.getElementById("review-btn"),
      overlay: document.getElementById("review-overlay"),
      close: document.getElementById("review-close"),
      prev: document.getElementById("review-prev"),
      next: document.getElementById("review-next"),
      label: document.getElementById("review-month-label"),
      calendar: document.getElementById("review-calendar"),
      content: document.getElementById("review-content")
    };
    if (!els.trigger || !els.overlay || !els.calendar || !els.content) return;
    let lastFocus = null;
    ctx.runtime.reviewMonth = new Date(ctx.state.viewDate.getFullYear(), ctx.state.viewDate.getMonth(), 1);

    const close = () => { els.overlay.hidden = true; lastFocus?.focus?.(); };
    els.trigger.addEventListener("click", () => {
      lastFocus = document.activeElement;
      ctx.runtime.reviewMonth = new Date(ctx.state.viewDate.getFullYear(), ctx.state.viewDate.getMonth(), 1);
      render(ctx, els);
      els.overlay.hidden = false;
      document.getElementById("review-close")?.focus();
      document.getElementById("settings-menu")?.removeAttribute("open");
    });
    els.close?.addEventListener("click", close);
    els.overlay.addEventListener("click", (ev) => { if (ev.target === els.overlay) close(); });
    els.overlay.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } });
    els.prev?.addEventListener("click", () => changeMonth(-1));
    els.next?.addEventListener("click", () => changeMonth(1));
    function changeMonth(delta) {
      const d = ctx.runtime.reviewMonth;
      ctx.runtime.reviewMonth = new Date(d.getFullYear(), d.getMonth() + delta, 1);
      render(ctx, els);
    }
    ns.review.close = close;
  }

  function render(ctx, els) {
    const monthDate = ctx.runtime.reviewMonth;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthStart = Date.UTC(year, month, 1);
    const monthEnd = Date.UTC(year, month + 1, 0);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    els.label.textContent = `${year}年${month + 1}月`;
    const valid = ctx.state.tasks.filter((task) => Number.isFinite(asTime(task.start)) && Number.isFinite(asTime(task.end)) && asTime(task.end) >= asTime(task.start));
    const inMonth = valid.filter((task) => asTime(task.start) <= monthEnd && asTime(task.end) >= monthStart);
    const completed = inMonth.filter((task) => ns.tasks.isTaskDone(ctx, task));
    const projectsById = new Map(ctx.state.projects.map((p) => [p.id, p]));

    renderCalendar(ctx, els.calendar, year, month, daysInMonth, monthStart, inMonth, projectsById, () => { els.overlay.hidden = true; });
    renderProjects(ctx, els.content, inMonth, completed, monthStart, monthEnd, projectsById);
  }

  function renderCalendar(ctx, container, year, month, daysInMonth, monthStart, tasks, projectsById, close) {
    container.replaceChildren();
    const week = document.createElement("div");
    week.className = "review-weekdays";
    for (const label of ["日", "一", "二", "三", "四", "五", "六"]) {
      const el = document.createElement("span"); el.textContent = label; week.appendChild(el);
    }
    container.appendChild(week);
    const grid = document.createElement("div"); grid.className = "review-days";
    const offset = new Date(year, month, 1).getDay();
    for (let i = 0; i < offset; i++) { const blank = document.createElement("span"); blank.className = "review-day-blank"; grid.appendChild(blank); }
    const nowStr = ns.core.toDateStrLocal(new Date());
    for (let d = 1; d <= daysInMonth; d++) {
      const time = monthStart + (d - 1) * dayMs;
      const present = tasks.filter((task) => asTime(task.start) <= time && asTime(task.end) >= time);
      const doneCount = present.filter((task) => ns.tasks.isTaskDone(ctx, task)).length;
      const day = document.createElement("button");
      day.type = "button"; day.className = "review-day";
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dateStr === nowStr) day.classList.add("is-today");
      if (present.length) day.classList.add("has-tasks");
      day.title = `${dateStr} · ${present.length} 个事项${doneCount ? ` · ${doneCount} 已完成` : ""}（点击查看当月）`;
      const number = document.createElement("span"); number.className = "review-day-number"; number.textContent = d;
      day.appendChild(number);
      const dots = document.createElement("span"); dots.className = "review-day-markers";
      present.slice(0, 3).forEach((task) => {
        const dot = document.createElement("i");
        dot.style.backgroundColor = colorOf(projectsById.get(task.projectId)?.color || task.color);
        dot.style.opacity = ns.tasks.isTaskDone(ctx, task) ? ".4" : "1";
        dots.appendChild(dot);
      });
      if (present.length > 3) {
        const more = document.createElement("small"); more.textContent = `+${present.length - 3}`; dots.appendChild(more);
      }
      day.appendChild(dots);
      day.addEventListener("click", () => {
        ctx.state.viewDate = new Date(year, month, d);
        // When single-view is active, activate calendar, not engineering.
        document.querySelector('.tab[data-target="calendar-view"]')?.click();
        ns.render.renderCalendar(ctx); ns.render.renderTimeline(ctx);
        close();
        document.getElementById("calendar-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      grid.appendChild(day);
    }
    container.appendChild(grid);
    const foot = document.createElement("p"); foot.className = "review-calendar-hint"; foot.textContent = "点选日期，可跳转到对应月份的日历";
    container.appendChild(foot);
  }

  function renderProjects(ctx, container, tasks, completed, monthStart, monthEnd, projectsById) {
    container.replaceChildren();
    const info = document.createElement("div"); info.className = "review-brief";
    const uniqueProjects = new Set(tasks.filter((t) => t.projectId && projectsById.has(t.projectId)).map((t) => t.projectId));
    [["本月事项", tasks.length], ["已完成", completed.length], ["涉及工程", uniqueProjects.size]].forEach(([label, value]) => {
      const cell = document.createElement("div"); cell.className = "review-brief-item";
      const number = document.createElement("strong"); number.textContent = value;
      const title = document.createElement("small"); title.textContent = label;
      cell.append(number, title); info.appendChild(cell);
    });
    container.appendChild(info);
    if (!tasks.length) {
      const empty = document.createElement("p"); empty.className = "review-empty";
      empty.textContent = "这个月还没有安排，或现有事项不在本月范围内。";
      container.appendChild(empty); return;
    }
    const group = new Map();
    tasks.forEach((t) => {
      const key = t.projectId && projectsById.has(t.projectId) ? t.projectId : "__unassigned__";
      if (!group.has(key)) group.set(key, []);
      group.get(key).push(t);
    });
    const order = Array.from(group.keys()).sort((a, b) => a === "__unassigned__" ? 1 : b === "__unassigned__" ? -1 : (projectsById.get(a)?.name || "").localeCompare(projectsById.get(b)?.name || "", "zh"));
    order.forEach((projectId) => {
      const project = projectsById.get(projectId);
      const projectTasks = group.get(projectId);
      const done = projectTasks.filter((t) => ns.tasks.isTaskDone(ctx, t));
      // Time distribution covers the entire project's schedule, including tasks
      // entirely before/after the selected month. Completion counts are month-only.
      const allProjectTasks = ctx.state.tasks.filter((t) => {
        const valid = Number.isFinite(asTime(t.start)) && Number.isFinite(asTime(t.end)) && asTime(t.end) >= asTime(t.start);
        if (!valid) return false;
        return projectId === "__unassigned__" ? (!t.projectId || !projectsById.has(t.projectId)) : t.projectId === projectId;
      });
      let before = 0, current = 0, after = 0, doneDays = 0;
      allProjectTasks.forEach((t) => {
        const start = asTime(t.start), end = asTime(t.end);
        before += inclusive(start, Math.min(end, monthStart - dayMs));
        current += inclusive(Math.max(start, monthStart), Math.min(end, monthEnd));
        after += inclusive(Math.max(start, monthEnd + dayMs), end);
        if (ns.tasks.isTaskDone(ctx, t)) doneDays += inclusive(Math.max(start, monthStart), Math.min(end, monthEnd));
      });
      const allDays = before + current + after;
      const color = colorOf(project?.color);
      const card = document.createElement("article"); card.className = "review-project-card";
      const head = document.createElement("div"); head.className = "review-project-head";
      const nameArea = document.createElement("div"); nameArea.className = "review-project-name";
      const dot = document.createElement("span"); dot.className = "review-project-dot"; dot.style.backgroundColor = color;
      const name = document.createElement("strong"); name.textContent = project?.name || "独立日程";
      nameArea.append(dot, name);
      if (project?.archived) { const label = document.createElement("span"); label.className = "review-archived-label"; label.textContent = "已归档"; nameArea.appendChild(label); }
      const percentage = document.createElement("span"); percentage.className = "review-complete-rate";
      percentage.textContent = `${percent(done.length, projectTasks.length)}% 已完成`;
      head.append(nameArea, percentage);
      const meta = document.createElement("div"); meta.className = "review-project-meta";
      meta.textContent = `${projectTasks.length} 条事项 · 本月占用 ${current} 天 · 完成 ${doneDays} 天`;
      const segLabel = document.createElement("div"); segLabel.className = "review-progress-title";
      segLabel.textContent = "项目事项的时间分布";
      const segmented = document.createElement("div"); segmented.className = "review-segments"; segmented.role = "img";
      segmented.setAttribute("aria-label", `往月 ${before} 天，本月 ${current} 天，未来 ${after} 天`);
      [[before, "before"], [current, "current"], [after, "after"]].forEach(([days, klass]) => {
        if (!days) return;
        const segment = document.createElement("span"); segment.className = `review-segment ${klass}`;
        segment.style.width = `${percent(days, allDays)}%`;
        if (klass === "current") segment.style.backgroundColor = color;
        segmented.appendChild(segment);
      });
      const legend = document.createElement("div"); legend.className = "review-progress-legend";
      legend.innerHTML = "<span>往月</span><span>本月</span><span>未来</span>";
      const doneTrack = document.createElement("div"); doneTrack.className = "review-done-track";
      const doneFill = document.createElement("span"); doneFill.style.width = `${percent(doneDays, current)}%`; doneFill.style.backgroundColor = color;
      doneTrack.appendChild(doneFill);
      const doneMeta = document.createElement("div"); doneMeta.className = "review-done-meta";
      const first = document.createElement("span"); first.textContent = "本月事项天数完成率";
      const second = document.createElement("strong"); second.textContent = `${percent(doneDays, current)}%`;
      doneMeta.append(first, second);
      card.append(head, meta, segLabel, segmented, legend, doneMeta, doneTrack);
      container.appendChild(card);
    });
  }
  ns.review.init = init;
})(window.CamenCalendar = window.CamenCalendar || {});
