import { createJsonKeyedResourceController } from '@symbiote-native/engine';
import type { IResourceController } from '@symbiote-native/engine';
import type {
  IVideoPlayerBuilderOptions,
  IVideoSource,
  VideoPlayer,
} from './player-types';
import { createVideoPlayer } from './video-player';
import { parseSource } from './video-source';

type IVideoPlayerKey = {
  source: IVideoSource;
  options?: IVideoPlayerBuilderOptions;
};

export type IVideoPlayerController = {
  /** `setup` runs only on a player this call creates */
  resolve: (
    source: IVideoSource,
    options?: IVideoPlayerBuilderOptions,
    setup?: (player: VideoPlayer) => void,
  ) => VideoPlayer;
  flushDispose: IResourceController<
    IVideoPlayerKey,
    VideoPlayer
  >['flushDispose'];
  dispose: IResourceController<IVideoPlayerKey, VideoPlayer>['dispose'];
};

/** Twin of `useVideoPlayer`'s releasing shared object, one per mounted owner */
export function createVideoPlayerController(): IVideoPlayerController {
  // The latest setup, it is not part of the key and must not recreate the player
  let latestSetup: ((player: VideoPlayer) => void) | undefined;
  const controller = createJsonKeyedResourceController<
    IVideoPlayerKey,
    VideoPlayer
  >(
    key => {
      const player = createVideoPlayer(key.source, key.options);
      latestSetup?.(player);
      return player;
    },
    player => player.release(),
  );
  return {
    resolve: (source, options, setup) => {
      latestSetup = setup;
      return controller.resolve({ source: parseSource(source), options });
    },
    flushDispose: controller.flushDispose,
    dispose: controller.dispose,
  };
}
