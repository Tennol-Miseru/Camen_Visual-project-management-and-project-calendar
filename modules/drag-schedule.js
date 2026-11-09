/* Camen: quick planning by dragging a project onto a calendar day; date-range resizing.
   This layer leaves the persisted project/task schema and the existing sortable lists intact. */
(function (ns) {
  'use strict';
  ns.dragSchedule = ns.dragSchedule || {};
  const MIME = 'application/x-camen-project';
  const $ = (selector, root = document) => root.querySelector(selector);

  function init(ctx) {
    const grid = ctx.els.calendarGrid;
    const timeline = ctx.els.timelineGrid;
    const projectList = ctx.els.projectsList;
    if (!grid || !timeline || !projectList) return;
    let pickProject = null;
    let draggingProject = null;
    let hoverCell = null;
    let resizing = null;
    let suppressClick = false;
    let moving = null;
    let painting = null;
    let movedChip = null;
    const wrapper = document.getElementById('timeline-wrapper');
    let scrollingFrame = 0;
    const MOVE_THRESHOLD = 7;

    // HTML draggable on a whole card steals pointer movement from nested native
    // controls, especially the manual progress <input type=range>. Temporarily
    // disable only the card's calendar-drag source while an interactive child is
    // being used. Do not preventDefault: the range control must keep its native
    // mouse, touch and keyboard behaviour.
    // Only actual controls are non-draggable. The old selector also blocked
    // entire .step-chip and .project-manual-progress regions, so dragging from
    // ordinary step text (often the centre of a card) silently failed.
    // A click on a step still filters; a drag on its text now schedules.
    const interactiveCardParts =
      'input, button, select, textarea, summary, a, [contenteditable="true"], .project-drag-handle';
    const lockedCards = new Set();
    const unlockCards = () => {
      for (const card of lockedCards) {
        if (card.isConnected && card.dataset.scheduleEnhanced === 'true') card.draggable = true;
      }
      lockedCards.clear();
    };
    projectList.addEventListener('pointerdown', event => {
      const card = event.target.closest?.('.project-card[data-project-id]');
      if (!card || !event.target.closest(interactiveCardParts)) return;
      card.draggable = false;
      lockedCards.add(card);
    }, true);
    document.addEventListener('pointerup', unlockCards, true);
    document.addEventListener('pointercancel', unlockCards, true);
    window.addEventListener('blur', unlockCards);

    const addDays = (date, amount) => {
      const d = ns.core.parseDate(date);
      d.setDate(d.getDate() + amount);
      return ns.core.toDateStrLocal(d);
    };
    const dateDisplay = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
    const validProject = id => ctx.state.projects.find(p => p.id === id && !p.archived && !p.draft);
    const hasProjectMime = event => Boolean(
      event?.dataTransfer?.types && Array.from(event.dataTransfer.types).includes(MIME)
    );
    const dropProjectId = event => {
      // The transferable project ID is the source of truth on drop. In native
      // dragover, getData() is hidden by browsers; check the MIME type instead.
      const transferred = event?.type === 'drop' && hasProjectMime(event)
        ? event.dataTransfer.getData(MIME) : '';
      return validProject(transferred || draggingProject)?.id || null;
    };
    const availableProject = event => event?.type === 'drop'
      ? Boolean(dropProjectId(event))
      : Boolean(validProject(draggingProject) || hasProjectMime(event));

    const tip = document.createElement('div');
    tip.className = 'schedule-float-tip';
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');
    document.body.append(tip);
    const showTip = (msg, x, y) => {
      tip.textContent = msg;
      tip.hidden = false;
      const px = Math.max(8, Math.min(x + 14, innerWidth - 235));
      const py = Math.max(8, Math.min(y + 18, innerHeight - 55));
      tip.style.left = `${px}px`;
      tip.style.top = `${py}px`;
    };
    const hideTip = () => { tip.hidden = true; };

    const banner = document.createElement('div');
    banner.className = 'schedule-pick-banner';
    banner.hidden = true;
    banner.innerHTML = '<span class="schedule-pick-indicator" aria-hidden="true"></span><span class="schedule-pick-message"></span><button type="button" class="schedule-pick-cancel">取消</button>';
    const filterRow = $('.calendar-filter-row');
    (filterRow || grid).before(banner);
    const endPick = () => {
      pickProject = null;
      document.body.classList.remove('schedule-pick-mode');
      banner.hidden = true;
      grid.querySelectorAll('.day.schedule-drop-target').forEach(el => el.classList.remove('schedule-drop-target'));
    };
    banner.querySelector('button').addEventListener('click', endPick);

    function planProject(projectId, date, endDate = date) {
      const project = validProject(projectId);
      if (!project || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
      if (endDate < date) [date, endDate] = [endDate, date];
      const exists = ctx.state.tasks.some(t => t.projectId === project.id && t.start === date && t.end === endDate && t.title === project.name);
      if (exists) {
        ns.actions.showToast(ctx, '这一天已有相同工程排期');
        return false;
      }
      const orders = ctx.state.tasks.map(task => Number(task.order)).filter(Number.isFinite);
      ctx.state.tasks.push({
        id: ctx.uuid(), title: project.name, start: date, end: endDate,
        color: /^#[0-9a-f]{6}$/i.test(project.color || '') ? project.color : '#665de7',
        projectId: project.id, stepId: '', note: '', done: false,
        order: (orders.length ? Math.max(...orders) : 0) + 1
      });
      // Never hide a newly created bar behind an unrelated active filter.
      if (ctx.state.filterProjectId && ctx.state.filterProjectId !== project.id) {
        ctx.state.filterProjectId = '';
        ctx.state.filterStepId = null;
      }
      if (ctx.state.filterStepId) ctx.state.filterStepId = null;
      ns.actions.persist(ctx);
      ns.render.renderAll(ctx);
      ns.actions.showToast(ctx, `${project.name} 已排入 ${dateDisplay(date)} — ${dateDisplay(endDate)}`);
      return true;
    }

    function beginPick(projectId) {
      const project = validProject(projectId);
      if (!project) return;
      pickProject = project.id;
      banner.querySelector('.schedule-pick-message').textContent = `为「${project.name}」划定日期范围，单击可选一天`;
      banner.hidden = false;
      document.body.classList.add('schedule-pick-mode');
      // On narrow viewports the project pane and calendar are separate tabs.
      if (!ctx.els.calendarView.classList.contains('active') && !document.body.classList.contains('dual-view')) {
        document.querySelector('.tab[data-target="calendar-view"]')?.click();
      }
      grid.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      ns.actions.showToast(ctx, '拖动划定日期范围，或点击一天 · Esc 取消');
    }

    function decorateProjects() {
      projectList.querySelectorAll('.project-card[data-project-id]').forEach(card => {
        if (card.dataset.scheduleEnhanced) return;
        card.dataset.scheduleEnhanced = 'true';
        card.draggable = true;
        card.setAttribute('aria-description', '可将工程卡片拖到日历日期，也可点击排期选择日期');
        const name = card.querySelector('.project-head-main h3');
        if (!name) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'project-quick-plan';
        btn.textContent = '+ 排期';
        btn.setAttribute('aria-label', `为${name.textContent}选择日历日期`);
        btn.addEventListener('click', event => {
          event.stopPropagation();
          beginPick(card.dataset.projectId);
        });
        name.insertAdjacentElement('afterend', btn);
      });
    }

    projectList.addEventListener('dragstart', event => {
      const card = event.target.closest?.('.project-card[data-project-id]');
      if (!card || !event.dataTransfer) return;
      // Reordering via ≡ uses its own drag handler. Do not reinterpret it as
      // a calendar-drop project, or steal a drag started on a native control.
      if (event.target.closest(interactiveCardParts) || lockedCards.has(card)) {
        if (!event.target.closest('.project-drag-handle')) event.preventDefault();
        return;
      }
      const projectId = card.dataset.projectId;
      if (!validProject(projectId)) return;
      draggingProject = projectId;
      ctx.runtime.calendarSchedulingDragId = projectId;
      event.dataTransfer.setData(MIME, projectId);
      event.dataTransfer.setData('text/plain', projectId);
      event.dataTransfer.effectAllowed = 'copyMove';
      card.classList.add('scheduling-source');
      document.body.classList.add('schedule-project-drag');
    });
    function clearDrag() {
      draggingProject = null;
      ctx.runtime.calendarSchedulingDragId = null;
      document.body.classList.remove('schedule-project-drag');
      projectList.querySelectorAll('.scheduling-source').forEach(el => el.classList.remove('scheduling-source'));
      if (hoverCell) hoverCell.classList.remove('schedule-drop-target');
      hoverCell = null;
      hideTip();
      if (ctx.runtime.archiveRefreshDeferred) {
        // Run AFTER the drop handler finishes creating a task; otherwise its
        // target calendar cell can disappear underneath the browser's drop.
        setTimeout(() => {
          if (ctx.runtime.calendarSchedulingDragId || !ctx.runtime.archiveRefreshDeferred) return;
          ctx.runtime.archiveRefreshDeferred = false;
          ns.render.renderCalendar(ctx);
          ns.render.renderTimeline(ctx);
        }, 0);
      }
    }
    document.addEventListener('dragend', () => { clearDrag(); unlockCards(); }, true);
    document.addEventListener('drop', () => {
      // A drop outside the calendar may have no scheduling handler at all.
      // Defer cleanup until grid listeners have had a chance to consume it.
      if (draggingProject) setTimeout(() => { if (draggingProject) clearDrag(); }, 0);
    }, true);
    window.addEventListener('blur', () => { clearDrag(); unlockCards(); });
    // A calendar chip dropped onto another day moves the entire duration while
    // preserving its original length and the day from which the user picked it up.
    grid.addEventListener('dragstart', event => {
      const chip = event.target.closest?.('.task-chip[data-task-id]');
      if (!chip || event.target.closest('.date-resize-handle')) return;
      movedChip = {id:chip.dataset.taskId, date:chip.closest('.day[data-date]')?.dataset.date};
    }, true);
    document.addEventListener('dragend', () => { movedChip = null; });
    grid.addEventListener('dragover', event => {
      if (!movedChip || draggingProject) return;
      if (event.target.closest('.day[data-date]')) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect='move';
      }
    }, true);
    grid.addEventListener('drop', event => {
      if (!movedChip || draggingProject) return;
      const target = event.target.closest('.day[data-date]');
      if (!target || !movedChip.date || target.dataset.date === movedChip.date) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const task = ctx.state.tasks.find(t => t.id === movedChip.id);
      const from = movedChip.date;
      movedChip = null;
      if (!task) return;
      const delta = Math.round((ns.core.parseDate(target.dataset.date) - ns.core.parseDate(from)) / 86400000);
      task.start = addDays(task.start, delta);
      task.end = addDays(task.end, delta);
      if (task.origEnd) task.origEnd = addDays(task.origEnd,delta);
      ns.actions.persist(ctx); ns.render.renderAll(ctx);
      ns.actions.showToast(ctx, `日期条已平移 ${delta > 0 ? '+' : ''}${delta} 天`);
    }, true);
    // Native DnD is captured before chip reordering handlers inside individual dates.
    grid.addEventListener('dragover', event => {
      if (!availableProject(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      const cell = event.target.closest('.day[data-date]');
      if (hoverCell !== cell) {
        if (hoverCell) hoverCell.classList.remove('schedule-drop-target');
        hoverCell = cell;
        if (cell) cell.classList.add('schedule-drop-target');
      }
      if (cell) showTip(`安排至 ${dateDisplay(cell.dataset.date)}`, event.clientX, event.clientY);
      else hideTip();
    }, true);
    grid.addEventListener('drop', event => {
      if (!availableProject(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const target = event.target.closest('.day[data-date]');
      const id = dropProjectId(event);
      clearDrag();
      if (target && id) planProject(id, target.dataset.date);
    }, true);
    grid.addEventListener('click', event => {
      if (!pickProject) return;
      const day = event.target.closest('.day[data-date]');
      if (!day) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const id = pickProject;
      endPick();
      planProject(id, day.dataset.date);
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { endPick(); clearDrag(); unlockCards(); if (resizing) finishResize(false); if (moving) stopMove(false); if (painting) stopPaint(false); } });

    function makeGrip(side, scope, task) {
      const grip = document.createElement('span');
      grip.className = `date-resize-handle resize-${side}`;
      grip.dataset.side = side;
      grip.dataset.taskId = task.id;
      grip.dataset.scope = scope;
      grip.tabIndex = 0;
      grip.setAttribute('role', 'button');
      grip.setAttribute('aria-label', `调整「${task.title}」${side === 'start' ? '开始' : '结束'}日期，方向键可微调`);
      grip.title = side === 'start' ? '拖动调整开始日期' : '拖动调整结束日期';
      grip.addEventListener('click', event => { event.stopPropagation(); event.preventDefault(); });
      grip.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const actual = ctx.state.tasks.find(t => t.id === task.id);
        if (!actual) return;
        const diff = event.key === 'ArrowRight' ? 1 : -1;
        const proposed = addDays(actual[side], diff);
        if (side === 'start' && proposed > actual.end) return;
        if (side === 'end' && proposed < actual.start) return;
        actual[side] = proposed;
        if (actual.origEnd) actual.origEnd = actual.end;
        ns.actions.persist(ctx);
        ns.render.renderAll(ctx);
        requestAnimationFrame(() => {
          const newGrip = [...document.querySelectorAll(".date-resize-handle")].find(el => el.dataset.taskId === task.id && el.dataset.side === side && el.dataset.scope === scope);
          newGrip?.focus();
        });
        ns.actions.showToast(ctx, `${dateDisplay(actual.start)} — ${dateDisplay(actual.end)}`);
      });
      return grip;
    }
    function decorateTimeline() {
      timeline.querySelectorAll('.task-bar[data-task-id]').forEach(bar => {
        if (bar.dataset.resizeEnhanced) return;
        const task = ctx.state.tasks.find(t => t.id === bar.dataset.taskId);
        if (!task) return;
        bar.dataset.resizeEnhanced = 'true';
        // The bar body moves the entire date range; sorting remains available
        // through a dedicated draggable grip, not by stealing pointer drags.
        bar.draggable = false;
        const sortHandle = document.createElement('span');
        sortHandle.className = 'task-sort-handle';
        sortHandle.draggable = true;
        sortHandle.textContent = '⠿';
        sortHandle.setAttribute('aria-label','拖动以调整日期条排序');
        sortHandle.title = '拖动排序';
        const label = document.createElement('span');
        label.className = 'task-bar-title';
        label.textContent = bar.textContent;
        bar.textContent = '';
        bar.append(makeGrip('start', 'timeline', task), sortHandle, label, makeGrip('end', 'timeline', task));
        bar.setAttribute('aria-description', '左右端点调整时长，中间拖动整体移动；⠿ 手柄调整排序；点击编辑');
      });
    }
    function decorateCalendar() {
      grid.querySelectorAll('.day[data-date]').forEach(day => {
        day.querySelectorAll('.task-chip[data-task-id]').forEach(chip => {
          if (chip.dataset.resizeEnhanced) return;
          const task = ctx.state.tasks.find(t => t.id === chip.dataset.taskId);
          if (!task) return;
          chip.dataset.resizeEnhanced = 'true';
          const date = day.dataset.date;
          if (task.start === date) chip.prepend(makeGrip('start', 'calendar', task));
          if (task.end === date) chip.append(makeGrip('end', 'calendar', task));
        });
      });
    }

    const decoratedRender = (name, decorator) => {
      const original = ns.render[name];
      ns.render[name] = function (...args) {
        const value = original.apply(ns.render, args);
        decorator();
        return value;
      };
    };
    decoratedRender('renderAll', () => { decorateProjects(); decorateTimeline(); decorateCalendar(); });
    decoratedRender('renderProjects', decorateProjects);
    decoratedRender('renderTimeline', decorateTimeline);
    decoratedRender('renderCalendar', decorateCalendar);
    decorateProjects(); decorateTimeline(); decorateCalendar();

    function preview(resize) {
      const rangeText = `${dateDisplay(resize.previewStart)} — ${dateDisplay(resize.previewEnd)}`;
      if (resize.scope === 'timeline' && resize.bar?.isConnected) {
        const bar = resize.bar;
        const y = ctx.state.viewDate.getFullYear(), m = ctx.state.viewDate.getMonth();
        bar.classList.add(resize.scope === 'timeline' && resize.delta !== undefined ? 'is-moving' : 'is-resizing');
        bar.dataset.rangeLabel = rangeText;
        bar.style.gridColumn = `${ns.tasks.clampToMonth(ctx, resize.previewStart, y, m)} / ${ns.tasks.clampToMonth(ctx, resize.previewEnd, y, m) + 1}`;
      } else {
        grid.querySelectorAll('.day[data-date]').forEach(day => {
          const inside = day.dataset.date >= resize.previewStart && day.dataset.date <= resize.previewEnd;
          day.classList.toggle('schedule-range-preview', inside);
        });
      }
      showTip(rangeText, resize.lastX ?? resize.x, resize.lastY ?? resize.y);
    }
    function finishResize(commit) {
      const resize = resizing;
      if (!resize) return;
      resizing = null;
      document.body.classList.remove('schedule-resizing');
      grid.querySelectorAll('.schedule-range-preview').forEach(el => el.classList.remove('schedule-range-preview'));
      hideTip();
      if (resize.bar) resize.bar.draggable = false;
      if (resize.grip.hasPointerCapture?.(resize.pointerId)) {
        try { resize.grip.releasePointerCapture(resize.pointerId); } catch (_) {}
      }
      if (commit && resize.changed) {
        const task = ctx.state.tasks.find(t => t.id === resize.taskId);
        if (task) {
          task.start = resize.previewStart;
          task.end = resize.previewEnd;
          if (task.origEnd) task.origEnd = task.end;
          ns.actions.persist(ctx);
          ns.render.renderAll(ctx);
          ns.actions.showToast(ctx, `已调整至 ${dateDisplay(task.start)} — ${dateDisplay(task.end)}`);
        }
      } else if (resize.bar?.isConnected) {
        // Do not leave an obsolete preview in the DOM after cancelling.
        ns.render.renderTimeline(ctx);
      }
      if (resize.changed) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 150);
      }
    }
    function cellUnderPointer(x, y) {
      const target = document.elementFromPoint(x, y)?.closest('.day[data-date]');
      return target && grid.contains(target) ? target : null;
    }
    // Pointer controls: blank calendar days draw a range; timeline bar body
    // translates an existing interval. Touch continues using the original
    // day tap/scroll UI (no accidental hijacking of mobile scrolling).
    const drawRange = () => {
      grid.querySelectorAll('.schedule-range-preview').forEach(el=>el.classList.remove('schedule-range-preview'));
      if (!painting?.active) return;
      const start = painting.start <= painting.end ? painting.start : painting.end;
      const end = painting.start <= painting.end ? painting.end : painting.start;
      grid.querySelectorAll('.day[data-date]').forEach(day=>{
        day.classList.toggle('schedule-range-preview', day.dataset.date >= start && day.dataset.date <= end);
      });
      showTip(`${dateDisplay(start)} — ${dateDisplay(end)}`, painting.x, painting.y);
    };
    const updateMove = () => {
      if (!moving || !moving.active) return;
      const diff = Math.round((moving.x - moving.startX + (wrapper?.scrollLeft || 0) - moving.scrollStart) / moving.width);
      moving.delta = Math.max(-730, Math.min(730,diff));
      moving.previewStart = addDays(moving.start, moving.delta);
      moving.previewEnd = addDays(moving.end,moving.delta);
      preview(moving);
    };
    function openRangeEditor(start,end) {
      if (ctx.state.editorMode !== 'modal') ns.actions.applyEditorMode(ctx, 'modal');
      ns.bindings.openTaskEditorModal(ctx);
      const form = document.getElementById('task-form-modal');
      if (!form) return;
      const startField=form.elements.namedItem('start');
      const endField=form.elements.namedItem('end');
      if(startField)startField.value=start;
      if(endField)endField.value=end;
      form.elements.namedItem('title')?.focus();
    }
    function stopPaint(commit) {
      const range = painting;
      if (!range) return;
      painting=null;
      grid.querySelectorAll('.schedule-range-preview').forEach(el=>el.classList.remove('schedule-range-preview'));
      hideTip();
      document.body.classList.remove('schedule-painting');
      if (commit && range.active && range.end !== range.start) {
        const start = range.start < range.end ? range.start : range.end;
        const end = range.start < range.end ? range.end : range.start;
        suppressClick=true;
        setTimeout(()=>{suppressClick=false;},300);
        if(pickProject) {
          const id=pickProject; endPick(); planProject(id,start,end);
        } else openRangeEditor(start,end);
      }
    }
    function stopMove(commit) {
      const move=moving;
      if (!move) return;
      moving=null;
      if (move.bar?.isConnected) move.bar.classList.remove('is-moving');
      document.body.classList.remove('schedule-moving');
      hideTip();
      if (commit && move.active && move.delta) {
        const task=ctx.state.tasks.find(t=>t.id===move.taskId);
        if(task) {
          task.start=move.previewStart;
          task.end=move.previewEnd;
          if(task.origEnd)task.origEnd=addDays(task.origEnd,move.delta);
          ns.actions.persist(ctx);
          ns.render.renderAll(ctx);
          ns.actions.showToast(ctx, `已整体平移 ${move.delta > 0 ? '+' : ''}${move.delta} 天`);
        }
      } else if (move.active) ns.render.renderTimeline(ctx);
      if (move.active) { suppressClick=true; setTimeout(()=>{suppressClick=false;},300); }
    }
    document.addEventListener('pointerdown', event=>{
      if (event.button !== 0 || (event.pointerType !== 'mouse' && event.pointerType !== 'pen') || moving || painting || resizing) return;
      if (event.target.closest?.('.date-resize-handle, .task-sort-handle, input,button,select,textarea,a')) return;
      const bar=event.target.closest?.('.task-bar[data-task-id]');
      if (bar && timeline.contains(bar)) {
        const task=ctx.state.tasks.find(t=>t.id===bar.dataset.taskId);
        if (!task) return;
        const w=ctx.els.timelineHeader.firstElementChild?.getBoundingClientRect().width || 24;
        moving={taskId:task.id,scope:'timeline',start:task.start,end:task.end,
          previewStart:task.start,previewEnd:task.end,delta:0,width:Math.max(w,5),
          bar,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,
          pointerId:event.pointerId,scrollStart:wrapper?.scrollLeft || 0,active:false};
        return;
      }
      const day=event.target.closest?.('.day[data-date]');
      if (!day || !grid.contains(day) || event.target.closest?.('.task-chip,.day-more')) return;
      painting={start:day.dataset.date,end:day.dataset.date,startX:event.clientX,startY:event.clientY,
        x:event.clientX,y:event.clientY,pointerId:event.pointerId,active:false};
    },true);
    document.addEventListener('pointermove',event=>{
      if (moving?.pointerId === event.pointerId) {
        moving.x=event.clientX; moving.y=event.clientY;
        if (!moving.active && Math.hypot(event.clientX-moving.startX,event.clientY-(moving.startY||event.clientY)) >= MOVE_THRESHOLD) {
          moving.active=true; document.body.classList.add('schedule-moving');
        }
        if (moving.active) {event.preventDefault(); updateMove();}
      }
      if (painting?.pointerId === event.pointerId) {
        painting.x=event.clientX;painting.y=event.clientY;
        const cell=cellUnderPointer(event.clientX,event.clientY);
        if(cell && cell.dataset.date !== painting.start) painting.active=true;
        if(painting.active) {
          event.preventDefault();
          if(cell) painting.end=cell.dataset.date;
          drawRange();
        }
      }
    },true);
    document.addEventListener('pointerup',event=>{
      if(moving?.pointerId===event.pointerId) { if(moving.active){event.preventDefault();event.stopImmediatePropagation();}stopMove(true); }
      if(painting?.pointerId===event.pointerId) { if(painting.active){event.preventDefault();event.stopImmediatePropagation();}stopPaint(true); }
    },true);
    document.addEventListener('pointercancel',event=>{
      if(moving?.pointerId===event.pointerId)stopMove(false);
      if(painting?.pointerId===event.pointerId)stopPaint(false);
    },true);
    // Smooth edge scrolling, shared by move/resize/paint and native project DnD.
    // The loop runs only while a pointer operation is active.
    let nativeDrag = false, nativeX = 0, nativeY = 0;
    document.addEventListener('dragover',event=>{
      if(!availableProject(event) && !movedChip && !ctx.runtime.draggingTaskId)return;
      nativeDrag=true;nativeX=event.clientX;nativeY=event.clientY;
      if(!scrollingFrame)scrollingFrame=requestAnimationFrame(autoScroll);
    },true);
    // Calendar drop handlers stop event propagation. Capture-phase cleanup is
    // necessary or the scrolling RAF can keep running after a successful drop.
    document.addEventListener('dragend',()=>{nativeDrag=false;},true);
    document.addEventListener('drop',()=>{nativeDrag=false;},true);
    function autoScroll() {
      scrollingFrame=0;
      const active=moving||resizing||painting;
      if(!active && !nativeDrag)return;
      const x=active?.x ?? active?.lastX ?? nativeX;
      const y=active?.y ?? active?.lastY ?? nativeY;
      if(wrapper && (moving || resizing?.scope === 'timeline' || (nativeDrag && ctx.runtime.draggingTaskId))) {
        const rect=wrapper.getBoundingClientRect();
        if(y>=rect.top-20 && y<=rect.bottom+20) {
          const left=x-rect.left,right=rect.right-x;
          const vx=left<58?-Math.max(2,Math.ceil((58-left)/4)):right<58?Math.max(2,Math.ceil((58-right)/4)):0;
          if(vx) {
            const before=wrapper.scrollLeft;wrapper.scrollLeft+=vx;
            if(moving?.active && wrapper.scrollLeft!==before)updateMove();
            if(resizing && resizing.scope==='timeline' && wrapper.scrollLeft!==before) {
              const r=resizing;
              const diff=Math.round((r.lastX-r.startX+wrapper.scrollLeft-r.scrollStart)/r.width);
              const next=addDays(r.side==='start'?r.start:r.end,diff);
              if(r.side==='start')r.previewStart=next>r.end?r.end:next;else r.previewEnd=next<r.start?r.start:next;
              r.changed=r.previewStart!==r.start||r.previewEnd!==r.end;preview(r);
            }
          }
        }
      }
      if(painting || resizing?.scope==='calendar' || (nativeDrag && (draggingProject||movedChip))) {
        const velocity=y<55?-Math.ceil((55-y)/5):y>innerHeight-55?Math.ceil((y-(innerHeight-55))/5):0;
        if(velocity)window.scrollBy(0, Math.max(-16,Math.min(16,velocity)));
        if(painting?.active) {
          const day=cellUnderPointer(painting.x,painting.y);
          if(day && day.dataset.date!==painting.end){painting.end=day.dataset.date;drawRange();}
        }
      }
      scrollingFrame=requestAnimationFrame(autoScroll);
    }
    document.addEventListener('pointermove',event=>{
      if((moving||resizing||painting) && !scrollingFrame)scrollingFrame=requestAnimationFrame(autoScroll);
    },true);
    // Keyboard: Shift+Left/Right shifts a focused timeline task by one day.
    timeline.addEventListener('keydown',event=>{
      if(!event.shiftKey || !['ArrowLeft','ArrowRight'].includes(event.key) || event.target.closest('.date-resize-handle'))return;
      const bar=event.target.closest('.task-bar[data-task-id]');
      if(!bar)return;
      const task=ctx.state.tasks.find(t=>t.id===bar.dataset.taskId);
      if(!task)return;
      event.preventDefault();event.stopPropagation();
      const delta=event.key==='ArrowRight'?1:-1;
      task.start=addDays(task.start,delta);task.end=addDays(task.end,delta);
      if(task.origEnd)task.origEnd=addDays(task.origEnd,delta);
      ns.actions.persist(ctx);ns.render.renderAll(ctx);
      timeline.querySelector(`.task-bar[data-task-id="${CSS.escape(task.id)}"]`)?.focus();
    });
    document.addEventListener('pointerdown', event => {
      const grip = event.target.closest?.('.date-resize-handle');
      if (!grip || event.button !== 0 || resizing) return;
      const task = ctx.state.tasks.find(t => t.id === grip.dataset.taskId);
      if (!task) return;
      event.preventDefault(); event.stopPropagation();
      const bar = grip.closest('.task-bar');
      if (bar) bar.draggable = false;
      const width = ctx.els.timelineHeader.firstElementChild?.getBoundingClientRect().width || 24;
      resizing = {
        taskId: task.id, side: grip.dataset.side, scope: grip.dataset.scope,
        start: task.start, end: task.end, previewStart: task.start, previewEnd: task.end,
        bar, grip, pointerId: event.pointerId, startX: event.clientX,
        lastX: event.clientX, lastY: event.clientY, width: Math.max(5, width),
        scrollStart: wrapper?.scrollLeft || 0,
        changed: false
      };
      document.body.classList.add('schedule-resizing');
      grip.setPointerCapture?.(event.pointerId);
    }, true);
    document.addEventListener('pointermove', event => {
      const r = resizing;
      if (!r || r.pointerId !== event.pointerId) return;
      r.lastX = event.clientX; r.lastY = event.clientY;
      let next;
      if (r.scope === 'calendar') {
        const target = cellUnderPointer(event.clientX, event.clientY);
        if (!target) return;
        next = target.dataset.date;
      } else {
        const diff = Math.round(((event.clientX - r.startX) + (wrapper?.scrollLeft || 0) - (r.scrollStart || 0)) / r.width);
        next = addDays(r.side === 'start' ? r.start : r.end, Math.max(-366, Math.min(366, diff)));
      }
      if (r.side === 'start') r.previewStart = next > r.end ? r.end : next;
      else r.previewEnd = next < r.start ? r.start : next;
      r.changed = r.previewStart !== r.start || r.previewEnd !== r.end;
      preview(r);
    }, true);
    document.addEventListener('pointerup', event => {
      if (resizing && event.pointerId === resizing.pointerId) {
        event.preventDefault(); event.stopPropagation(); finishResize(true);
      }
    }, true);
    document.addEventListener('pointercancel', event => {
      if (resizing && event.pointerId === resizing.pointerId) finishResize(false);
    }, true);
    document.addEventListener('click', event => {
      if (suppressClick && event.target.closest?.('.task-bar, .task-chip, .day[data-date]')) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); suppressClick = false;
      }
    }, true);
  }
  ns.dragSchedule.init = init;
})(window.CamenCalendar = window.CamenCalendar || {});
