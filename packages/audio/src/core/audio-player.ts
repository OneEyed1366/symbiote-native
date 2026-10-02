import { Platform } from 'expo-modules-core';
import { expoAudio } from './native-module';
import { resolveSource, resolveSourceWithDownload } from './resolve-source';
import type {
  IAudioPlayerOptions,
  IAudioSource,
  IPitchCorrectionQuality,
} from './types';

// Upstream shims these two methods onto `AudioModule.AudioPlayer.prototype` at module load
// (ExpoAudio.ts). We do the equivalent by subclassing instead of monkey-patching the native
// class's prototype — same shape packages/media-library/src/next/asset.ts uses for its own
// platform-conditional overrides.
export class AudioPlayer extends expoAudio.AudioPlayer {
  override replace(source: IAudioSource): void {
    super.replace(resolveSource(source));
  }

  override setPlaybackRate(
    rate: number,
    pitchCorrectionQuality?: IPitchCorrectionQuality,
  ): void {
    if (Platform.OS === 'android') {
      super.setPlaybackRate(rate);
    } else {
      super.setPlaybackRate(rate, pitchCorrectionQuality);
    }
  }
}

/**
 * Creates an `AudioPlayer` that does not release automatically — call `.remove()` when done with
 * it. There is no lifecycle wrapper here (framework-agnostic core, see the package README); each
 * adapter's own hook/composable/service is responsible for releasing it on unmount, mirroring
 * upstream's `useReleasingSharedObject`.
 */
export function createAudioPlayer(
  source: IAudioSource = null,
  options: IAudioPlayerOptions = {},
): AudioPlayer {
  const {
    updateInterval = 500,
    downloadFirst = false,
    keepAudioSessionActive = false,
    preferredForwardBufferDuration = 0,
  } = options;
  const player = new AudioPlayer(
    downloadFirst ? null : resolveSource(source),
    updateInterval,
    keepAudioSessionActive,
    preferredForwardBufferDuration,
  );

  if (downloadFirst && source) {
    resolveSourceWithDownload(source)
      .then(resolved => {
        if (resolved) player.replace(resolved);
      })
      .catch(() => {
        const fallback = resolveSource(source);
        if (fallback) player.replace(fallback);
      });
  }

  return player;
}
