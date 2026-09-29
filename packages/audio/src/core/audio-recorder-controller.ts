import type { IResourceController } from '@symbiote-native/engine';
import { createJsonKeyedResourceController } from './json-keyed-resource-controller';
import { createAudioRecorder, type AudioRecorder } from './audio-recorder';
import type { IRecordingOptions } from './types';

export function createAudioRecorderController(): IResourceController<
  IRecordingOptions,
  AudioRecorder
> {
  return createJsonKeyedResourceController<IRecordingOptions, AudioRecorder>(
    createAudioRecorder,
    recorder => recorder.release(),
  );
}
