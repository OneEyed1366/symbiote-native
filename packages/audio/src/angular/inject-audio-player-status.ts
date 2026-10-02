import { createEventValueHook } from '@symbiote-native/angular';
import { PLAYBACK_STATUS_UPDATE } from '../core/types';
import type { AudioPlayer } from '../core';
import type { IAudioStatus } from '../core';

/** Angular twin of `expo-audio`'s `useAudioPlayerStatus` */
export const injectAudioPlayerStatus = createEventValueHook<
  AudioPlayer,
  IAudioStatus,
  typeof PLAYBACK_STATUS_UPDATE
>(PLAYBACK_STATUS_UPDATE, player => player.currentStatus);
