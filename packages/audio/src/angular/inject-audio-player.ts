// Angular twin of `useAudioPlayer`, `injectX` shape matching
// `@symbiote-native/navigation`'s `injectLinkingIntegration`

import type { Signal } from '@angular/core';
import { createResourceHook } from '@symbiote-native/angular';
import { createAudioPlayerController } from '../core/audio-player-controller';
import type { AudioPlayer } from '../core';
import type { IAudioPlayerOptions, IAudioSource } from '../core';

const injectPlayerResource = createResourceHook(createAudioPlayerController);

export function injectAudioPlayer(
  source: () => IAudioSource,
  options: () => IAudioPlayerOptions = () => ({}),
): Signal<AudioPlayer> {
  return injectPlayerResource(() => [source(), options()]);
}
