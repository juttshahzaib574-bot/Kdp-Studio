// Central, dependency-free state store shared across all modules.
// Zero-API architecture: state lives only in memory/localStorage — never sent to a server.

const listeners = new Set();

export const state = {
  trimSizeId: "square-8.5",
  dpi: 300,
  bleedEnabled: true,
  edgeToEdgeAsset: false,
  riskAcknowledged: false,
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
