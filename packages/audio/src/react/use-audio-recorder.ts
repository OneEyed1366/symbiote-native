import { useEffect } from 'react';
import { createResourceHook } from '@symbiote-native/react';
import { createAudioRecorderController } from '../core/audio-recorder-controller';
import { subscribeRecordingStatus } from '../core/audio-recorder-status';
import type { AudioRecorder } from '../core';
import type { IRecordingOptions, IRecordingStatus } from '../core';

const useRecorderResource = createResourceHook(createAudioRecorderController);

/** React twin of `expo-audio`'s `useAudioRecorder` */
export function useAudioRecorder(
  options: IRecordingOptions,
  statusListener?: (status: IRecordingStatus) => void,
): AudioRecorder {
  const recorder = useRecorderResource(options);

  useEffect(
    () => subscribeRecordingStatus(recorder, statusListener),
    [recorder, statusListener],
  );

  return recorder;
}
