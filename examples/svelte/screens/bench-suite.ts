// The fixed-order suite: every timed step starts from exactly SUITE_ROWS rows
// Remove and Append cost scales with the rows on screen, so untimed resets run between timed steps
import type { IFabricCallProfile } from '../fabric-call-counter';
import { BENCH_OP, suiteLabel } from './bench-clock';
import type { IBenchClock, IBenchOpId, IStepProfile } from './bench-clock';
import {
  clearedList,
  freshList,
  REMOVE_INDEX,
  resetRowData,
  ROW_BATCH,
  SELECT_INDEX,
  withAppendedRows,
  withSwappedRows,
  withUpdatedLabels,
} from './bench-data';
import type { IListState } from './bench-data';

// Same rows, same operations, same measurement, and only the rows mounted at once differ
// That tells a slow commit path apart from a host that cannot hold this many native views
export const MOUNT_MODE = {
  // krausest's own shape, every row mounted, comparable to the published web numbers
  All: 'all',
  // What an app ships: a window of about 10 rows mounted, so it prices the list bookkeeping too
  Virtualized: 'virtualized',
} as const;

export type IMountMode = (typeof MOUNT_MODE)[keyof typeof MOUNT_MODE];

export const SUITE_ROWS = ROW_BATCH;

const PREPARING_LABEL = 'Preparing';

export type IBenchResult = {
  seq: number;
  op: IBenchOpId;
  label: string;
  durationMs: number;
  rowCount: number;
};

// `startRows` is recorded, not derived, as a duration is meaningless without it
export type ISuiteEntry = {
  op: IBenchOpId;
  label: string;
  durationMs: number;
  startRows: number;
  profile: IStepProfile;
  fabric: IFabricCallProfile;
};

export type ISuiteProgress = {
  mode: IMountMode;
  label: string;
  done: number;
};

// Both modes' last results, side by side, as reading one without the other is how
// "the engine is slow" gets claimed off a number that measured 9,000 views
export type ISuiteResults = Record<IMountMode, readonly ISuiteEntry[]>;

export const EMPTY_SUITE_RESULTS: ISuiteResults = {
  [MOUNT_MODE.All]: [],
  [MOUNT_MODE.Virtualized]: [],
};

// The cells the suite reads and writes, so the screen can back each one with a rune
export type ISuiteState = {
  list: IListState;
  mountMode: IMountMode;
  history: readonly IBenchResult[];
  suiteResults: ISuiteResults;
  progress: ISuiteProgress | undefined;
};

type ISuitePlanStep = {
  op: IBenchOpId;
  startRows: number;
  // An untimed clear and fill first, so the step starts from exactly SUITE_ROWS rows
  hasReset: boolean;
  mutate: (list: IListState) => IListState;
};

const fillRows = (): IListState => freshList(SUITE_ROWS);

const SUITE_PLAN: readonly ISuitePlanStep[] = [
  { op: BENCH_OP.Create, startRows: 0, hasReset: false, mutate: fillRows },
  {
    op: BENCH_OP.Replace,
    startRows: SUITE_ROWS,
    hasReset: false,
    mutate: fillRows,
  },
  {
    op: BENCH_OP.Update,
    startRows: SUITE_ROWS,
    hasReset: false,
    mutate: withUpdatedLabels,
  },
  {
    op: BENCH_OP.Select,
    startRows: SUITE_ROWS,
    hasReset: false,
    mutate: list => ({ ...list, selectedId: list.rows[SELECT_INDEX].id }),
  },
  {
    op: BENCH_OP.Swap,
    startRows: SUITE_ROWS,
    hasReset: false,
    mutate: withSwappedRows,
  },
  {
    op: BENCH_OP.Remove,
    startRows: SUITE_ROWS,
    hasReset: false,
    mutate: list => ({
      ...list,
      rows: list.rows.filter((_row, index) => index !== REMOVE_INDEX),
    }),
  },
  {
    op: BENCH_OP.Append,
    startRows: SUITE_ROWS,
    hasReset: true,
    mutate: list => withAppendedRows(list, SUITE_ROWS),
  },
  {
    op: BENCH_OP.Clear,
    startRows: SUITE_ROWS,
    hasReset: true,
    mutate: clearedList,
  },
];

// One commit for the whole prologue: the mode, an emptied list and the progress block appearing
// It always changes the tree, as `commitContainer` returns early on a commit with no native
// change, so a no-op mutation would never resolve its step and would stall the suite
function beginRun(mode: IMountMode, state: ISuiteState): void {
  state.mountMode = mode;
  state.suiteResults = { ...state.suiteResults, [mode]: [] };
  state.history = [];
  state.progress = { mode, label: PREPARING_LABEL, done: 0 };
  state.list = clearedList();
}

function finishRun(
  mode: IMountMode,
  state: ISuiteState,
  entries: readonly ISuiteEntry[],
): void {
  state.suiteResults = { ...state.suiteResults, [mode]: entries };
  state.progress = undefined;
}

async function runInOrder<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>,
  index = 0,
): Promise<void> {
  const item = items[index];
  if (item === undefined) return;
  await run(item);
  await runInOrder(items, run, index + 1);
}

export async function runBenchSuite(
  mode: IMountMode,
  state: ISuiteState,
  clock: IBenchClock,
): Promise<void> {
  resetRowData();
  const entries: ISuiteEntry[] = [];

  // The progress block is committed and painted before any measured step starts
  // Setting it and mutating the list in one commit would freeze the screen on the first step
  const showProgress = (label: string): Promise<number> =>
    clock.runStep(() => {
      state.progress = { mode, label, done: entries.length };
    });

  const resetRows = async (): Promise<void> => {
    await clock.runStep(() => {
      state.list = clearedList();
    });
    await clock.runStep(() => {
      state.list = fillRows();
    });
  };

  const runPlanStep = async (step: ISuitePlanStep): Promise<void> => {
    if (step.hasReset) await resetRows();
    const label = suiteLabel(step.op);
    await showProgress(label);
    const durationMs = await clock.runStep(() => {
      state.list = step.mutate(state.list);
    });
    // Read after the measured step, as the progress step commits first and would be read instead
    entries.push({
      op: step.op,
      label,
      durationMs,
      startRows: step.startRows,
      profile: clock.lastStepProfile,
      fabric: clock.lastFabricProfile,
    });
  };

  await clock.runStep(() => beginRun(mode, state));
  await runInOrder(SUITE_PLAN, runPlanStep);
  // Awaited, so the suite leaves no commit behind it to stop the stopwatch of a second run
  await clock.runStep(() => finishRun(mode, state, entries));
}
