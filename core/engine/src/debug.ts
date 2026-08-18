// Opt-in diagnostic logging, off by default. Two switches, either flips it on:
//   - env: DEBUG=1 — read directly off process.env.DEBUG at call time (Node,
//     headless smokes); each example's index.js also mirrors it onto
//     globalThis.__SYMBIOTE_DEBUG__ once at start, so changing it needs a fresh
//     Metro start (--reset-cache), not a rebuild.
//   - runtime: globalThis.__SYMBIOTE_DEBUG__ = true, an escape hatch for hosts
//     where the env isn't reachable.
// Production with neither set pays one property read per call and nothing else -
// but ONLY if the caller does not build the message itself first. A template
// literal is evaluated at the CALL SITE, before dlog can decide anything, so a
// `dlog(\`… ${JSON.stringify(x)}\`)` on a per-frame path costs its full price with
// logging off. On a hot path (a getter Angular re-reads every change-detection
// pass, an Animated reconcile, a scroll-driven apply) pass a THUNK instead:
// `dlog(() => \`…\`)` - it is only called once the switch is on.

declare global {
  var __SYMBIOTE_DEBUG__: boolean | undefined;
}

function envEnabled(): boolean {
  return typeof process !== 'undefined' && process.env.DEBUG === '1';
}

export function isDebug(): boolean {
  return globalThis.__SYMBIOTE_DEBUG__ === true || envEnabled();
}

export function dlog(message: string | (() => string)): void {
  if (!isDebug()) return;
  console.log(
    `[symbiote] ${typeof message === 'function' ? message() : message}`,
  );
}
