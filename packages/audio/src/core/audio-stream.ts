import { expoAudio } from './native-module';
import type { IAudioStreamBuffer, IAudioStreamOptions } from './types';

// Plain re-export — upstream has no prototype shim for `AudioStream` either.
export const AudioStream = expoAudio.AudioStream;
export type AudioStream = InstanceType<typeof AudioStream>;

export type IUseAudioStreamOptions = IAudioStreamOptions & {
  onBuffer?: (buffer: IAudioStreamBuffer) => void;
};

export type IAudioStreamResult = {
  stream: AudioStream;
  isStreaming: boolean;
};

/** Requires microphone permission - see `requestRecordingPermissionsAsync`. */
export function createAudioStream(
  options: IAudioStreamOptions = {},
): AudioStream {
  const { sampleRate = 48000, channels = 1, encoding = 'float32' } = options;
  return new AudioStream({ sampleRate, channels, encoding });
}
