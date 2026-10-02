import { subscribeAudioSampleListener } from '../core/audio-sample-listener';
import type { IAudioSamplePlayer } from '../core/audio-sample-listener';
import type { IAudioSample } from '../core/types';

/** Svelte twin of `expo-audio`'s `useAudioSampleListener` */
export function useAudioSampleListener(
  player: IAudioSamplePlayer,
  listener: (data: IAudioSample) => void,
): void {
  $effect(() => subscribeAudioSampleListener(player, listener));
}
