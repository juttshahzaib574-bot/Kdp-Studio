// Module: Live Preview Carousel
// Auto-advances the active queued puzzle every N ms so a creator watching the Live
// Preview panel sees the whole batch cycle through in sequence without manual clicks.
// Manual prev/next restarts the timer so the next auto-advance is always a full
// interval away, matching the reference carousel's prevBtn/nextBtn behavior.

export function createCarouselController({ intervalMs = 3000, onTick } = {}) {
  let timer = null;

  function start() {
    if (timer) return;
    timer = setInterval(() => onTick?.(), intervalMs);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    restart() {
      stop();
      start();
    },
    get isRunning() {
      return timer !== null;
    },
  };
}
