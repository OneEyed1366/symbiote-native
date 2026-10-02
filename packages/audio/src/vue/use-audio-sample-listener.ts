import { onUnmounted, watch } from '@vue/runtime-core';
import { subscribeAudioSampleListener } from '../core/audio-sample-listener';
import type { IAudioSamplePlayer } from '../core/audio-sample-listener';
import type { IAudioSample } from '../core/types';

/** Vue twin of `expo-audio`'s `useAudioSampleListener` */
export function useAudioSampleListener(
  player: IAudioSamplePlayer,
  listener: (data: IAudioSample) => void,
): void {
  let unsubscribe = subscribeAudioSampleListener(player, listener);

  watch(
    () => player,
    next => {
      unsubscribe();
      unsubscribe = subscribeAudioSampleListener(next, listener);
    },
  );

  onUnmounted(() => unsubscribe());
}
