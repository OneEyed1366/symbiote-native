import type { Accessor } from 'solid-js';
import { createResourceHook } from '@symbiote-native/solid';
import { createAudioPlaylistController } from '../core/audio-playlist-controller';
import type { AudioPlaylist } from '../core';
import type { IAudioPlaylistOptions } from '../core';

const usePlaylistResource = createResourceHook(createAudioPlaylistController);

/** Solid twin of `expo-audio`'s `useAudioPlaylist` */
export function useAudioPlaylist(
  getOptions: Accessor<IAudioPlaylistOptions>,
): Accessor<AudioPlaylist> {
  return usePlaylistResource(() => [getOptions()]);
}
