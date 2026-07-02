// Opt-in diagnostic logging, off by default. Two switches, either flips it on:
//   - env: DEBUG=1 — read directly off process.env.DEBUG at call time (Node,
//     headless smokes); each example's index.js also mirrors it onto
//     globalThis.__SYMBIOTE_DEBUG__ once at start, so changing it needs a fresh
//     Metro start (--reset-cache), not a rebuild.
//   - runtime: globalThis.__SYMBIOTE_DEBUG__ = true, an escape hatch for hosts
//     where the env isn't reachable.
// Production with neither set pays one property read per call and nothing else.

declare global {
  var __SYMBIOTE_DEBUG__: boolean | undefined;
}

function envEnabled(): boolean {
  return typeof process !== 'undefined' && process.env.DEBUG === '1';
}

export function isDebug(): boolean {
  return globalThis.__SYMBIOTE_DEBUG__ === true || envEnabled();
}

export function dlog(message: string): void {
  if (isDebug()) console.log(`[symbiote] ${message}`);
}
