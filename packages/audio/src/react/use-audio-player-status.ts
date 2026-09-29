import { createEventValueHook } from '@symbiote-native/react';
import { PLAYBACK_STATUS_UPDATE } from '../core/types';
import type { AudioPlayer } from '../core';
import type { IAudioStatus } from '../core';

/** React twin of `expo-audio`'s `useAudioPlayerStatus` */
export const useAudioPlayerStatus = createEventValueHook<
  AudioPlayer,
  IAudioStatus,
  typeof PLAYBACK_STATUS_UPDATE
>(PLAYBACK_STATUS_UPDATE, player => player.currentStatus);
