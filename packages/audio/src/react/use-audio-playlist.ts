import { createResourceHook } from '@symbiote-native/react';
import { createAudioPlaylistController } from '../core/audio-playlist-controller';
import type { AudioPlaylist } from '../core';
import type { IAudioPlaylistOptions } from '../core';

const usePlaylistResource = createResourceHook(createAudioPlaylistController);

/** React twin of `expo-audio`'s `useAudioPlaylist` */
export function useAudioPlaylist(
  options: IAudioPlaylistOptions = {},
): AudioPlaylist {
  return usePlaylistResource(options);
}
