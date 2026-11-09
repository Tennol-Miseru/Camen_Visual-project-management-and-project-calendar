/* Camen reliability: bounded undo/redo, local recovery points and safe imports.
   No server, no data-format migration. */
(function (ns) {
  'use strict';
  ns.stability = ns.stability || {};
  const SNAP_KEY = 'camen_recovery_snapshots_v1';
  const GOOD_KEY = 'camen_last_good_v1';
  const MAX_UNDO = 45;
  const MAX_BACKUPS = 8;
  const json = value => JSON.stringify(value);
  const copy = value => JSON.parse(json(value));
  const stamp = () => new Date().toISOString();
  const validDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const [y,m,d] = value.split('-').map(Number);
    const v = new Date(y, m - 1, d);
    return v.getFullYear() === y && v.getMonth() === m - 1 && v.getDate() === d;
  };
  const validPayload = data => data && Array.isArray(data.tasks) && Array.isArray(data.projects);

  function init(ctx) {
    const undoStack = [], redoStack = [];
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const dialog = document.getElementById('history-dialog');
    const entries = document.getElementById('history-list');
    let last = json({projects: ctx.state.projects, tasks: ctx.state.tasks});
    let restoring = false;
    let lastChangeTime = 0;
    let lastChangeWasSlider = false;
    const parse = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
    const getState = () => ({ projects:copy(ctx.state.projects), tasks:copy(ctx.state.tasks) });
    const refresh = () => {
      if (undoBtn) undoBtn.disabled = undoStack.length === 0;
      if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    };
    const notify = message => ns.actions.showToast(ctx, message);
    const writeRaw = (key, value) => localStorage.setItem(key, json(value));
    const safeSnapshot = (snapshot, label, force = false) => {
      const data = validPayload(snapshot) ? snapshot : getState();
      const prior = parse(SNAP_KEY, []);
      const backups = Array.isArray(prior) ? prior.filter(v => validPayload(v?.data)) : [];
      const recent = backups[0];
      if (!force && recent && Date.now() - Date.parse(recent.at) < 3 * 60 * 1000) return true;
      if (recent && json(recent.data) === json(data)) return true;
      backups.unshift({at:stamp(), label, data:copy(data)});
      try {
        writeRaw(SNAP_KEY, backups.slice(0, MAX_BACKUPS));
        return true;
      } catch (err) {
        // Storage quota: progressively reduce old snapshots; never remove the newest.
        for (let n = Math.min(MAX_BACKUPS - 1, backups.length - 1); n >= 1; n--) {
          try { writeRaw(SNAP_KEY, backups.slice(0,n)); return true; } catch (_) {}
        }
        return false;
      }
    };
    const restore = (snapshot, reason) => {
      if (!validPayload(snapshot)) return false;
      restoring = true;
      ctx.state.projects = copy(snapshot.projects);
      ctx.state.tasks = copy(snapshot.tasks);
      ctx.state.filterProjectId = '';
      ctx.state.filterStepId = null;
      try {
        // Reuse the canonical persistence path, but suppress history instrumentation.
        originalPersist(ctx);
        last = json(getState());
        try { writeRaw(GOOD_KEY, {at:stamp(), data:getState()}); } catch (_) {}
      } catch (error) {
        alert(`恢复保存失败：${error.message}`);
        restoring = false;
        return false;
      }
      restoring = false;
      ns.render.renderAll(ctx);
      refresh();
      notify(reason);
      return true;
    };
    const undo = () => {
      if (!undoStack.length) return;
      const previous = undoStack.pop();
      redoStack.push(copy(getState()));
      restore(previous, '已撤销 · Ctrl+Shift+Z 可重做');
    };
    const redo = () => {
      if (!redoStack.length) return;
      const next = redoStack.pop();
      undoStack.push(copy(getState()));
      restore(next, '已重做');
    };
    const originalPersist = ns.actions.persist;
    const originalShowToast = ns.actions.showToast;
    ns.actions.showToast = function (c, message) {
      originalShowToast(c,message);
      if (c !== ctx || !undoStack.length || /^已撤销|^已重做/.test(message)) return;
      const button=document.createElement('button');
      button.className='toast-undo';button.type='button';button.textContent='撤销';
      button.setAttribute('aria-label','撤销最近一次数据修改');
      button.addEventListener('click',event=>{event.stopPropagation();undo();});
      c.els.toast?.append(button);
    };
    ns.actions.persist = function (c) {
      if (c !== ctx) return originalPersist(c);
      const next = json(getState());
      if (restoring || next === last) return originalPersist(c);
      const previous = JSON.parse(last);
      const now = Date.now();
      const slider = Boolean(document.activeElement?.closest?.('.project-manual-progress'));
      const combineSlider = slider && lastChangeWasSlider && now - lastChangeTime < 950 && undoStack.length > 0;
      if (!combineSlider) {
        undoStack.push(previous);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
      }
      redoStack.length = 0;
      safeSnapshot(previous, '自动安全快照');
      try {
        originalPersist(c);
        last = next;
        try { writeRaw(GOOD_KEY, {at:stamp(), data:getState()}); } catch (_) {}
      } catch (error) {
        // A two-key legacy write may stop halfway. Attempt to roll both keys back.
        // The last-good record and recovery snapshots remain available if quota
        // or browser failures prevent the rollback too.
        ctx.state.projects = previous.projects;
        ctx.state.tasks = previous.tasks;
        try { originalPersist(c); } catch (_) {}
        if (!combineSlider) undoStack.pop();
        ns.render.renderAll(ctx);
        alert(`数据未能保存（可能是浏览器空间不足）：${error.message}\n请先导出备份并释放浏览器存储空间。`);
        return;
      }
      lastChangeTime = now;
      lastChangeWasSlider = slider;
      refresh();
    };
    undoBtn?.addEventListener('click', undo);
    redoBtn?.addEventListener('click', redo);
    document.addEventListener('keydown', event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
      if (event.target.closest('input,textarea,[contenteditable="true"]')) return;
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    });
    const currentBackups = () => {
      const list = parse(SNAP_KEY, []);
      return Array.isArray(list) ? list.filter(item => validPayload(item?.data)) : [];
    };
    function renderBackups() {
      if (!entries) return;
      entries.replaceChildren();
      const backups = currentBackups();
      if (!backups.length) {
        const p = document.createElement('p'); p.className='muted'; p.textContent='暂无历史快照。点击“立即创建快照”可保存当前版本。'; entries.append(p); return;
      }
      backups.forEach((item, i) => {
        const row = document.createElement('div'); row.className='recovery-row';
        const info = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = new Date(item.at).toLocaleString('zh-CN');
        const sub = document.createElement('small'); sub.textContent = `${item.label || '历史快照'} · ${item.data.projects.length} 工程 / ${item.data.tasks.length} 日程`;
        info.append(title,sub);
        const buttons = document.createElement('div'); buttons.className='recovery-actions';
        const exportButton = document.createElement('button'); exportButton.type='button'; exportButton.textContent='导出';
        exportButton.addEventListener('click', () => {
          const blob = new Blob([json({...item.data, exportedAt:item.at})], {type:'application/json'});
          const url = URL.createObjectURL(blob);
          const a=document.createElement('a'); a.href=url; a.download=`camen-recovery-${item.at.slice(0,10)}-${i+1}.json`;
          document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
        });
        const restoreButton = document.createElement('button'); restoreButton.type='button'; restoreButton.textContent='恢复';
        restoreButton.addEventListener('click', () => {
          if (!confirm(`将工程和日程恢复到 ${new Date(item.at).toLocaleString('zh-CN')}？\n当前内容会先生成一份安全快照，且本次恢复可以撤销。`)) return;
          if (!safeSnapshot(getState(), '恢复前备份', true)) { alert('无法建立恢复前备份，请先导出 JSON。'); return; }
          undoStack.push(copy(getState())); redoStack.length=0;
          if (restore(item.data, '历史快照已恢复')) { dialog?.close(); }
        });
        buttons.append(exportButton,restoreButton); row.append(info,buttons); entries.append(row);
      });
    }
    document.getElementById('snapshots-btn')?.addEventListener('click',()=>{ renderBackups(); dialog?.showModal(); });
    document.getElementById('snapshot-new')?.addEventListener('click',()=>{
      const ok=safeSnapshot(getState(),'手动快照',true); renderBackups(); notify(ok?'当前数据已保存为快照':'空间不足，无法创建快照');
    });
    document.getElementById('history-close')?.addEventListener('click',()=>dialog?.close());
    dialog?.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    // Recovery from a browser write interruption: do not auto-overwrite existing user data.
    try {
      const rawProjects = localStorage.getItem('calendar_projects');
      const rawTasks = localStorage.getItem('calendar_tasks');
      const lastGood = parse(GOOD_KEY,null);
      let broken = !rawProjects || !rawTasks;
      if (!broken) {
        try { broken = !Array.isArray(JSON.parse(rawProjects)) || !Array.isArray(JSON.parse(rawTasks)); }
        catch (_) { broken = true; }
      }
      if (broken && lastGood && validPayload(lastGood.data) &&
          (lastGood.data.projects.length || lastGood.data.tasks.length)) {
        if (confirm('检测到本地日历数据不完整，是否尝试恢复上一次成功保存的内容？')) restore(lastGood.data, '已恢复上一次有效数据');
      }
    } catch (_) {}
    refresh();
    ns.stability.undo = undo;
    ns.stability.redo = redo;
    ns.stability.beforeImport = c => {
      if (c !== ctx) return false;
      return safeSnapshot(getState(), '导入之前的完整备份', true);
    };
    ns.stability.validDate = validDate;
  }
  ns.stability.init = init;
})(window.CamenCalendar = window.CamenCalendar || {});
