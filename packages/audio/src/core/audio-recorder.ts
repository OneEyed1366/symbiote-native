import { Platform } from 'expo-modules-core';
import { expoAudio } from './native-module';
import type { IRecordingOptions } from './types';

/**
 * Fills in the per-platform recording config from `RecordingOptions`'s common fields, ported
 * from upstream's `utils/options.ts`. Only the fields the current platform's native recorder
 * reads are kept, with `options.ios`/`options.android`/`options.web` spread on top so an
 * explicit per-platform override always wins.
 */
function createRecordingOptions(options: IRecordingOptions) {
  const commonOptions = {
    extension: options.extension,
    sampleRate: options.sampleRate,
    numberOfChannels: options.numberOfChannels,
    bitRate: options.bitRate,
    isMeteringEnabled: options.isMeteringEnabled ?? false,
  };

  if (Platform.OS === 'ios') {
    return { ...commonOptions, directory: options.directory, ...options.ios };
  }
  if (Platform.OS === 'android') {
    return {
      ...commonOptions,
      directory: options.directory,
      ...options.android,
    };
  }
  return { ...commonOptions, ...options.web };
}

// Upstream shims `prepareToRecordAsync` onto `AudioModule.AudioRecorder.prototype` at module
// load, EXCEPT on tvOS (recording prototypes "should not be shimmed on tvOS, where they do not
// exist" — ExpoAudio.ts). tvOS is not a target platform of this project (root CLAUDE.md: iOS +
// Android only), so that branch is dropped — the options are always processed.
export class AudioRecorder extends expoAudio.AudioRecorder {
  override prepareToRecordAsync(
    options?: Partial<IRecordingOptions>,
  ): Promise<void> {
    const processedOptions = options
      ? createRecordingOptions(options as IRecordingOptions)
      : undefined;
    return super.prepareToRecordAsync(processedOptions);
  }
}
