export { AudioPlayer, createAudioPlayer } from './audio-player';
export { AudioRecorder } from './audio-recorder';
export { AudioPlaylist, createAudioPlaylist } from './audio-playlist';
export { AudioStream, createAudioStream } from './audio-stream';
export {
  setIsAudioActiveAsync,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  requestNotificationPermissionsAsync,
  getRecordingPermissionsAsync,
  preload,
  clearPreloadedSource,
  clearAllPreloadedSources,
  getPreloadedSources,
} from './audio-module';
export { resolveSource, resolveSources } from './resolve-source';
export {
  RecordingPresets,
  IOSOutputFormat,
  AudioQuality,
} from './recording-presets';
export {
  PLAYBACK_STATUS_UPDATE,
  AUDIO_SAMPLE_UPDATE,
  RECORDING_STATUS_UPDATE,
  PLAYLIST_STATUS_UPDATE,
  TRACK_CHANGED,
  AUDIO_STREAM_BUFFER,
  AUDIO_STREAM_STATUS,
} from './types';
export type {
  IAudioSource,
  IAudioSourceInfo,
  IAudioPlayerOptions,
  IPreloadOptions,
  IRecordingInput,
  IPitchCorrectionQuality,
  IAudioStatus,
  IRecordingStatus,
  IRecorderState,
  IAndroidOutputFormat,
  IAndroidAudioEncoder,
  IRecordingStartOptions,
  IRecordingDirectory,
  IRecordingOptions,
  IRecordingOptionsWeb,
  IRecordingOptionsIos,
  IRecordingOptionsAndroid,
  IRecordingSource,
  IAudioMode,
  IInterruptionMode,
  IAudioMetadata,
  IAudioPlaylistLoopMode,
  IAudioPlaylistOptions,
  IAudioPlaylistStatus,
  IAudioLockScreenOptions,
  IAudioSample,
  IAudioStreamEncoding,
  IAudioStreamOptions,
  IAudioStreamBuffer,
  IAudioStreamStatus,
} from './types';
