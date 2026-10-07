import type {
  IVideoAudioMixingMode,
  IVideoContentFit,
  IVideoSourceObject,
} from '@symbiote-native/video';

export const MP4_URI =
  'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4';
export const CLIP_URI =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
export const HLS_URI =
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8';
export const TIME_UPDATE_SECONDS = 0.5;
const SECONDS_PER_MINUTE = 60;

export const SEEK_SECONDS = 10;
export const RATES = [0.5, 1, 1.5, 2].map(rate => ({
  label: `${rate}x`,
  value: rate,
}));
export const FEED_CLIPS = [CLIP_URI, MP4_URI, CLIP_URI];

export const MIXING_MODES: readonly IVideoAudioMixingMode[] = [
  'auto',
  'mixWithOthers',
  'duckOthers',
  'doNotMix',
];
export const FITS: readonly IVideoContentFit[] = ['contain', 'cover', 'fill'];
export const MIXING_OPTIONS = MIXING_MODES.map(item => ({
  label: item,
  value: item,
}));
export const FIT_OPTIONS = FITS.map(item => ({ label: item, value: item }));
export const METADATA_SOURCE: IVideoSourceObject = {
  uri: MP4_URI,
  metadata: {
    title: 'Big Buck Bunny',
    artist: 'Blender Foundation',
    artwork: 'https://picsum.photos/id/1025/300/300',
  },
};
export const THUMB_TIMES = [1, 10, 30, 60];
export const THUMB_MAX_WIDTH = 192;
export const CACHE_LIMIT_BYTES = 100_000_000;
export const BYTES_PER_MB = 1_000_000;
export const NO_TRACK = 'off';
export const FULLSCREEN_OPTIONS = {
  enable: true,
  orientation: 'landscape',
  autoExitOnRotate: false,
} as const;
export const CACHED_SOURCE = { uri: CLIP_URI, useCaching: true };

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const rest = String(whole % SECONDS_PER_MINUTE).padStart(2, '0');
  return `${Math.floor(whole / SECONDS_PER_MINUTE)}:${rest}`;
}

export function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function trackLabel(
  track: { label: string; language: string } | null,
): string {
  return track === null ? NO_TRACK : `${track.label} (${track.language})`;
}

export function statusLine(status: string, error: string | undefined): string {
  return error === undefined ? status : `${status}: ${error}`;
}

export function timeLine(
  currentTime: number,
  duration: number,
  buffered: number,
): string {
  return `${formatTime(currentTime)} / ${formatTime(duration)}, buffered to ${formatTime(buffered)}`;
}

export function trackSummary(
  duration: number,
  video: number,
  audio: number,
  subtitle: number,
): string {
  return `${formatTime(duration)}, ${video} video, ${audio} audio, ${subtitle} subtitle tracks`;
}

// A log of the newest lines first, four at most
export function pushLog(previous: string[], line: string): string[] {
  return [`${new Date().toLocaleTimeString()} ${line}`, ...previous].slice(
    0,
    4,
  );
}
