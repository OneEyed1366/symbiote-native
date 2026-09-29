import type { ComputedRef, MaybeRefOrGetter } from '@vue/runtime-core';
import { toValue } from '@vue/runtime-core';
import { createResourceHook } from '@symbiote-native/vue';
import { createAudioPlaylistController } from '../core/audio-playlist-controller';
import type { AudioPlaylist } from '../core';
import type { IAudioPlaylistOptions } from '../core';

const usePlaylistResource = createResourceHook(createAudioPlaylistController);

/** Vue twin of `expo-audio`'s `useAudioPlaylist` */
export function useAudioPlaylist(
  getOptions: MaybeRefOrGetter<IAudioPlaylistOptions> = {},
): ComputedRef<AudioPlaylist> {
  return usePlaylistResource(() => [toValue(getOptions)]);
}
