import { DestroyRef, inject } from '@angular/core';
import { subscribeAudioSampleListener } from '../core/audio-sample-listener';
import type { IAudioSamplePlayer } from '../core/audio-sample-listener';
import type { IAudioSample } from '../core/types';

/** Angular twin of `expo-audio`'s `useAudioSampleListener` */
export function injectAudioSampleListener(
  player: IAudioSamplePlayer,
  listener: (data: IAudioSample) => void,
): void {
  const unsubscribe = subscribeAudioSampleListener(player, listener);
  inject(DestroyRef).onDestroy(unsubscribe);
}
