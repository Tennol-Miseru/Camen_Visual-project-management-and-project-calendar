(function (ns) {
  "use strict";

  ns.core = ns.core || {};

  function createStorage() {
    return {
      load(key, fallback) {
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : fallback;
        } catch {
          return fallback;
        }
      },
      save(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    };
  }

  function createUuid() {
    let uid = Date.now();
    return () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${uid++}`);
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  function toDateStrLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function dateStrOffset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return toDateStrLocal(d);
  }

  function monthEnd(startStr) {
    // extend to the end of the next month
    const [y, m] = startStr.split("-").map(Number);
    return toDateStrLocal(new Date(y, m + 1, 0));
  }

  function parseDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function createContext() {
    const storage = createStorage();
    const uuid = createUuid();
    const sfx = {
      click: new Audio("sounds/tf2-button-click-release.mp3"),
      save: new Audio("sounds/savepoint.mp3")
    };
    Object.values(sfx).forEach((a) => {
      a.preload = "auto";
      a.muted = false;
      try { a.load(); } catch (_) {}
    });

    const seedProjects = [];
    const seedTasks = [];

    const state = {
      tasks: storage.load("calendar_tasks", seedTasks),
      projects: storage.load("calendar_projects", seedProjects),
      viewDate: new Date(),
      filterProjectId: "",
      filterStepId: null,
      timelineZoom: storage.load("calendar_timeline_zoom", 1),
      fpdEnabled: storage.load("calendar_fpd", false),
      muted: storage.load("calendar_muted", false),
      statsProjectId: null,
      editorMode: storage.load("calendar_editor_mode", "modal")
    };

    const els = {
      tabs: document.querySelectorAll(".tab"),
      views: document.querySelectorAll(".view"),
      calendarView: document.getElementById("calendar-view"),
      projectsView: document.getElementById("projects-view"),
      monthLabel: document.getElementById("month-label"),
      calendarGrid: document.getElementById("calendar-grid"),
      timelineGrid: document.getElementById("timeline-grid"),
      timelineHeader: document.getElementById("timeline-header"),
      legend: document.getElementById("legend"),
      taskForm: document.getElementById("task-form"),
      taskIdInput: document.getElementById("task-id"),
      deleteTaskBtn: document.getElementById("delete-task"),
      taskDone: document.getElementById("task-done"),
      useProjectColor: document.getElementById("use-project-color"),
      taskNewBtn: document.getElementById("task-new-btn"),
      projectNewBtn: document.getElementById("project-new-btn"),
      projectForm: document.getElementById("project-form"),
      projectSelect: document.getElementById("project-select"),
      stepSelect: document.getElementById("step-select"),
      projectsList: document.getElementById("projects-list"),
      stepList: document.getElementById("step-list"),
      addStepBtn: document.getElementById("add-step"),
      projectColor: document.getElementById("project-color"),
      themeSelect: document.getElementById("theme-select"),
      editorModeToggle: document.getElementById("editor-mode-toggle"),
      openTaskEditor: document.getElementById("open-task-editor"),
      openProjectEditor: document.getElementById("open-project-editor"),
      importBtn: document.getElementById("import-btn"),
      exportBtn: document.getElementById("export-btn"),
      importFile: document.getElementById("import-file"),
      importMerge: document.getElementById("import-merge"),
      importOverlay: document.getElementById("import-overlay"),
      importClose: document.getElementById("import-close"),
      importDrop: document.getElementById("import-drop"),
      importChoose: document.getElementById("import-choose"),
      importText: document.getElementById("import-text"),
      importPasteBtn: document.getElementById("import-paste-btn"),
      projectFilter: document.getElementById("project-filter"),
      filterClear: document.getElementById("filter-clear"),
      dualToggle: document.getElementById("dual-toggle"),
      ratioRange: document.getElementById("ratio-range"),
      ratioPill: document.getElementById("ratio-pill"),
      timelineZoom: document.getElementById("timeline-zoom"),
      fpdToggle: document.getElementById("fpd-toggle"),
      muteToggle: document.getElementById("mute-toggle"),
      noEnd: document.getElementById("no-end"),
      startDate: document.getElementById("start-date"),
      endDate: document.getElementById("end-date"),
      draftList: document.getElementById("draft-list"),
      draftBox: document.getElementById("draft-box"),
      archivedList: document.getElementById("archived-list"),
      archivedBox: document.getElementById("archived-box"),
      projectDraft: document.getElementById("project-draft"),
      toast: document.getElementById("toast"),
      statsContent: document.getElementById("stats-content"),
      statsTitle: document.getElementById("stats-title"),
      statsBack: document.getElementById("stats-back"),
      statsOverlay: document.getElementById("stats-overlay"),
      statsClose: document.getElementById("stats-close"),
      statsOverviewBtn: document.getElementById("stats-overview-btn"),
      themeCycleBtn: document.getElementById("theme-cycle-btn"),
      editorOverlay: document.getElementById("editor-overlay"),
      editorModalTitle: document.getElementById("editor-modal-title"),
      editorModalBody: document.getElementById("editor-modal-body"),
      editorVisibilityToggle: document.getElementById("editor-visibility-toggle"),
      editorClose: document.getElementById("editor-close")
    };

    const ui = {
      projectFormLegend: document.querySelector("#projects-view summary"),
      projectIdInput: document.getElementById("project-id"),
      taskDetails: document.getElementById("task-editor-panel"),
      taskDetailsSummary: document.querySelector("#task-editor-panel summary"),
      taskEditorSlot: document.getElementById("task-editor-slot"),
      projectSubmit: document.querySelector("#project-form button[type='submit']"),
      taskSubmit: document.querySelector("#task-form button[type='submit']"),
      projectDetails: document.getElementById("project-editor-panel"),
      projectDetailsSummary: document.querySelector("#project-editor-panel summary"),
      projectEditorSlot: document.getElementById("project-editor-slot")
    };

    const constants = {
      THEMES: ["black", "white", "gray"],
      RATIO_DEFAULT: 70,
      ZOOM_MIN: 0.2,
      ZOOM_MAX: 4.5,
      CHART_COLORS: ["#00bfa6", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]
    };

    const runtime = {
      stepDraft: [],
      editingTaskId: null,
      editingProjectId: null,
      draggingTaskId: null,
      toastTimer: null,
      isMobile: false,
      sfxPrimed: false,
      currentEditorType: null,
      editorContentVisible: true,
      shredTimer: null
    };

    return { storage, uuid, state, els, ui, constants, runtime, sfx };
  }

  ns.core.createContext = createContext;
  ns.core.clamp = clamp;
  ns.core.toDateStrLocal = toDateStrLocal;
  ns.core.dateStrOffset = dateStrOffset;
  ns.core.monthEnd = monthEnd;
  ns.core.parseDate = parseDate;
})(window.CamenCalendar = window.CamenCalendar || {});
