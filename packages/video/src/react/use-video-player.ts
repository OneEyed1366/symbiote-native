import { createResourceHook } from '@symbiote-native/react';
import { createVideoPlayerController } from '../core/video-player-controller';
import type {
  IVideoPlayerBuilderOptions,
  IVideoSource,
  VideoPlayer,
} from '../core';

const usePlayerResource = createResourceHook(createVideoPlayerController);

/**
 * Creates a player that is released when the component unmounts
 *
 * `setup` runs once on each new player, a changed source or options make a new one
 */
export function useVideoPlayer(
  source: IVideoSource,
  setup?: (player: VideoPlayer) => void,
  playerBuilderOptions?: IVideoPlayerBuilderOptions,
): VideoPlayer {
  return usePlayerResource(source, playerBuilderOptions, setup);
}
