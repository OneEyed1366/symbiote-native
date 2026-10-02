import { useEffect } from 'react';
import {
  createResourceHook,
  createEventValueHook,
} from '@symbiote-native/react';
import { createAudioStreamController } from '../core/audio-stream-controller';
import {
  subscribeAudioStreamBuffer,
  toAudioStreamKey,
} from '../core/audio-stream-subscription';
import { AUDIO_STREAM_STATUS } from '../core/types';
import type {
  AudioStream,
  IAudioStreamResult,
  IAudioStreamStatus,
  IUseAudioStreamOptions,
} from '../core';

const useStreamResource = createResourceHook(createAudioStreamController);
const useStreamStatus = createEventValueHook<
  AudioStream,
  IAudioStreamStatus,
  typeof AUDIO_STREAM_STATUS
>(AUDIO_STREAM_STATUS, stream => ({ isStreaming: stream.isStreaming }));

/** React twin of `expo-audio`'s `useAudioStream` */
export function useAudioStream(
  options: IUseAudioStreamOptions = {},
): IAudioStreamResult {
  const stream = useStreamResource(toAudioStreamKey(options));
  const status = useStreamStatus(stream);

  useEffect(
    () => subscribeAudioStreamBuffer(stream, options.onBuffer),
    [stream, options.onBuffer],
  );

  return { stream, isStreaming: status.isStreaming };
}
