// Module: The 3-Second Looping Interface
// Auto-toggles between the print-asset state and the solved state so creators don't
// have to click back and forth to evaluate their work. Manual override pauses it.

export function createLoopController({ intervalMs = 3000, onChange } = {}) {
  let state = "print"; // 'print' | 'solved'
  let timer = null;
  let paused = false;

  function tick() {
    if (paused) return;
    state = state === "print" ? "solved" : "print";
    onChange?.(state);
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    get isPaused() {
      return paused;
    },
    get state() {
      return state;
    },
    setState(next) {
      state = next;
      onChange?.(state);
    },
  };
}
