// Engineering calendar entrypoint (split from the previous monolithic app.js)

document.addEventListener("DOMContentLoaded", () => {
  const ns = window.CamenCalendar;
  const ctx = ns.core.createContext();
  ns.bindings.init(ctx);
});
