import { createResourceHook } from '@symbiote-native/react';
import { createAudioPlayerController } from '../core/audio-player-controller';
import type { AudioPlayer } from '../core';
import type { IAudioPlayerOptions, IAudioSource } from '../core';

const usePlayerResource = createResourceHook(createAudioPlayerController);

// React twin of `expo-audio`'s `useAudioPlayer`
export function useAudioPlayer(
  source: IAudioSource = null,
  options: IAudioPlayerOptions = {},
): AudioPlayer {
  return usePlayerResource(source, options);
}
