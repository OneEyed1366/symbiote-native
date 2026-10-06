import type { IFrameDrawer } from './gl-shaders';

const MS_PER_SECOND = 1_000;
// A report re-renders the screen, so reports are rare and the animation is left alone between them
const REPORT_WINDOW_MS = 5_000;
export const FULL_RATE = 60;
// A display frame comes a little early or late, a tight cap would skip every other one
const FRAME_SLACK_MS = 3;
export const RATE_CAPS = [60, 30, 15].map(rate => ({
  label: `${rate} fps`,
  value: rate,
}));
export const SHADER_RATE = 30;
export const FILTERS = [
  { label: 'original', value: 0 },
  { label: 'grey', value: 1 },
  { label: 'sepia', value: 2 },
  { label: 'invert', value: 3 },
];

export function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type ILoopView = { fps: number; stats: string; isRunning: boolean };

export const INITIAL_LOOP_VIEW: ILoopView = {
  fps: 0,
  stats: 'not started',
  isRunning: true,
};

type IFrameReport = { fps: number; frames: number; timeMs: number };

type IFrameLoopOptions = {
  getMaxFps: () => number;
  onChange: (view: ILoopView) => void;
};

type IFrameRun = {
  setFrame: (id: number) => void;
  draw: IFrameDrawer;
  getMaxFps: () => number;
  onReport: (report: IFrameReport) => void;
};

// The time handed to `draw` counts from the first frame, a frame comes at most `maxFps` times
// a second, a report comes once per window
function runFrames({ setFrame, draw, getMaxFps, onReport }: IFrameRun): void {
  let origin: number | null = null;
  let windowStart = 0;
  let lastDrawn = -MS_PER_SECOND;
  let count = 0;
  let frames = 0;
  const step = (now: number) => {
    origin ??= now;
    const time = now - origin;
    if (time - lastDrawn >= MS_PER_SECOND / getMaxFps() - FRAME_SLACK_MS) {
      draw(time);
      lastDrawn = time;
      count += 1;
      frames += 1;
    }
    if (time - windowStart >= REPORT_WINDOW_MS) {
      onReport({
        fps: Math.round((count * MS_PER_SECOND) / (time - windowStart)),
        frames,
        timeMs: Math.round(time),
      });
      windowStart = time;
      count = 0;
    }
    setFrame(requestAnimationFrame(step));
  };
  setFrame(requestAnimationFrame(step));
}

// The GL thread is shared, two busy scenes make each other stutter: starting one pauses the other
let pauseRunningScene: (() => void) | null = null;

export type IFrameLoop = {
  start: (draw: IFrameDrawer) => void;
  toggle: (value: boolean) => void;
  dispose: () => void;
};

// A render loop that stops with `dispose` and can be paused, with a report of its frames
export function createFrameLoop({
  getMaxFps,
  onChange,
}: IFrameLoopOptions): IFrameLoop {
  let frame: number | null = null;
  let surfaces = 0;
  let drawer: IFrameDrawer | null = null;
  let view = INITIAL_LOOP_VIEW;
  const publish = (patch: Partial<ILoopView>) => {
    view = { ...view, ...patch };
    onChange(view);
  };
  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const pauseThisScene = () => {
    stop();
    publish({ isRunning: false });
  };
  const loop = (draw: IFrameDrawer) => {
    stop();
    // Only another scene is paused, its own earlier run would turn the toggle off again
    if (pauseRunningScene !== pauseThisScene) pauseRunningScene?.();
    pauseRunningScene = pauseThisScene;
    runFrames({
      setFrame: id => {
        frame = id;
      },
      draw,
      getMaxFps,
      onReport: report =>
        publish({
          fps: report.fps,
          stats: `${report.frames} frames, loop time ${report.timeMs} ms, surfaces created ${surfaces}`,
        }),
    });
  };
  // A new surface gets one frame at once, so a paused scene is not blank, then the loop runs
  const start = (draw: IFrameDrawer) => {
    surfaces += 1;
    drawer = draw;
    draw(0);
    if (view.isRunning) loop(draw);
  };
  const toggle = (value: boolean) => {
    publish({ isRunning: value });
    stop();
    if (value && drawer !== null) loop(drawer);
  };
  return { start, toggle, dispose: stop };
}
