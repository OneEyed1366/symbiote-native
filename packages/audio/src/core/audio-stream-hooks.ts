import type { IResourceController } from '@symbiote-native/engine';
import { createAudioStreamController } from './audio-stream-controller';
import { AUDIO_STREAM_STATUS } from './types';
import type { AudioStream } from './audio-stream';
import type { IAudioStreamOptions, IAudioStreamStatus } from './types';

// Binds `createAudioStreamController`/`AUDIO_STREAM_STATUS` behind the getter-based
// `createResourceHook`/`createEventValueHook` shape Vue/Solid/Angular share (React keeps its own
// ref-based wiring, same split as `runAudioStreamBufferEffect`)
export function createAudioStreamHooks<TResourceBox, TStatusBox>(
  createResourceHook: (
    createController: () => IResourceController<
      IAudioStreamOptions,
      AudioStream
    >,
  ) => (getArgs: () => [IAudioStreamOptions]) => TResourceBox,
  createEventValueHook: (
    event: typeof AUDIO_STREAM_STATUS,
    getValue: (source: AudioStream) => IAudioStreamStatus,
  ) => (getSource: () => AudioStream) => TStatusBox,
): {
  useStreamResource: (getArgs: () => [IAudioStreamOptions]) => TResourceBox;
  useStreamStatus: (getSource: () => AudioStream) => TStatusBox;
} {
  return {
    useStreamResource: createResourceHook(createAudioStreamController),
    useStreamStatus: createEventValueHook(AUDIO_STREAM_STATUS, stream => ({
      isStreaming: stream.isStreaming,
    })),
  };
}
