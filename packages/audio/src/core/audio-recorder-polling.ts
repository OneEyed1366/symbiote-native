import { shouldUpdateRecorderState } from './audio-recorder-state';
import type { IRecorderState } from './types';

export type IPollableRecorder = {
  getStatus: () => IRecorderState;
};

// Ported from `useAudioRecorderState`'s `setInterval` body; `update` matches every adapter's
// own state setter (`useState`, Solid's `createSignal`, a plain `(prev) => next` writer, ...)
export function pollRecorderState(
  recorder: IPollableRecorder,
  interval: number,
  update: (updater: (prev: IRecorderState) => IRecorderState) => void,
): () => void {
  const id = setInterval(() => {
    const next = recorder.getStatus();
    update(prev => (shouldUpdateRecorderState(prev, next) ? next : prev));
  }, interval);
  return () => clearInterval(id);
}
