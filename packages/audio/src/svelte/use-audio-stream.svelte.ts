// `$effect` is a compiler macro, can't be passed by reference like `watchEffect`/`createEffect`,
// so it's wrapped instead of handed to `runAudioStreamBufferEffect` directly.
// Approved cross-framework duplicate vs Solid's use-audio-stream.ts (.claude/reuse.json)

import { createResourceHook } from '@symbiote-native/svelte/runes/create-resource-hook';
import { createEventValueHook } from '@symbiote-native/svelte/runes/create-event-value-hook';
import { createAudioStreamHooks } from '../core/audio-stream-hooks';
import { toAudioStreamKey } from '../core/audio-stream-subscription';
import { runAudioStreamBufferEffect } from '../core/audio-stream-lifecycle';
import type { IAudioStreamResult, IUseAudioStreamOptions } from '../core';

const { useStreamResource, useStreamStatus } = createAudioStreamHooks(
  createResourceHook,
  createEventValueHook,
);

export function useAudioStream(getOptions: () => IUseAudioStreamOptions): {
  readonly current: IAudioStreamResult;
} {
  const stream = useStreamResource(() => [toAudioStreamKey(getOptions())]);
  const status = useStreamStatus(() => stream.current);

  const cleanups: Array<() => void> = [];
  runAudioStreamBufferEffect(
    () => stream.current,
    () => getOptions().onBuffer,
    effect => {
      $effect(effect);
    },
    cleanup => cleanups.push(cleanup),
  );
  $effect(() => () => {
    for (const cleanup of cleanups) cleanup();
  });

  return {
    get current(): IAudioStreamResult {
      return {
        stream: stream.current,
        isStreaming: status.current.isStreaming,
      };
    },
  };
}
