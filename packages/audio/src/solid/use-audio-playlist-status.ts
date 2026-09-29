import { createEventValueHook } from '@symbiote-native/solid';
import { PLAYLIST_STATUS_UPDATE } from '../core/types';
import type { AudioPlaylist } from '../core';
import type { IAudioPlaylistStatus } from '../core';

/** Solid twin of `expo-audio`'s `useAudioPlaylistStatus` */
export const useAudioPlaylistStatus = createEventValueHook<
  AudioPlaylist,
  IAudioPlaylistStatus,
  typeof PLAYLIST_STATUS_UPDATE
>(PLAYLIST_STATUS_UPDATE, playlist => playlist.currentStatus);
