import { requireNativeModule, SharedObject } from 'expo-modules-core';
import type { PermissionResponse } from 'expo-modules-core';
import type {
  IAudioMetadata,
  IAudioMode,
  IAudioPlaylistLoopMode,
  IAudioSample,
  IAudioSource,
  IAudioStatus,
  IAudioLockScreenOptions,
  IAudioPlaylistStatus,
  IPitchCorrectionQuality,
  IRecorderState,
  IRecordingInput,
  IRecordingOptions,
  IRecordingStartOptions,
  IRecordingStatus,
} from './types';

// `declare class ... extends SharedObject<Events>` (matching upstream's own AudioModule.types.ts
// pattern, and packages/media-library/src/next/native-module.ts's precedent for this shape), not
// a flat object type with a self-referential `new(...): T` construct signature — the latter makes
// TypeScript report spurious `override` errors on the JS classes that `extends` these.
// `SharedObject` is a REAL export of expo-modules-core (its JSI-backed base class) — we never
// reimplement it, only declare the per-class surface these native classes carry.

export type NativeAudioPlayerEvents = {
  playbackStatusUpdate(status: IAudioStatus): void;
  audioSampleUpdate(data: IAudioSample): void;
};

export declare class NativeAudioPlayer extends SharedObject<NativeAudioPlayerEvents> {
  constructor(
    source: IAudioSource,
    updateInterval: number,
    keepAudioSessionActive: boolean,
    preferredForwardBufferDuration: number,
  );
  id: string;
  playing: boolean;
  muted: boolean;
  loop: boolean;
  paused: boolean;
  isLoaded: boolean;
  isAudioSamplingSupported: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  shouldCorrectPitch: boolean;
  currentStatus: IAudioStatus;
  play(): void;
  pause(): void;
  replace(source: IAudioSource): void;
  seekTo(
    seconds: number,
    toleranceMillisBefore?: number,
    toleranceMillisAfter?: number,
  ): Promise<void>;
  setPlaybackRate(
    rate: number,
    pitchCorrectionQuality?: IPitchCorrectionQuality,
  ): void;
  setAudioSamplingEnabled(enabled: boolean): void;
  setActiveForLockScreen(
    active: boolean,
    metadata?: IAudioMetadata,
    options?: IAudioLockScreenOptions,
  ): void;
  updateLockScreenMetadata(metadata: IAudioMetadata): void;
  clearLockScreenControls(): void;
  remove(): void;
}

export type NativeAudioRecorderEvents = {
  recordingStatusUpdate: (status: IRecordingStatus) => void;
};

export declare class NativeAudioRecorder extends SharedObject<NativeAudioRecorderEvents> {
  constructor(options: Partial<IRecordingOptions>);
  id: string;
  currentTime: number;
  isRecording: boolean;
  uri: string | null;
  record(options?: IRecordingStartOptions): void;
  stop(): Promise<void>;
  pause(): void;
  getAvailableInputs(): IRecordingInput[];
  getCurrentInput(): Promise<IRecordingInput>;
  setInput(inputUid: string): void;
  getStatus(): IRecorderState;
  /** @deprecated Use `record({ atTime: seconds })` instead. */
  startRecordingAtTime(seconds: number): void;
  prepareToRecordAsync(options?: Partial<IRecordingOptions>): Promise<void>;
  /** @deprecated Use `record({ forDuration: seconds })` instead. */
  recordForDuration(seconds: number): void;
}

export type NativeAudioPlaylistEvents = {
  playlistStatusUpdate(status: IAudioPlaylistStatus): void;
  trackChanged(data: { previousIndex: number; currentIndex: number }): void;
};

export declare class NativeAudioPlaylist extends SharedObject<NativeAudioPlaylistEvents> {
  constructor(
    sources: IAudioSource[],
    updateInterval: number,
    loop: IAudioPlaylistLoopMode,
  );
  id: string;
  readonly currentIndex: number;
  readonly trackCount: number;
  readonly sources: { uri?: string; name?: string }[];
  playing: boolean;
  muted: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  loop: IAudioPlaylistLoopMode;
  currentStatus: IAudioPlaylistStatus;
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  skipTo(index: number): void;
  seekTo(seconds: number): Promise<void>;
  add(source: IAudioSource): void;
  insert(source: IAudioSource, index: number): void;
  remove(index: number): void;
  clear(): void;
  destroy(): void;
}

export type NativeAudioStreamEvents = {
  audioStreamBuffer(buffer: {
    data: ArrayBuffer;
    sampleRate: number;
    channels: number;
    timestamp: number;
  }): void;
  audioStreamStatus(status: { isStreaming: boolean }): void;
};

export declare class NativeAudioStream extends SharedObject<NativeAudioStreamEvents> {
  constructor(options: {
    sampleRate: number;
    channels: number;
    encoding: string;
  });
  id: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly isStreaming: boolean;
  start(): Promise<void>;
  stop(): void;
}

export type INativeAudioModule = {
  readonly AudioPlayer: typeof NativeAudioPlayer;
  readonly AudioRecorder: typeof NativeAudioRecorder;
  readonly AudioPlaylist: typeof NativeAudioPlaylist;
  readonly AudioStream: typeof NativeAudioStream;
  setIsAudioActiveAsync(active: boolean): Promise<void>;
  setAudioModeAsync(mode: Partial<IAudioMode>): Promise<void>;
  requestRecordingPermissionsAsync(): Promise<PermissionResponse>;
  requestNotificationPermissionsAsync(): Promise<PermissionResponse>;
  getRecordingPermissionsAsync(): Promise<PermissionResponse>;
  preload(
    source: IAudioSource,
    preferredForwardBufferDuration: number,
  ): Promise<void>;
  clearPreloadedSource(source: IAudioSource): Promise<void>;
  clearAllPreloadedSources(): Promise<void>;
  getPreloadedSources(): Promise<string[]>;
};

export const expoAudio = requireNativeModule<INativeAudioModule>('ExpoAudio');
