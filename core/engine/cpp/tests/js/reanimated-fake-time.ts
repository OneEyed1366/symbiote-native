// A clock the test turns by hand, for the frames of Reanimated alone. Its frame loop runs on the
// worklets mock, whose timers would all fire at once and end a 300 ms animation in no time
// The runner's own timers (React's scheduler among them) are left as they are
import { flushTimers, print } from './harness';

type IFrame = { id: number; at: number; run: (timestamp: number) => void };

const FRAME_MS = 1;
// A callback that asks for a frame again each time would never let a call return
const MAX_RUNS_PER_CALL = 10_000;

let clock = 0;
let nextId = 1;
let frames: IFrame[] = [];

function earliestWithin(end: number): IFrame | undefined {
  return frames
    .filter(one => one.at <= end)
    .sort((a, b) => a.at - b.at || a.id - b.id)[0];
}

function schedule(run: (timestamp: number) => void, after: number): number {
  const id = nextId;
  nextId += 1;
  frames.push({ id, at: clock + after, run });
  return id;
}

function cancel(id: number): void {
  frames = frames.filter(one => one.id !== id);
}

function runOne(standing: IFrame): void {
  frames = frames.filter(one => one !== standing);
  clock = Math.max(clock, standing.at);
  try {
    standing.run(clock);
  } catch (error) {
    print(
      `FRAME ERROR ${error instanceof Error ? error.stack : String(error)}`,
    );
  }
}

// Runs what falls due within the span, then lets the runner's own timers catch up
export function advance(milliseconds: number): void {
  const end = clock + milliseconds;
  let due = earliestWithin(end);
  let runs = 0;
  while (due !== undefined) {
    runs += 1;
    if (runs > MAX_RUNS_PER_CALL) {
      throw new Error(
        `more than ${MAX_RUNS_PER_CALL} frames ran within one advance`,
      );
    }
    runOne(due);
    due = earliestWithin(end);
  }
  clock = end;
  flushTimers();
}

// The finalizers of a frame run after its callbacks, on the same clock
export function afterFrame(run: () => void): void {
  schedule(run, 0);
}

// Imported after the worklets mock, the test calls this to take the place of its frame loop
export function useSteppedFrames(): void {
  Object.assign(globalThis, {
    requestAnimationFrame: (run: (timestamp: number) => void): number =>
      schedule(run, FRAME_MS),
    cancelAnimationFrame: cancel,
    _getAnimationTimestamp: (): number => clock,
  });
}

Object.defineProperty(globalThis, 'performance', {
  value: { now: (): number => clock },
  configurable: true,
  writable: true,
});
