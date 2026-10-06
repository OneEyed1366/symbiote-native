import {
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
} from '@vue/runtime-core';
import { createResourceHook } from '@symbiote-native/vue';
import { createVideoPlayerController } from '../core/video-player-controller';
import type {
  IVideoPlayerBuilderOptions,
  IVideoSource,
  VideoPlayer,
} from '../core';

const usePlayerResource = createResourceHook(createVideoPlayerController);

/**
 * Vue twin of `expo-video`'s `useVideoPlayer`, released when the owner unmounts
 *
 * `setup` runs once on each new player, a changed source or options make a new one
 */
export function useVideoPlayer(
  source: MaybeRefOrGetter<IVideoSource>,
  setup?: (player: VideoPlayer) => void,
  playerBuilderOptions?: MaybeRefOrGetter<
    IVideoPlayerBuilderOptions | undefined
  >,
): ComputedRef<VideoPlayer> {
  return usePlayerResource(() => [
    toValue(source),
    toValue(playerBuilderOptions),
    setup,
  ]);
}
