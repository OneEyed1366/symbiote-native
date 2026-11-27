import { describe, expect, it, vi } from 'vitest';
import { EMPTY_FABRIC_PROFILE, SUITE_STEPS } from './bench-clock';
import type { IBenchClock } from './bench-clock';
import { clearedList, SWAP_HIGH_INDEX } from './bench-data';
import {
  EMPTY_SUITE_RESULTS,
  MOUNT_MODE,
  runBenchSuite,
  SUITE_ROWS,
} from './bench-suite';
import type { ISuiteState } from './bench-suite';

// The built engine does not load in plain Node, and the clock under test is faked below
vi.mock('@symbiote-native/engine', () => ({
  readCommitProfile: () => ({ propWrites: 0, commits: 0 }),
  registerPostCommit: () => undefined,
  unregisterPostCommit: () => undefined,
}));

type IFakeRun = {
  state: ISuiteState;
  clock: IBenchClock;
  progressLog: string[];
};

function createRun(failOnCall?: number): IFakeRun {
  const state: ISuiteState = {
    list: clearedList(),
    mountMode: MOUNT_MODE.All,
    history: [],
    suiteResults: EMPTY_SUITE_RESULTS,
    progress: undefined,
  };
  const progressLog: string[] = [];
  let rowsBefore = 0;
  let calls = 0;
  const clock: IBenchClock = {
    install: () => () => undefined,
    runStep: mutate => {
      calls += 1;
      if (calls === failOnCall) return Promise.reject(new Error('step failed'));
      rowsBefore = state.list.rows.length;
      mutate();
      progressLog.push(`${state.progress?.label}#${state.progress?.done}`);
      return Promise.resolve(2);
    },
    get lastStepProfile() {
      return { propWrites: rowsBefore, commits: 1 };
    },
    get lastFabricProfile() {
      return EMPTY_FABRIC_PROFILE;
    },
  };
  return { state, clock, progressLog };
}

describe('benchmark suite', () => {
  it('times every step of the shared table in its fixed order', async () => {
    const { state, clock } = createRun();
    await runBenchSuite(MOUNT_MODE.All, state, clock);

    expect(state.suiteResults[MOUNT_MODE.All].map(entry => entry.op)).toEqual(
      SUITE_STEPS.map(step => step.op),
    );
  });

  it('starts each timed step from the rows it records, resetting before Append and Clear', async () => {
    const { state, clock } = createRun();
    await runBenchSuite(MOUNT_MODE.All, state, clock);
    const entries = state.suiteResults[MOUNT_MODE.All];

    const startRows = entries.map(entry => entry.startRows);
    const rowsAtStart = entries.map(entry => entry.profile.propWrites);
    expect(startRows).toEqual([
      0,
      ...Array(SUITE_STEPS.length - 1).fill(SUITE_ROWS),
    ]);
    expect(rowsAtStart).toEqual(startRows);
    expect(SWAP_HIGH_INDEX).toBeLessThan(SUITE_ROWS);
  });

  it('shows the preparing block first, then each step with the count already done', async () => {
    const { state, clock, progressLog } = createRun();
    await runBenchSuite(MOUNT_MODE.All, state, clock);

    const stages = progressLog.filter(
      (entry, index) => entry !== progressLog[index - 1],
    );
    expect(stages).toEqual([
      'Preparing#0',
      ...SUITE_STEPS.map((step, index) => `${step.label}#${index}`),
      'undefined#undefined',
    ]);
  });

  it('publishes one mode without touching the other mode results', async () => {
    const { state, clock } = createRun();
    await runBenchSuite(MOUNT_MODE.All, state, clock);
    const allResults = state.suiteResults[MOUNT_MODE.All];
    await runBenchSuite(MOUNT_MODE.Virtualized, state, clock);

    expect(state.mountMode).toBe(MOUNT_MODE.Virtualized);
    expect(state.suiteResults[MOUNT_MODE.All]).toBe(allResults);
    expect(state.suiteResults[MOUNT_MODE.Virtualized]).toHaveLength(
      SUITE_STEPS.length,
    );
    expect(state.progress).toBeUndefined();
  });

  it('rejects when a step fails, leaving the progress block to the caller', async () => {
    const { state, clock } = createRun(3);

    await expect(runBenchSuite(MOUNT_MODE.All, state, clock)).rejects.toThrow(
      'step failed',
    );
    expect(state.progress).toBeDefined();
  });
});
