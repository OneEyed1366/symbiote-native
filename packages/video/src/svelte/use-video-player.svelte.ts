import { createResourceHook } from '@symbiote-native/svelte/runes/create-resource-hook';
import { createVideoPlayerController } from '../core/video-player-controller';
import type {
  IVideoPlayerBuilderOptions,
  IVideoSource,
  VideoPlayer,
} from '../core';

export type IUseVideoPlayerResult = {
  readonly current: VideoPlayer;
};

const usePlayerResource = createResourceHook(createVideoPlayerController);

/**
 * Svelte twin of `expo-video`'s `useVideoPlayer`, boxed getter shape of the other resource hooks
 *
 * `setup` runs once on each new player, a changed source or options make a new one
 */
export function useVideoPlayer(
  getSource: () => IVideoSource,
  setup?: (player: VideoPlayer) => void,
  getPlayerBuilderOptions: () => IVideoPlayerBuilderOptions | undefined = () =>
    undefined,
): IUseVideoPlayerResult {
  return usePlayerResource(() => [
    getSource(),
    getPlayerBuilderOptions(),
    setup,
  ]);
}
