import { createJsonKeyedResourceController } from './json-keyed-resource-controller';
import { createAudioPlayer, type AudioPlayer } from './audio-player';
import type { IAudioPlayerOptions, IAudioSource } from './types';

type IAudioPlayerKey = { source: IAudioSource; options: IAudioPlayerOptions };

export function createAudioPlayerController(): {
  resolve: (source: IAudioSource, options: IAudioPlayerOptions) => AudioPlayer;
  flushDispose: () => void;
  dispose: () => void;
} {
  const controller = createJsonKeyedResourceController<
    IAudioPlayerKey,
    AudioPlayer
  >(
    key => createAudioPlayer(key.source, key.options),
    player => player.remove(),
  );

  return {
    resolve: (source, options) => controller.resolve({ source, options }),
    flushDispose: controller.flushDispose,
    dispose: controller.dispose,
  };
}
