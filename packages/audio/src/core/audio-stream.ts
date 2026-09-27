import { expoAudio } from './native-module';
import type { IAudioStreamOptions } from './types';

// Plain re-export — upstream has no prototype shim for `AudioStream` either.
export const AudioStream = expoAudio.AudioStream;
export type AudioStream = InstanceType<typeof AudioStream>;

/**
 * Creates a native `AudioStream` for real-time PCM microphone capture. Call `.start()` to
 * begin and `.stop()` to end; requires microphone permission — see
 * `requestRecordingPermissionsAsync`. Upstream only exposes this via the `useAudioStream` hook
 * (React-only, see the package README); this factory is the framework-agnostic equivalent — the
 * hook itself just applies these same defaults and wires `addListener` for
 * `AUDIO_STREAM_STATUS`/`AUDIO_STREAM_BUFFER` on top, which each adapter's own lifecycle wrapper
 * is responsible for.
 */
export function createAudioStream(
  options: IAudioStreamOptions = {},
): AudioStream {
  const { sampleRate = 48000, channels = 1, encoding = 'float32' } = options;
  return new AudioStream({ sampleRate, channels, encoding });
}
