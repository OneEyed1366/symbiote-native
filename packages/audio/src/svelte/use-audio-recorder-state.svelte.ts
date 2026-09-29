import { pollRecorderState } from '../core/audio-recorder-polling';
import type { AudioRecorder } from '../core';
import type { IRecorderState } from '../core';

const DEFAULT_POLL_INTERVAL_MS = 500;

export type IUseAudioRecorderStateResult = {
  readonly current: IRecorderState;
};

/** Svelte twin of `expo-audio`'s `useAudioRecorderState` */
export function useAudioRecorderState(
  recorder: AudioRecorder,
  interval: number = DEFAULT_POLL_INTERVAL_MS,
): IUseAudioRecorderStateResult {
  let state = $state(recorder.getStatus());

  $effect(() =>
    pollRecorderState(recorder, interval, updater => {
      state = updater(state);
    }),
  );

  return {
    get current(): IRecorderState {
      return state;
    },
  };
}
