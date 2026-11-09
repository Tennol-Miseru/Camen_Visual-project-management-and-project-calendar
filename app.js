// Camen engineering calendar entrypoint.
document.addEventListener("DOMContentLoaded", () => {
  const ns = window.CamenCalendar;
  const ctx = ns.core.createContext();
  if (ns.stability) ns.stability.init(ctx);
  ns.bindings.init(ctx);
  if (ns.polish) ns.polish.init(ctx);
  if (ns.delight) ns.delight.init(ctx);
  if (ns.dragSchedule) ns.dragSchedule.init(ctx);
});
