/* Progressive UX layer. No storage schema changes and no external dependencies. */
(function (ns) {
  "use strict";
  ns.polish = ns.polish || {};

  function init(ctx) {
    const modeDual = document.getElementById("layout-dual");
    const tabs = Array.from(document.querySelectorAll(".tabs .tab"));
    const settings = document.getElementById("settings-menu");
    const legend = document.querySelector(".legend-details");
    const timelineSettings = document.querySelector(".timeline-advanced");
    const wrapper = document.getElementById("timeline-wrapper");
    const timelineToggle = document.getElementById("timeline-collapse");

    const syncMode = () => {
      const dual = document.body.classList.contains("dual-view") && window.innerWidth > 850;
      modeDual?.classList.toggle("active", dual);
      modeDual?.setAttribute("aria-pressed", String(dual));
      if (dual) tabs.forEach((tab) => tab.classList.remove("active"));
      else if (!tabs.some((tab) => tab.classList.contains("active"))) {
        tabs[0]?.classList.add("active");
        ctx.els.views.forEach((view) => view.classList.toggle("active", view.id === "calendar-view"));
      }
    };

    tabs.forEach((tab) => tab.addEventListener("click", () => {
      if (ctx.els.dualToggle?.checked) {
        ctx.els.dualToggle.checked = false;
        ctx.els.dualToggle.dispatchEvent(new Event("change"));
      }
      syncMode();
    }));
    modeDual?.addEventListener("click", () => {
      if (!ctx.els.dualToggle) return;
      ctx.els.dualToggle.checked = true;
      ctx.els.dualToggle.dispatchEvent(new Event("change"));
      syncMode();
    });
    ctx.els.dualToggle?.addEventListener("change", syncMode);
    window.addEventListener("resize", syncMode);

    document.getElementById("today-jump")?.addEventListener("click", () => {
      ctx.state.viewDate = new Date();
      ns.render.renderCalendar(ctx);
      ns.render.renderTimeline(ctx);
      document.getElementById("calendar-view")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    const refreshSummary = () => {
      const projects = ctx.state.projects.filter((p) => !p.archived && !p.draft);
      const relevant = ctx.state.tasks.filter((task) => {
        const project = ctx.state.projects.find((p) => p.id === task.projectId);
        return !project || (!project.archived && !project.draft);
      }).filter(ns.tasks.isValidTask);
      const date = ctx.state.viewDate;
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthly = relevant.filter((t) => ns.tasks.overlapsMonth(ctx, t, year, month));
      const pending = relevant.filter((t) => !ns.tasks.isTaskDone(ctx, t));
      const write = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
      write("metric-projects", projects.length);
      write("metric-month-tasks", monthly.length);
      write("metric-pending", pending.length);
      write("metric-month-label", `${month + 1} 月的日程`);
      write("archived-count", `${ctx.state.projects.filter((p) => p.archived).length} 个`);
      write("draft-count", `${ctx.state.projects.filter((p) => p.draft && !p.archived).length} 个`);
      const shownMonth = ns.tasks.visibleTasks(ctx).filter(ns.tasks.isValidTask).filter((t) => ns.tasks.overlapsMonth(ctx, t, year, month));
      write("timeline-subtitle", shownMonth.length ? `本月 ${shownMonth.length} 条日期条 · 拖动两端调整日期 · 拖动中部排序` : "本月尚无日期条 · 可直接将工程拖入日历日期");
    };
    // The original app has several independent render entrypoints. Cover both.
    const renderAll = ns.render.renderAll;
    ns.render.renderAll = function (context) { renderAll(context); refreshSummary(); };
    const renderCalendar = ns.render.renderCalendar;
    ns.render.renderCalendar = function (context) { renderCalendar(context); refreshSummary(); };

    const collapsed = Boolean(ctx.storage.load("camen_timeline_collapsed", false));
    const showTimeline = (show) => {
      wrapper.hidden = !show;
      timelineToggle.textContent = show ? "收起时间轴" : "展开时间轴";
      timelineToggle.setAttribute("aria-expanded", String(show));
      ctx.storage.save("camen_timeline_collapsed", !show);
    };
    showTimeline(!collapsed);
    timelineToggle?.addEventListener("click", () => showTimeline(wrapper.hidden));

    // Popovers are lightweight and close when focus moves outside.
    document.addEventListener("click", (event) => {
      if (settings && !settings.contains(event.target)) settings.open = false;
      if (legend && !legend.contains(event.target)) legend.open = false;
      if (timelineSettings && !timelineSettings.contains(event.target)) timelineSettings.open = false;
      document.querySelectorAll(".project-more[open]").forEach((menu) => {
        if (!menu.contains(event.target)) menu.open = false;
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (ctx.els.editorOverlay && !ctx.els.editorOverlay.hidden) ctx.els.editorOverlay.hidden = true;
        if (ctx.els.importOverlay && !ctx.els.importOverlay.hidden) ctx.els.importOverlay.hidden = true;
        if (ctx.els.statsOverlay && !ctx.els.statsOverlay.hidden) ctx.els.statsOverlay.hidden = true;
        if (document.getElementById("review-overlay") && !document.getElementById("review-overlay").hidden) ns.review?.close?.();
        settings.open = false;
        if (legend) legend.open = false;
        if (timelineSettings) timelineSettings.open = false;
        document.querySelectorAll(".project-more[open]").forEach((menu) => { menu.open = false; });
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat) {
        if (event.key.toLowerCase() === "n") { event.preventDefault(); ctx.state.editorMode === "modal" ? ns.bindings.openTaskEditorModal(ctx) : ctx.ui.taskDetails.open = true; }
        if (event.key.toLowerCase() === "p") { event.preventDefault(); ctx.state.editorMode === "modal" ? ns.bindings.openProjectEditorModal(ctx) : ctx.ui.projectDetails.open = true; }
      }
    });
    syncMode();
    refreshSummary();
    ns.review?.init(ctx);
  }
  ns.polish.init = init;
})(window.CamenCalendar = window.CamenCalendar || {});
