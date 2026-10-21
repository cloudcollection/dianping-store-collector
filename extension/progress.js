/* Counts only work acknowledged by the task state. */
(() => {
  function from(state = {}) {
    const queue = Array.isArray(state.queue) ? state.queue : [];
    let total = 0,
      current = 0;
    if (state.mode === "detail") {
      total = queue.length;
      current =
        Number(state.completedCount || 0) + Number(state.skippedCount || 0);
    } else if (state.mode === "search") {
      total = Number(state.maxPages || 0);
      current = Number(state.pagesDone || 0);
    }
    total = Number.isFinite(total) ? Math.max(0, total) : 0;
    current = Number.isFinite(current)
      ? Math.min(total, Math.max(0, current))
      : 0;
    return {
      current,
      total,
      percent: total ? Math.round((current / total) * 100) : 0,
    };
  }
  const api = { from };
  globalThis.CollectorProgress = api;
  if (typeof module !== "undefined") module.exports = api;
})();
