import { onScopeDispose, ref } from 'vue';
import { FULL_RATE, INITIAL_LOOP_VIEW, createFrameLoop } from './gl-frame-loop';

// A render loop that stops with the component and can be paused, with a report of its frames
export function useFrameLoop(getMaxFps: () => number = () => FULL_RATE) {
  const view = ref(INITIAL_LOOP_VIEW);
  const loop = createFrameLoop({
    getMaxFps,
    onChange: next => {
      view.value = next;
    },
  });
  onScopeDispose(loop.dispose);
  return { view, loop };
}
