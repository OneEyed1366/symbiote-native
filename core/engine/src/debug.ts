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

// Read ONCE, at module load. `process.env` is not a plain object in Node - each property read
// crosses into the host environment - and isDebug() is called on the per-node commit path, so the
// per-call read showed up as 17% of self time in a create-path CPU profile (headless; on a native
// host `process` is a shim and the read is cheap, so treat that figure as a Node one).
//
// Safe to freeze because nothing toggles the ENV switch mid-process: every runtime toggle in the
// repo goes through __SYMBIOTE_DEBUG__ below, which stays dynamic, and bootstrap mirrors the env
// onto it at start anyway.
const envDebug = typeof process !== 'undefined' && process.env.DEBUG === '1';

export function isDebug(): boolean {
  return envDebug || globalThis.__SYMBIOTE_DEBUG__ === true;
}

export function dlog(message: string | (() => string)): void {
  if (!isDebug()) return;
  console.log(
    `[symbiote] ${typeof message === 'function' ? message() : message}`,
  );
}
