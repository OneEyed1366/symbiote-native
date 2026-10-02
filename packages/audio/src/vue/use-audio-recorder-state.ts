import { onUnmounted, shallowRef, type ShallowRef } from '@vue/runtime-core';
import { pollRecorderState } from '../core/audio-recorder-polling';
import type { AudioRecorder } from '../core';
import type { IRecorderState } from '../core';

const DEFAULT_POLL_INTERVAL_MS = 500;

/** Vue twin of `expo-audio`'s `useAudioRecorderState` */
export function useAudioRecorderState(
  recorder: AudioRecorder,
  interval: number = DEFAULT_POLL_INTERVAL_MS,
): ShallowRef<IRecorderState> {
  const state = shallowRef(recorder.getStatus());

  const stop = pollRecorderState(recorder, interval, updater => {
    state.value = updater(state.value);
  });
  onUnmounted(stop);

  return state;
}
