import { Platform, type PermissionResponse } from 'expo-modules-core';
import { expoAudio } from './native-module';
import { resolveSource } from './resolve-source';
import type { IAudioMode, IAudioSource, IPreloadOptions } from './types';

/** Enables or disables the audio subsystem globally — pauses all playback when set to `false`. */
export async function setIsAudioActiveAsync(active: boolean): Promise<void> {
  return expoAudio.setIsAudioActiveAsync(active);
}

/** Configures the global audio session — background playback, mixing, interruption handling. */
export async function setAudioModeAsync(
  mode: Partial<IAudioMode>,
): Promise<void> {
  const audioMode: Partial<IAudioMode> =
    Platform.OS === 'ios'
      ? mode
      : {
          shouldPlayInBackground: mode.shouldPlayInBackground,
          shouldRouteThroughEarpiece: mode.shouldRouteThroughEarpiece,
          interruptionMode: mode.interruptionMode,
          allowsBackgroundRecording: mode.allowsBackgroundRecording,
          playsInSilentMode: mode.playsInSilentMode,
        };
  return expoAudio.setAudioModeAsync(audioMode);
}

/** Requests microphone-access permission required for recording. */
export async function requestRecordingPermissionsAsync(): Promise<PermissionResponse> {
  return expoAudio.requestRecordingPermissionsAsync();
}

/**
 * Requests permission to post notifications on Android, needed for lock-screen/notification-shade
 * playback controls. @platform android — throws on every other platform.
 */
export async function requestNotificationPermissionsAsync(): Promise<PermissionResponse> {
  if (Platform.OS !== 'android') {
    throw new Error(
      'expo-audio: `requestNotificationPermissionsAsync` is only available on Android.',
    );
  }
  return expoAudio.requestNotificationPermissionsAsync();
}

/** Checks the current recording-permission status without prompting. */
export async function getRecordingPermissionsAsync(): Promise<PermissionResponse> {
  return expoAudio.getRecordingPermissionsAsync();
}

/**
 * Preloads an audio source for near-instant playback later — call at module scope, before any
 * player is created from the same source.
 */
export async function preload(
  source: IAudioSource,
  options: IPreloadOptions = {},
): Promise<void> {
  const resolved = resolveSource(source);
  if (!resolved) return;
  const { preferredForwardBufferDuration = 10 } = options;
  return expoAudio.preload(resolved, preferredForwardBufferDuration);
}

/** Releases a specific preloaded source (must match what was passed to `preload`). */
export async function clearPreloadedSource(
  source: IAudioSource,
): Promise<void> {
  const resolved = resolveSource(source);
  if (!resolved) return;
  return expoAudio.clearPreloadedSource(resolved);
}

/** Releases every preloaded source. */
export async function clearAllPreloadedSources(): Promise<void> {
  return expoAudio.clearAllPreloadedSources();
}

/** URIs of every source currently in the preload cache. */
export async function getPreloadedSources(): Promise<string[]> {
  return expoAudio.getPreloadedSources();
}
