import { createMemo, onCleanup, type Accessor } from 'solid-js';
import {
  createResourceHook,
  createEventValueHook,
} from '@symbiote-native/solid';
import { createAudioStreamHooks } from '../core/audio-stream-hooks';
import { toAudioStreamKey } from '../core/audio-stream-subscription';
import { runAudioStreamBufferEffect } from '../core/audio-stream-lifecycle';
import type { IAudioStreamResult, IUseAudioStreamOptions } from '../core';

const { useStreamResource, useStreamStatus } = createAudioStreamHooks(
  createResourceHook,
  createEventValueHook,
);

/** Solid twin of `expo-audio`'s `useAudioStream` */
export function useAudioStream(
  getOptions: Accessor<IUseAudioStreamOptions>,
): Accessor<IAudioStreamResult> {
  const stream = useStreamResource(() => [toAudioStreamKey(getOptions())]);
  const status = useStreamStatus(stream);

  runAudioStreamBufferEffect(
    stream,
    () => getOptions().onBuffer,
    fn => fn(),
    onCleanup,
  );

  return createMemo(() => ({
    stream: stream(),
    isStreaming: status().isStreaming,
  }));
}
