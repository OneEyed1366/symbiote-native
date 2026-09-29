// Svelte twin of `expo-audio`'s `useAudioRecorder`, boxed getter shape matching
// `use-audio-player.svelte.ts` (`components_split_logic_view_lifecycle`)

import { createResourceHook } from '@symbiote-native/svelte/runes/create-resource-hook';
import { createAudioRecorderController } from '../core/audio-recorder-controller';
import { subscribeRecordingStatus } from '../core/audio-recorder-status';
import type { AudioRecorder } from '../core';
import type { IRecordingOptions, IRecordingStatus } from '../core';

export type IUseAudioRecorderResult = {
  readonly current: AudioRecorder;
};

const useRecorderResource = createResourceHook(createAudioRecorderController);

export function useAudioRecorder(
  getOptions: () => IRecordingOptions,
  statusListener?: (status: IRecordingStatus) => void,
): IUseAudioRecorderResult {
  const recorder = useRecorderResource(() => [getOptions()]);

  $effect(() => subscribeRecordingStatus(recorder.current, statusListener));

  return recorder;
}
