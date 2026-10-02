import type { IResourceController } from '@symbiote-native/engine';
import { createJsonKeyedResourceController } from './json-keyed-resource-controller';
import { createAudioStream, type AudioStream } from './audio-stream';
import type { IAudioStreamOptions } from './types';

export function createAudioStreamController(): IResourceController<
  IAudioStreamOptions,
  AudioStream
> {
  return createJsonKeyedResourceController<IAudioStreamOptions, AudioStream>(
    createAudioStream,
    stream => stream.release(),
  );
}
