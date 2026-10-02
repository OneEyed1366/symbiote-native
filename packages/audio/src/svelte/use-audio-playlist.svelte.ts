// Svelte twin of `expo-audio`'s `useAudioPlaylist`, boxed getter shape matching
// `use-audio-player.svelte.ts` (`components_split_logic_view_lifecycle`)

import { createResourceHook } from '@symbiote-native/svelte/runes/create-resource-hook';
import { createAudioPlaylistController } from '../core/audio-playlist-controller';
import type { AudioPlaylist } from '../core';
import type { IAudioPlaylistOptions } from '../core';

export type IUseAudioPlaylistResult = {
  readonly current: AudioPlaylist;
};

const usePlaylistResource = createResourceHook(createAudioPlaylistController);

export function useAudioPlaylist(
  getOptions: () => IAudioPlaylistOptions = () => ({}),
): IUseAudioPlaylistResult {
  return usePlaylistResource(() => [getOptions()]);
}
