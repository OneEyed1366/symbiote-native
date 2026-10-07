// Angular twin of `useVideoPlayer`, `injectX` shape matching `injectAudioPlayer`

import type { Signal } from '@angular/core';
import { createResourceHook } from '@symbiote-native/angular';
import { createVideoPlayerController } from '../core/video-player-controller';
import type {
  IVideoPlayerBuilderOptions,
  IVideoSource,
  VideoPlayer,
} from '../core';

const injectPlayerResource = createResourceHook(createVideoPlayerController);

/** Released with the injection context, `setup` runs once on each new player */
export const injectVideoPlayer = (
  source: () => IVideoSource,
  setup?: (player: VideoPlayer) => void,
  options?: () => IVideoPlayerBuilderOptions | undefined,
): Signal<VideoPlayer> =>
  injectPlayerResource(() => [source(), options?.(), setup]);
