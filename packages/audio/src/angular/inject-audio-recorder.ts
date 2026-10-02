import { effect, type Signal } from '@angular/core';
import { createResourceHook } from '@symbiote-native/angular';
import { createAudioRecorderController } from '../core/audio-recorder-controller';
import { subscribeRecordingStatus } from '../core/audio-recorder-status';
import type { AudioRecorder } from '../core';
import type { IRecordingOptions, IRecordingStatus } from '../core';

const injectRecorderResource = createResourceHook(
  createAudioRecorderController,
);

/** Angular twin of `expo-audio`'s `useAudioRecorder` */
export function injectAudioRecorder(
  getOptions: () => IRecordingOptions,
  statusListener?: (status: IRecordingStatus) => void,
): Signal<AudioRecorder> {
  const recorder = injectRecorderResource(() => [getOptions()]);

  effect(onCleanup => {
    onCleanup(subscribeRecordingStatus(recorder(), statusListener));
  });

  return recorder;
}
