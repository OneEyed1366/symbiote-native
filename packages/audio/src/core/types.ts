// Ported from expo-audio's Audio.types.ts / AudioModule.types.ts / AudioConstants.ts /
// RecordingConstants.ts / AudioStream.types.ts / AudioEventKeys.ts, renamed with this repo's
// `I`-prefix convention for object/union-shaped exported types (enums keep their upstream name,
// matching packages/local-auth's AuthenticationType/SecurityLevel).
import type { Asset } from '@symbiote-native/asset';

import type { AudioQuality, IOSOutputFormat } from './recording-presets';

/** Audio source information returned from native when reading sources from a queue. */
export type IAudioSourceInfo = {
  uri?: string;
  name?: string;
};

/** A URI, a `require()` module id, an `Asset`, or a source object — see resolve-source.ts. */
export type IAudioSource =
  | string
  | number
  | Asset
  | null
  | {
      uri?: string;
      /** id of a local asset from `require()`; ignored if `uri` is set. */
      assetId?: number;
      headers?: Record<string, string>;
      name?: string;
    };

export type IAudioPlayerOptions = {
  /** How often (in milliseconds) to emit playback status updates. @default 500 */
  updateInterval?: number;
  /** @platform web */
  crossOrigin?: 'anonymous' | 'use-credentials';
  /**
   * If `true`, the audio session is not deactivated when this player pauses or finishes.
   * @platform ios
   * @default false
   */
  keepAudioSessionActive?: boolean;
  /**
   * Seconds to buffer ahead of the current playback position.
   * @platform ios
   * @platform android
   * @default 0
   */
  preferredForwardBufferDuration?: number;
  /** Downloads the source via `Asset` before the native player loads it. @default false */
  downloadFirst?: boolean;
};

export type IPreloadOptions = {
  /** @default 10 */
  preferredForwardBufferDuration?: number;
};

export type IRecordingInput = {
  name: string;
  type: string;
  uid: string;
};

export type IPitchCorrectionQuality = 'low' | 'medium' | 'high';

export type IAudioStatus = {
  id: string;
  currentTime: number;
  playbackState: string;
  timeControlStatus: string;
  reasonForWaitingToPlay: string;
  mute: boolean;
  duration: number;
  playing: boolean;
  loop: boolean;
  didJustFinish: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  playbackRate: number;
  shouldCorrectPitch: boolean;
  /** @platform ios */
  mediaServicesDidReset?: boolean;
  isLive: boolean;
  currentOffsetFromLive: number | null;
  error: string | null;
};

export type IRecordingStatus = {
  id: string;
  isFinished: boolean;
  hasError: boolean;
  error: string | null;
  url: string | null;
  /** @platform ios */
  mediaServicesDidReset?: boolean;
};

export type IRecorderState = {
  canRecord: boolean;
  isRecording: boolean;
  durationMillis: number;
  mediaServicesDidReset: boolean;
  metering?: number;
  url: string | null;
};

/** @platform android */
export type IAndroidOutputFormat =
  | 'default'
  | '3gp'
  | 'mpeg4'
  | 'amrnb'
  | 'amrwb'
  | 'aac_adts'
  | 'mpeg2ts'
  | 'webm';

/** @platform android */
export type IAndroidAudioEncoder =
  'default' | 'amr_nb' | 'amr_wb' | 'aac' | 'he_aac' | 'aac_eld';

export type IRecordingStartOptions = {
  /** @platform ios @platform android @platform web */
  forDuration?: number;
  /** @platform ios */
  atTime?: number;
};

/** @platform android @platform ios */
export type IRecordingDirectory = 'cache' | 'document';

export type IRecordingOptionsWeb = {
  mimeType?: string;
  bitsPerSecond?: number;
};

