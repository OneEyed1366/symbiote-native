import {
  computed,
  DestroyRef,
  effect,
  inject,
  type Signal,
} from '@angular/core';
import {
  createResourceHook,
  createEventValueHook,
} from '@symbiote-native/angular';
import { createAudioStreamHooks } from '../core/audio-stream-hooks';
import { toAudioStreamKey } from '../core/audio-stream-subscription';
import { runAudioStreamBufferEffect } from '../core/audio-stream-lifecycle';
import type { IAudioStreamResult, IUseAudioStreamOptions } from '../core';

const { useStreamResource, useStreamStatus } = createAudioStreamHooks(
  createResourceHook,
  createEventValueHook,
);

/** Angular twin of `expo-audio`'s `useAudioStream` */
export function injectAudioStream(
  getOptions: () => IUseAudioStreamOptions,
): Signal<IAudioStreamResult> {
  const destroyRef = inject(DestroyRef);
  const stream = useStreamResource(() => [toAudioStreamKey(getOptions())]);
  const status = useStreamStatus(stream);

  runAudioStreamBufferEffect(
    stream,
    () => getOptions().onBuffer,
    effect,
    cleanup => destroyRef.onDestroy(cleanup),
  );

  return computed(() => ({
    stream: stream(),
    isStreaming: status().isStreaming,
  }));
}
