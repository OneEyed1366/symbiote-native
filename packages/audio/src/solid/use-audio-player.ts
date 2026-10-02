import type { Accessor } from 'solid-js';
import { createResourceHook } from '@symbiote-native/solid';
import { createAudioPlayerController } from '../core/audio-player-controller';
import type { AudioPlayer } from '../core';
import type { IAudioPlayerOptions, IAudioSource } from '../core';

const usePlayerResource = createResourceHook(createAudioPlayerController);

/** Solid twin of `expo-audio`'s `useAudioPlayer` */
export function useAudioPlayer(
  source: Accessor<IAudioSource>,
  options: Accessor<IAudioPlayerOptions> = () => ({}),
): Accessor<AudioPlayer> {
  return usePlayerResource(() => [source(), options()]);
}
