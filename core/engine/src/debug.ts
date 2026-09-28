// Opt-in diagnostic logging, off by default. Two switches: env DEBUG=1 (Node, headless smokes;
// mirrored onto globalThis.__SYMBIOTE_DEBUG__ at bootstrap, so toggling it needs a Metro
// --reset-cache, not a rebuild), or setting globalThis.__SYMBIOTE_DEBUG__ directly.

// A template literal argument is built at the CALL SITE regardless of the switch, so
// `dlog(\`… ${expensive()}\`)` on a hot path pays its full cost with logging off. Pass a thunk
// instead — `dlog(() => \`…\`)` — so the message is only built once the switch is on.

declare global {
  var __SYMBIOTE_DEBUG__: boolean | undefined;
}

// Read ONCE, at module load: `process.env` is not a plain object in Node, each property read
// crosses into the host environment, and isDebug() runs on the per-node commit path — costly in
// Node, cheap on a native host where `process` is just a shim.

// Safe to freeze: nothing toggles the env switch mid-process, every runtime toggle goes through
// the dynamic __SYMBIOTE_DEBUG__ instead.
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
