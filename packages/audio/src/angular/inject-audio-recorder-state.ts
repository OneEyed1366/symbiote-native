import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import { pollRecorderState } from '../core/audio-recorder-polling';
import type { AudioRecorder } from '../core';
import type { IRecorderState } from '../core';

const DEFAULT_POLL_INTERVAL_MS = 500;

/** Angular twin of `expo-audio`'s `useAudioRecorderState` */
export function injectAudioRecorderState(
  recorder: AudioRecorder,
  interval: number = DEFAULT_POLL_INTERVAL_MS,
): Signal<IRecorderState> {
  const state = signal(recorder.getStatus());

  const stop = pollRecorderState(recorder, interval, updater =>
    state.set(updater(state())),
  );
  inject(DestroyRef).onDestroy(stop);

  return state.asReadonly();
}
