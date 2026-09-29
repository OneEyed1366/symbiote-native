import { createSignal, onCleanup, type Accessor } from 'solid-js';
import { pollRecorderState } from '../core/audio-recorder-polling';
import type { AudioRecorder } from '../core';
import type { IRecorderState } from '../core';

const DEFAULT_POLL_INTERVAL_MS = 500;

/** Solid twin of `expo-audio`'s `useAudioRecorderState` */
export function useAudioRecorderState(
  recorder: AudioRecorder,
  interval: number = DEFAULT_POLL_INTERVAL_MS,
): Accessor<IRecorderState> {
  const [state, setState] = createSignal(recorder.getStatus());

  onCleanup(pollRecorderState(recorder, interval, setState));

  return state;
}
