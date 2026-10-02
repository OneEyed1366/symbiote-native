import { createEventValueHook } from '@symbiote-native/angular';
import { PLAYLIST_STATUS_UPDATE } from '../core/types';
import type { AudioPlaylist } from '../core';
import type { IAudioPlaylistStatus } from '../core';

/** Angular twin of `expo-audio`'s `useAudioPlaylistStatus` */
export const injectAudioPlaylistStatus = createEventValueHook<
  AudioPlaylist,
  IAudioPlaylistStatus,
  typeof PLAYLIST_STATUS_UPDATE
>(PLAYLIST_STATUS_UPDATE, playlist => playlist.currentStatus);
