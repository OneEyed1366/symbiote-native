import {
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
} from '@vue/runtime-core';
import { createResourceHook } from '@symbiote-native/vue';
import { createAudioPlayerController } from '../core/audio-player-controller';
import type { AudioPlayer } from '../core';
import type { IAudioPlayerOptions, IAudioSource } from '../core';

const usePlayerResource = createResourceHook(createAudioPlayerController);

/** Vue twin of `expo-audio`'s `useAudioPlayer` */
export function useAudioPlayer(
  source: MaybeRefOrGetter<IAudioSource> = null,
  options: MaybeRefOrGetter<IAudioPlayerOptions> = {},
): ComputedRef<AudioPlayer> {
  return usePlayerResource(() => [toValue(source), toValue(options)]);
}
