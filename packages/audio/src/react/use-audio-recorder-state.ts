import { useEffect, useState } from 'react';
import { pollRecorderState } from '../core/audio-recorder-polling';
import type { AudioRecorder } from '../core';
import type { IRecorderState } from '../core';

const DEFAULT_POLL_INTERVAL_MS = 500;

/** React twin of `expo-audio`'s `useAudioRecorderState` */
export function useAudioRecorderState(
  recorder: AudioRecorder,
  interval: number = DEFAULT_POLL_INTERVAL_MS,
): IRecorderState {
  const [state, setState] = useState<IRecorderState>(() =>
    recorder.getStatus(),
  );

  useEffect(
    () => pollRecorderState(recorder, interval, setState),
    [recorder, interval],
  );

  return state;
}
