import { AUDIO_STREAM_BUFFER } from './types';
import { subscribeSingleEvent } from './subscribe-single-event';
import type { IAudioStreamBuffer, IAudioStreamOptions } from './types';
import type { IUseAudioStreamOptions } from './audio-stream';

export type IAudioStreamBufferSource = {
  addListener: (
    event: typeof AUDIO_STREAM_BUFFER,
    listener: (buffer: IAudioStreamBuffer) => void,
  ) => { remove: () => void };
};

// Ported from `useAudioStream`'s buffer-listener `useEffect` body
export function subscribeAudioStreamBuffer(
  stream: IAudioStreamBufferSource,
  onBuffer: ((buffer: IAudioStreamBuffer) => void) | undefined,
): () => void {
  return subscribeSingleEvent(stream, AUDIO_STREAM_BUFFER, onBuffer);
}

// Drops `onBuffer` so a callback identity change doesn't recreate the native stream - matches
// upstream's own `[sampleRate, channels, encoding]` dependency array
export function toAudioStreamKey(
  options: IUseAudioStreamOptions,
): IAudioStreamOptions {
  const { sampleRate, channels, encoding } = options;
  return { sampleRate, channels, encoding };
}
