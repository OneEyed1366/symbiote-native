import type { SharedObject, SharedRef } from 'expo-modules-core';

export type IVideoPlayerStatus = 'idle' | 'loading' | 'readyToPlay' | 'error';

export type IVideoContentType =
  'auto' | 'progressive' | 'hls' | 'dash' | 'smoothStreaming';

export type IVideoDrmType = 'clearkey' | 'fairplay' | 'playready' | 'widevine';

export type IVideoDrmOptions = {
  type: IVideoDrmType;
  licenseServer: string;
  headers?: Record<string, string>;
  /** Android only */
  multiKey?: boolean;
  /** iOS only */
  contentId?: string;
  /** iOS only */
  certificateUrl?: string;
  /** iOS only */
  base64CertificateData?: string;
};

export type IVideoMetadata = {
  title?: string;
  artist?: string;
  artwork?: string;
};

export type IVideoSourceObject = {
  uri?: string;
  /** A `require`d asset, `uri` wins when both are set */
  assetId?: number;
  drm?: IVideoDrmOptions;
  metadata?: IVideoMetadata;
  headers?: Record<string, string>;
  /** Caches the video on disk, off by default */
  useCaching?: boolean;
  contentType?: IVideoContentType;
};

/** A URI, a `require`d asset or an object, `null` unloads the player */
export type IVideoSource = string | number | null | IVideoSourceObject;

export type IVideoPlayerError = { message: string };

export type IVideoAudioMixingMode =
  'mixWithOthers' | 'duckOthers' | 'auto' | 'doNotMix';

export type IVideoBufferOptions = {
  /** iOS only, in seconds */
  readonly preferredForwardBufferDuration?: number;
  /** iOS only */
  readonly waitsToMinimizeStalling?: boolean;
  /** Android only, in seconds */
  readonly minBufferForPlayback?: number;
  /** Android only, in bytes */
  readonly maxBufferBytes?: number | null;
  /** Android only */
  readonly prioritizeTimeOverSizeThreshold?: boolean;
};

export type IVideoTextTrack = {
  id?: string;
  language: string;
  label: string;
  name?: string;
  isDefault?: boolean;
  autoSelect?: boolean;
};

export type IVideoSubtitleTrack = IVideoTextTrack;

export type IVideoAudioTrack = IVideoTextTrack;

export type IVideoSize = { width: number; height: number };

export type IVideoRange = 'sdr' | 'hlg' | 'pq';

export type IVideoTrack = {
  id: string;
  url: string | null;
  size: IVideoSize;
  mimeType: string | null;
  isSupported: boolean;
  bitrate: number | null;
  averageBitrate: number | null;
  peakBitrate: number | null;
  frameRate: number | null;
  videoRange: IVideoRange;
};

export type IVideoSeekTolerance = {
  /** iOS only, in seconds */
  toleranceBefore?: number;
  /** iOS only, in seconds */
  toleranceAfter?: number;
};

export type IVideoScrubbingModeOptions = {
  /** Android only */
  scrubbingModeEnabled?: boolean;
  increaseCodecOperatingRate?: boolean;
  enableDynamicScheduling?: boolean;
  useDecodeOnlyFlag?: boolean;
  allowSkippingMediaCodecFlush?: boolean;
};

/** Options of the Android player builder, applied before the native constructor runs */
export type IVideoPlayerBuilderOptions = {
  /** In seconds */
  seekBackwardIncrement?: number;
  /** In seconds */
  seekForwardIncrement?: number;
};

export type IVideoThumbnailOptions = {
  maxWidth?: number;
  maxHeight?: number;
};

