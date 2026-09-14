// The clock every benchmark screen here measures through, so two screens cannot measure different
// quantities under one name. It starts in `runStep` — a rune write is asynchronous, so a
// performance.now() pair around the mutation would time the scheduling call and nothing else — and
// stops in the ENGINE's post-commit hook rather than Svelte's `tick()`, which resolves at a
// different point relative to completeRoot.
//
// The frame meter's gate is a PARAMETER so this file stays plain TypeScript with no `.svelte`
// import.
import {
  readCommitProfile,
  registerPostCommit,
  unregisterPostCommit,
} from '@symbiote-native/engine';
import { readFabricCallProfile } from '../fabric-call-counter';
import type { IFabricCallProfile } from '../fabric-call-counter';

// A step that never commits would hang the suite. A reported `timeout` row names the broken
// operation and leaves the rest measurable.
const SUITE_STEP_TIMEOUT_MS = 30_000;
export const SUITE_TIMED_OUT = Number.NaN;

// What the ENGINE did inside one timed step. Every adapter builds the same tree for a given step,
// so a nodesVisited or propWrites that differs between adapters is work the SCREEN generates, not
// a cost of the platform.
//
// `walkMs` is NOT the engine's JS cost — the window around reconcile() contains the createNode and
// appendChild JSI crossings. Read it only as a DELTA between adapters, where the native part is a
// shared constant.
export type IStepProfile = {
  nodesVisited: number;
  propWrites: number;
  propNoops: number;
  commits: number;
  walkMs: number;
};

export const EMPTY_STEP_PROFILE: IStepProfile = {
  nodesVisited: 0,
  propWrites: 0,
  propNoops: 0,
  commits: 0,
  walkMs: 0,
};

export const EMPTY_FABRIC_PROFILE: IFabricCallProfile = {
  calls: {},
  propKeys: {},
  totalCalls: 0,
  totalPropKeys: 0,
};

// Shared, so two screens cannot label the same measurement differently. `CreateLots` has no
// SUITE_STEPS row: 10 000 rows is a button-only experiment, and a suite that hangs measures nothing.
export const BENCH_OP = {
  Create: 'create',
  Replace: 'replace',
  Update: 'update',
  Select: 'select',
  Swap: 'swap',
  Remove: 'remove',
  CreateLots: 'createLots',
  Append: 'append',
  Clear: 'clear',
} as const;

export type IBenchOpId = (typeof BENCH_OP)[keyof typeof BENCH_OP];

// Fixed order, shared by every runner and table, so a step can never run without a row to land in.
export const SUITE_STEPS: readonly { op: IBenchOpId; label: string }[] = [
  { op: BENCH_OP.Create, label: 'Create 1,000 rows' },
  { op: BENCH_OP.Replace, label: 'Replace all 1,000 rows' },
  { op: BENCH_OP.Update, label: 'Partial update · every 10th row' },
  { op: BENCH_OP.Select, label: 'Select row' },
  { op: BENCH_OP.Swap, label: 'Swap 2 rows' },
  { op: BENCH_OP.Remove, label: 'Remove row' },
  { op: BENCH_OP.Append, label: 'Append 1,000 rows' },
  { op: BENCH_OP.Clear, label: 'Clear' },
];

export function suiteLabel(op: IBenchOpId): string {
  return SUITE_STEPS.find(step => step.op === op)?.label ?? op;
}

export type IBenchClock = {
  // Shaped for `$effect`: returns its own disposer, so this file needs to know nothing about runes.
  install: () => () => void;
  runStep: (mutate: () => void) => Promise<number>;
  // The last TIMED step's numbers. Read them right after awaiting `runStep`.
  readonly lastStepProfile: IStepProfile;
  readonly lastFabricProfile: IFabricCallProfile;
};

export function createBenchClock(gate: {
  isHeldByBenchmark: boolean;
}): IBenchClock {
  // Plain, not runes: making these reactive would schedule a commit from inside the post-commit
  // hook that is trying to time one.
  let pending: {
    startedAt: number;
    settle: (durationMs: number) => void;
  } | null = null;
  let lastStepProfile: IStepProfile = EMPTY_STEP_PROFILE;
  let lastFabricProfile: IFabricCallProfile = EMPTY_FABRIC_PROFILE;

  function runStep(mutate: () => void): Promise<number> {
    return new Promise<number>(resolve => {
      let isSettled = false;
      const settle = (durationMs: number): void => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        // Release before resolving, so a caller doing more work off this promise cannot hold the
        // meter past the step.
        gate.isHeldByBenchmark = false;
        resolve(durationMs);
      };
      const timer = setTimeout(() => {
        // Drop `pending` too: leaving it would let the NEXT step's commit stop this stopwatch and
        // report a duration against the wrong operation.
        pending = null;
        lastStepProfile = EMPTY_STEP_PROFILE;
        lastFabricProfile = EMPTY_FABRIC_PROFILE;
        settle(SUITE_TIMED_OUT);
      }, SUITE_STEP_TIMEOUT_MS);

      // Zeroed LAST, immediately before the mutation, so nothing between here and the commit lands
      // in the step's profile. No install retry for the Fabric counter: its wrapper has to be in
      // place while the engine binds the slot, which index.js already did and nothing can redo —
      // an all-zero FABRIC CALLS table means that install never landed.
      gate.isHeldByBenchmark = true;
      readCommitProfile();
      readFabricCallProfile();
      pending = { startedAt: performance.now(), settle };
      mutate();
    });
  }

  function install(): () => void {
    const onCommitted = (): void => {
      const finished = pending;
      if (finished === null) return;
      pending = null;
      const durationMs = performance.now() - finished.startedAt;
      // Complete by now: commitContainer increments walkMs and commits before completeRoot, and
      // runPostCommitHooks() fires after it.
      const profile = readCommitProfile();
      lastStepProfile = {
        nodesVisited: profile.nodesVisited,
        propWrites: profile.propWrites,
        propNoops: profile.propNoops,
        commits: profile.commits,
        walkMs: profile.walkMs,
      };
      lastFabricProfile = readFabricCallProfile();
      finished.settle(durationMs);
    };
    registerPostCommit(onCommitted);
    return (): void => unregisterPostCommit(onCommitted);
  }

  return {
    install,
    runStep,
    get lastStepProfile() {
      return lastStepProfile;
    },
    get lastFabricProfile() {
      return lastFabricProfile;
    },
  };
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '—';
  if (!Number.isFinite(durationMs)) return 'timeout';
  return `${durationMs.toFixed(1)} ms`;
}

// The one quantity this canary and `examples/bare-rn` can both report. IStepProfile counts the
// ENGINE's reconcile walk, which stock has no equivalent of; `global.nativeFabricUIManager` is what
// both stacks drive.
export function formatFabric(profile: IFabricCallProfile | undefined): string {
  if (profile === undefined) return '—';
  const create = profile.calls.createNode ?? 0;
  const append = profile.calls.appendChild ?? 0;
  const clones =
    (profile.calls.cloneNode ?? 0) +
    (profile.calls.cloneNodeWithNewChildren ?? 0) +
    (profile.calls.cloneNodeWithNewProps ?? 0) +
    (profile.calls.cloneNodeWithNewChildrenAndProps ?? 0);
  return `${create}/${append}/${clones}`;
}
