import { DestroyRef, inject, signal } from '@angular/core';
import { FULL_RATE, INITIAL_LOOP_VIEW, createFrameLoop } from './gl-frame-loop';

// A render loop that stops with the component and can be paused, with a report of its frames
export function injectFrameLoop(getMaxFps: () => number = () => FULL_RATE) {
  const view = signal(INITIAL_LOOP_VIEW);
  const loop = createFrameLoop({ getMaxFps, onChange: next => view.set(next) });
  inject(DestroyRef).onDestroy(loop.dispose);
  return { view, loop };
}
