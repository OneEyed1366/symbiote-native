// Condition-based waiting, for tests that need "the framework has settled" rather than "N
// macrotasks have elapsed".
//
// Nearly every suite here spells the wait as `await new Promise(r => setTimeout(r, 0))`, repeated
// two or ten times. That is a PROXY for settling, and it holds only while the machine is idle: a
// macrotask boundary guarantees the queue drained once, not that a batched commit, a zoneless
// change-detection pass, or a press-timing timer has finished. Under a loaded full-suite run the
// proxy breaks, and the failure reads as a product bug — a press that produced no event, change
// detection that never stopped — rather than as the harness giving up early.
//
// Measured 2026-08-19: three tests across two adapters failed only inside a loaded `vitest run`
// and passed in isolation, every one of them on a fixed tick count.
//
// Use `waitUntil` when a condition names what you are waiting for, and `waitForQuiet` when the
// thing to wait for is the ABSENCE of further work. Do not raise a tick count to fix a flake —
// that trades a fast failure for a slow one and keeps the race.

const TICK_MS = 0;
const DEFAULT_TIMEOUT_MS = 2_000;

// A tick count cannot express "no work arrived", only "the queue drained N times" — and how much
// wall time that spans is a property of the machine. Measured 2026-09-02 on the FlatList window:
// exactly one deferred commit lands 30-60 ticks after a 3-tick settle, so an idle machine declared
// quiet before the list's own batch and a loaded one caught it. The producer is RN's VirtualizedList
// batching period (50ms), the longest deferred one in this repo; quiet has to outlast it.
const DEFAULT_QUIET_MS = 75;

// Read off the host rather than imported, the same reason the engine's animations/raf.ts does:
// this package's tsconfig carries no DOM and no Node lib, so the ambient names do not exist.
function tick(): Promise<void> {
  const set = Reflect.get(globalThis, 'setTimeout');
  if (typeof set !== 'function') {
    throw new Error('setTimeout is not available on the host');
  }
  return new Promise(resolve => {
    Reflect.apply(set, globalThis, [resolve, TICK_MS]);
  });
}

function now(): number {
  return Date.now();
}

// Polls `condition` once per macrotask until it holds, then resolves. Throws on timeout with
// `label` in the message, so a genuine product failure still fails the test — loudly, and naming
// what never happened.
export async function waitUntil(
  condition: () => boolean,
  label: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const deadline = now() + timeoutMs;
  while (!condition()) {
    if (now() > deadline) {
      throw new Error(`waitUntil timed out after ${timeoutMs}ms: ${label}`);
    }
    await tick();
  }
}

export interface IQuietOptions {
  /** Consecutive macrotasks the sample must hold. */
  readonly stableTicks?: number;
  /** Wall time the sample must hold, so the settle does not measure machine speed. */
  readonly quietMs?: number;
  readonly timeoutMs?: number;
}

// Waits until `sample` stops changing — for both `stableTicks` consecutive macrotasks and
// `quietMs` of wall time. Returns the settled value so a caller can assert against what actually
// happened rather than re-reading it.
//
// This is the honest way to write a "does not free-run" test: settle FIRST on a real condition,
// then observe. Asserting no-growth over a fixed window without settling first only tests whether
// the machine was fast enough — and a tick-only settle has the same defect one layer in, which is
// why quiet is a duration here and not a count.
export async function waitForQuiet(
  sample: () => number,
  label: string,
  options: IQuietOptions = {},
): Promise<number> {
  const {
    stableTicks = 3,
    quietMs = DEFAULT_QUIET_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const deadline = now() + timeoutMs;
  let last = sample();
  let stable = 0;
  let quietSince = now();
  while (stable < stableTicks || now() - quietSince < quietMs) {
    await tick();
    const current = sample();
    if (current === last) {
      stable += 1;
    } else {
      stable = 0;
      quietSince = now();
    }
    last = current;
    if (now() > deadline) {
      throw new Error(
        `waitForQuiet timed out after ${timeoutMs}ms, still changing: ${label}`,
      );
    }
  }
  return last;
}

// Advances a fixed number of macrotasks. Kept for the cases where the wait genuinely is "let the
// queue drain once" — a commit that is known to be one microtask away — rather than a settle.
export async function advanceTicks(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await tick();
}

// Observes for a DURATION rather than a tick count. The counterpart to `waitForQuiet` for the
// second half of a "does not free-run" test: the window in which a late producer would show up is
// wall time, so the observation has to be too.
export async function advanceMs(
  durationMs: number = DEFAULT_QUIET_MS,
): Promise<void> {
  const until = now() + durationMs;
  while (now() < until) await tick();
}