export type IVideoPlayerEvents = {
  statusChange(payload: {
    status: IVideoPlayerStatus;
    oldStatus?: IVideoPlayerStatus;
    error?: IVideoPlayerError;
  }): void;
  playingChange(payload: { isPlaying: boolean; oldIsPlaying?: boolean }): void;
  playbackRateChange(payload: {
    playbackRate: number;
    oldPlaybackRate?: number;
  }): void;
  volumeChange(payload: { volume: number; oldVolume?: number }): void;
  mutedChange(payload: { muted: boolean; oldMuted?: boolean }): void;
  playToEnd(): void;
  timeUpdate(payload: {
    currentTime: number;
    currentLiveTimestamp: number | null;
    currentOffsetFromLive: number | null;
    bufferedPosition: number;
  }): void;
  sourceChange(payload: {
    source: IVideoSource;
    oldSource?: IVideoSource;
  }): void;
  availableSubtitleTracksChange(payload: {
    availableSubtitleTracks: IVideoSubtitleTrack[];
    oldAvailableSubtitleTracks?: IVideoSubtitleTrack[];
  }): void;
  subtitleTrackChange(payload: {
    subtitleTrack: IVideoSubtitleTrack | null;
    oldSubtitleTrack?: IVideoSubtitleTrack | null;
  }): void;
  availableAudioTracksChange(payload: {
    availableAudioTracks: IVideoAudioTrack[];
    oldAvailableAudioTracks?: IVideoAudioTrack[];
  }): void;
  audioTrackChange(payload: {
    audioTrack: IVideoAudioTrack | null;
    oldAudioTrack?: IVideoAudioTrack | null;
  }): void;
  videoTrackChange(payload: {
    videoTrack: IVideoTrack | null;
    oldVideoTrack?: IVideoTrack | null;
  }): void;
  sourceLoad(payload: {
    videoSource: IVideoSource | null;
    duration: number;
    availableVideoTracks: IVideoTrack[];
    availableSubtitleTracks: IVideoSubtitleTrack[];
    availableAudioTracks: IVideoAudioTrack[];
  }): void;
  isExternalPlaybackActiveChange(payload: {
    isExternalPlaybackActive: boolean;
    oldIsExternalPlaybackActive?: boolean;
  }): void;
};

/** The native thumbnail, `expo-image` takes it as an image source */
export declare class VideoThumbnail extends SharedRef<'image'> {
  width: number;
  height: number;
  /** In seconds */
  requestedTime: number;
  /** In seconds, iOS only */
  actualTime: number;
}

export declare class VideoPlayer extends SharedObject<IVideoPlayerEvents> {
  readonly playing: boolean;
  loop: boolean;
  /** iOS only */
  allowsExternalPlayback: boolean;
  audioMixingMode: IVideoAudioMixingMode;
  muted: boolean;
  /** In seconds, assigning seeks */
  currentTime: number;
  readonly currentLiveTimestamp: number | null;
  readonly currentOffsetFromLive: number | null;
  targetOffsetFromLive: number;
  readonly duration: number;
  volume: number;
  preservesPitch: boolean;
  /** In seconds, `0` turns the `timeUpdate` event off */
  timeUpdateEventInterval: number;
  playbackRate: number;
  keepScreenOnWhilePlaying: boolean;
  readonly isLive: boolean;
  readonly status: IVideoPlayerStatus;
  showNowPlayingNotification: boolean;
  staysActiveInBackground: boolean;
  readonly bufferedPosition: number;
  bufferOptions: IVideoBufferOptions;
  subtitleTrack: IVideoSubtitleTrack | null;
  audioTrack: IVideoAudioTrack | null;
  readonly availableAudioTracks: IVideoAudioTrack[];
  readonly availableSubtitleTracks: IVideoSubtitleTrack[];
  readonly videoTrack: IVideoTrack | null;
  readonly availableVideoTracks: IVideoTrack[];
  readonly isExternalPlaybackActive: boolean;
  seekTolerance: IVideoSeekTolerance;
  scrubbingModeOptions: IVideoScrubbingModeOptions;

  constructor(
    source: IVideoSource,
    useSynchronousReplace?: boolean,
    playerBuilderOptions?: IVideoPlayerBuilderOptions,
  );

  play(): void;
  pause(): void;
  /** On iOS it loads the asset on the main thread, prefer `replaceAsync` */
  replace(source: IVideoSource, disableWarning?: boolean): void;
  replaceAsync(source: IVideoSource): Promise<void>;
  seekBy(seconds: number): void;
  replay(): void;
  generateThumbnailsAsync(
    times: number | number[],
    options?: IVideoThumbnailOptions,
  ): Promise<VideoThumbnail[]>;
}
