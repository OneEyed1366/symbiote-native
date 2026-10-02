import { createEffect, onCleanup, type Accessor } from 'solid-js';
import { createResourceHook } from '@symbiote-native/solid';
import { createAudioRecorderController } from '../core/audio-recorder-controller';
import { subscribeRecordingStatus } from '../core/audio-recorder-status';
import type { AudioRecorder } from '../core';
import type { IRecordingOptions, IRecordingStatus } from '../core';

const useRecorderResource = createResourceHook(createAudioRecorderController);

/** Solid twin of `expo-audio`'s `useAudioRecorder` */
export function useAudioRecorder(
  getOptions: Accessor<IRecordingOptions>,
  statusListener?: (status: IRecordingStatus) => void,
): Accessor<AudioRecorder> {
  const recorder = useRecorderResource(() => [getOptions()]);

  createEffect(() => {
    onCleanup(subscribeRecordingStatus(recorder(), statusListener));
  });

  return recorder;
}
