import type { Accessor } from 'solid-js';
import { createResourceHook } from '@symbiote-native/solid';
import { createVideoPlayerController } from '../core/video-player-controller';
import type {
  IVideoPlayerBuilderOptions,
  IVideoSource,
  VideoPlayer,
} from '../core';

const usePlayerResource = createResourceHook(createVideoPlayerController);

/**
 * Solid twin of `expo-video`'s `useVideoPlayer`, released when the owner is disposed
 *
 * `setup` runs once on each new player, a changed source or options make a new one
 */
export function useVideoPlayer(
  source: Accessor<IVideoSource>,
  setup?: (player: VideoPlayer) => void,
  playerBuilderOptions: Accessor<IVideoPlayerBuilderOptions | undefined> = () =>
    undefined,
): Accessor<VideoPlayer> {
  return usePlayerResource(() => [source(), playerBuilderOptions(), setup]);
}
