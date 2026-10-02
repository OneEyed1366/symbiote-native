// Svelte twin of `expo-audio`'s `useAudioPlayer`, boxed getter shape matching
// `use-image-manipulator.svelte.ts` (`components_split_logic_view_lifecycle`)

import { createResourceHook } from '@symbiote-native/svelte/runes/create-resource-hook';
import { createAudioPlayerController } from '../core/audio-player-controller';
import type { AudioPlayer } from '../core';
import type { IAudioPlayerOptions, IAudioSource } from '../core';

export type IUseAudioPlayerResult = {
  readonly current: AudioPlayer;
};

const usePlayerResource = createResourceHook(createAudioPlayerController);

export function useAudioPlayer(
  getSource: () => IAudioSource = () => null,
  getOptions: () => IAudioPlayerOptions = () => ({}),
): IUseAudioPlayerResult {
  return usePlayerResource(() => [getSource(), getOptions()]);
}