/** @platform ios */
export type IRecordingOptionsIos = {
  extension?: string;
  sampleRate?: number;
  outputFormat?: string | IOSOutputFormat | number;
  audioQuality: AudioQuality | number;
  bitRateStrategy?: number;
  bitDepthHint?: number;
  linearPCMBitDepth?: number;
  linearPCMIsBigEndian?: boolean;
  linearPCMIsFloat?: boolean;
};

/** @platform android */
export type IRecordingSource =
  | 'camcorder'
  | 'default'
  | 'mic'
  | 'remote_submix'
  | 'unprocessed'
  | 'voice_communication'
  | 'voice_performance'
  | 'voice_recognition';

/** @platform android */
export type IRecordingOptionsAndroid = {
  extension?: string;
  sampleRate?: number;
  outputFormat: IAndroidOutputFormat;
  audioEncoder: IAndroidAudioEncoder;
  maxFileSize?: number;
  audioSource?: IRecordingSource;
};

export type IRecordingOptions = {
  /** @default 'cache' */
  directory?: IRecordingDirectory;
  isMeteringEnabled?: boolean;
  extension: string;
  sampleRate: number;
  numberOfChannels: number;
  bitRate: number;
  android: IRecordingOptionsAndroid;
  ios: IRecordingOptionsIos;
  web: IRecordingOptionsWeb;
};

export type IAudioMode = {
  /** @default true */
  playsInSilentMode: boolean;
  /** @default 'mixWithOthers' */
  interruptionMode: IInterruptionMode;
  /** @default false @platform ios */
  allowsRecording: boolean;
  /** @default false */
  shouldPlayInBackground: boolean;
  /** @default false */
  shouldRouteThroughEarpiece: boolean;
  /** @default false @platform ios @platform android */
  allowsBackgroundRecording?: boolean;
};

export type IInterruptionMode = 'mixWithOthers' | 'doNotMix' | 'duckOthers';

export type IAudioMetadata = {
  title?: string;
  artist?: string;
  albumTitle?: string;
  artworkUrl?: string;
};

export type IAudioPlaylistLoopMode = 'none' | 'single' | 'all';

export type IAudioPlaylistOptions = {
  /** @default [] */
  sources?: IAudioSource[];
  /** @default 500 */
  updateInterval?: number;
  /** @default 'none' */
  loop?: IAudioPlaylistLoopMode;
  /** @platform web */
  crossOrigin?: 'anonymous' | 'use-credentials';
};

export type IAudioPlaylistStatus = {
  id: string;
  currentIndex: number;
  trackCount: number;
  currentTime: number;
  duration: number;
  playing: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  playbackRate: number;
  muted: boolean;
  volume: number;
  loop: IAudioPlaylistLoopMode;
  didJustFinish: boolean;
};

/** From AudioConstants.ts — which lock-screen controls to show while a player is active. */
export type IAudioLockScreenOptions = {
  showSeekForward?: boolean;
  showSeekBackward?: boolean;
  isLiveStream?: boolean;
};

export type IAudioSample = {
  channels: { frames: number[] }[];
  timestamp: number;
};

export type IAudioStreamEncoding = 'float32' | 'int16';

export type IAudioStreamOptions = {
  /** @default 48000 */
  sampleRate?: number;
  /** @default 1 */
  channels?: number;
  /** @default 'float32' */
  encoding?: IAudioStreamEncoding;
};

export type IAudioStreamBuffer = {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
};

export type IAudioStreamStatus = {
  isStreaming: boolean;
};

/** From AudioEventKeys.ts — event names the `SharedObject` classes' `addListener` accepts. */
export const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate';
export const AUDIO_SAMPLE_UPDATE = 'audioSampleUpdate';
export const RECORDING_STATUS_UPDATE = 'recordingStatusUpdate';
export const PLAYLIST_STATUS_UPDATE = 'playlistStatusUpdate';
export const TRACK_CHANGED = 'trackChanged';
export const AUDIO_STREAM_BUFFER = 'audioStreamBuffer';
export const AUDIO_STREAM_STATUS = 'audioStreamStatus';
