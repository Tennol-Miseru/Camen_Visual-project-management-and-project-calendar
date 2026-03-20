(function (ns) {
  "use strict";

  ns.tasks = ns.tasks || {};

  function visibleTasks(ctx) {
    let list = ctx.state.tasks.slice();
    if (ctx.state.filterProjectId) list = list.filter((t) => t.projectId === ctx.state.filterProjectId);
    if (ctx.state.filterStepId) list = list.filter((t) => t.stepId === ctx.state.filterStepId);
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return list;
  }

  function isValidTask(task) {
    return task && task.start && task.end;
  }

  function isTaskDone(ctx, task) {
    if (task.stepId) {
      const project = ctx.state.projects.find((p) => p.id === task.projectId);
      const step = project?.steps.find((s) => s.id === task.stepId);
      if (step) return Boolean(step.done);
    }
    return Boolean(task.done);
  }

  function overlapsMonth(ctx, task, year, month) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const start = ns.core.parseDate(task.start);
    const end = ns.core.parseDate(task.end);
    return start <= monthEnd && end >= monthStart;
  }

  function clampToMonth(ctx, dateStr, year, month) {
    const date = ns.core.parseDate(dateStr);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    if (date < monthStart) return 1;
    if (date > monthEnd) return monthEnd.getDate();
    return date.getDate();
  }

  function packTasks(ctx, tasks) {
    const lanes = [];
    tasks.forEach((task) => {
      let placed = false;
      for (const lane of lanes) {
        const last = lane[lane.length - 1];
        if (ns.core.parseDate(last.end) < ns.core.parseDate(task.start)) {
          lane.push(task);
          placed = true;
          break;
        }
      }
      if (!placed) lanes.push([task]);
    });
    return lanes;
  }

  function compressTask(ctx, task, resetOrig = false) {
    if (!task) return;
    if (resetOrig || !task.origEnd) task.origEnd = task.end;
    const startDate = ns.core.parseDate(task.start);
    const endBase = ns.core.parseDate(task.origEnd || task.end);
    const dur = (endBase - startDate) / (1000 * 60 * 60 * 24) + 1;
    if (dur <= 1) {
      task.end = ns.core.toDateStrLocal(endBase);
      return;
    }
    const half = Math.max(1, Math.ceil(dur / 2));
    const newEnd = new Date(startDate);
    newEnd.setDate(newEnd.getDate() + (half - 1));
    task.end = ns.core.toDateStrLocal(newEnd);
  }

  function calcTaskDays(ctx, task) {
    const s = ns.core.parseDate(task.start);
    const e = ns.core.parseDate(task.end);
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
  }

  function calcStepDays(ctx, projectId, stepId) {
    return ctx.state.tasks
      .filter((t) => t.projectId === projectId && t.stepId === stepId)
      .reduce((sum, t) => sum + calcTaskDays(ctx, t), 0);
  }

  function calcProjectTotalDays(ctx, projectId) {
    return ctx.state.tasks
      .filter((t) => t.projectId === projectId)
      .reduce((sum, t) => sum + calcTaskDays(ctx, t), 0);
  }

  function calcProjectProgress(ctx, project) {
    if (!project.steps.length) return 0;
    const done = project.steps.filter((s) => s.done).length;
    return Math.round((done / project.steps.length) * 100);
  }

  ns.tasks.visibleTasks = visibleTasks;
  ns.tasks.isValidTask = isValidTask;
  ns.tasks.isTaskDone = isTaskDone;
  ns.tasks.overlapsMonth = overlapsMonth;
  ns.tasks.clampToMonth = clampToMonth;
  ns.tasks.packTasks = packTasks;
  ns.tasks.compressTask = compressTask;
  ns.tasks.calcTaskDays = calcTaskDays;
  ns.tasks.calcStepDays = calcStepDays;
  ns.tasks.calcProjectTotalDays = calcProjectTotalDays;
  ns.tasks.calcProjectProgress = calcProjectProgress;
})(window.CamenCalendar = window.CamenCalendar || {});

