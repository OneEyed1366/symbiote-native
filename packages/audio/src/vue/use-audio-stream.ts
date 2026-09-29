import {
  computed,
  onUnmounted,
  toValue,
  watchEffect,
  type ComputedRef,
  type MaybeRefOrGetter,
} from '@vue/runtime-core';
import { createResourceHook, createEventValueHook } from '@symbiote-native/vue';
import { createAudioStreamHooks } from '../core/audio-stream-hooks';
import { toAudioStreamKey } from '../core/audio-stream-subscription';
import { runAudioStreamBufferEffect } from '../core/audio-stream-lifecycle';
import type { IAudioStreamResult, IUseAudioStreamOptions } from '../core';

const { useStreamResource, useStreamStatus } = createAudioStreamHooks(
  createResourceHook,
  createEventValueHook,
);

/** Vue twin of `expo-audio`'s `useAudioStream` */
export function useAudioStream(
  getOptions: MaybeRefOrGetter<IUseAudioStreamOptions>,
): ComputedRef<IAudioStreamResult> {
  const stream = useStreamResource(() => [
    toAudioStreamKey(toValue(getOptions)),
  ]);
  const status = useStreamStatus(() => stream.value);

  runAudioStreamBufferEffect(
    () => stream.value,
    () => toValue(getOptions).onBuffer,
    watchEffect,
    onUnmounted,
  );

  return computed(() => ({
    stream: stream.value,
    isStreaming: status.value.isStreaming,
  }));
}
