import type { Signal } from '@angular/core';
import { createResourceHook } from '@symbiote-native/angular';
import { createAudioPlaylistController } from '../core/audio-playlist-controller';
import type { AudioPlaylist } from '../core';
import type { IAudioPlaylistOptions } from '../core';

const injectPlaylistResource = createResourceHook(
  createAudioPlaylistController,
);

/** Angular twin of `expo-audio`'s `useAudioPlaylist` */
export function injectAudioPlaylist(
  getOptions: () => IAudioPlaylistOptions,
): Signal<AudioPlaylist> {
  return injectPlaylistResource(() => [getOptions()]);
}
