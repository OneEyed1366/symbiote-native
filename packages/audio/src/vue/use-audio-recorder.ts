import {
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from '@vue/runtime-core';
import { createResourceHook } from '@symbiote-native/vue';
import { createAudioRecorderController } from '../core/audio-recorder-controller';
import { subscribeRecordingStatus } from '../core/audio-recorder-status';
import type { AudioRecorder } from '../core';
import type { IRecordingOptions, IRecordingStatus } from '../core';

const useRecorderResource = createResourceHook(createAudioRecorderController);

/** Vue twin of `expo-audio`'s `useAudioRecorder` */
export function useAudioRecorder(
  getOptions: MaybeRefOrGetter<IRecordingOptions>,
  statusListener?: (status: IRecordingStatus) => void,
): ComputedRef<AudioRecorder> {
  const recorder = useRecorderResource(() => [toValue(getOptions)]);

  watch(
    recorder,
    (current, _previous, onCleanup) =>
      onCleanup(subscribeRecordingStatus(current, statusListener)),
    { immediate: true },
  );

  return recorder;
}
