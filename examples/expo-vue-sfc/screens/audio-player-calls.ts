import type {
  AudioPlayer,
  IPitchCorrectionQuality,
} from '@symbiote-native/audio/vue';
import type { ICall } from '../components/call-console';

export const TRACK_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
export const ALTERNATE_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3';
export const QUALITIES = (
  [
    'low',
    'medium',
    'high',
  ] as const satisfies readonly IPitchCorrectionQuality[]
).map(value => ({ label: value, value }));

export type IPlayerForm = {
  source: string;
  updateInterval: string;
  isDownloadFirst: boolean;
  isKeepSession: boolean;
  forwardBuffer: string;
  seconds: string;
  rate: string;
  quality: IPitchCorrectionQuality;
  title: string;
  artist: string;
  isSeekButtons: boolean;
  isLiveStream: boolean;
};

export const INITIAL_PLAYER_FORM: IPlayerForm = {
  source: ALTERNATE_URL,
  updateInterval: '500',
  isDownloadFirst: false,
  isKeepSession: false,
  forwardBuffer: '0',
  seconds: '30',
  rate: '1.5',
  quality: 'medium',
  title: 'Canary track',
  artist: 'Symbiote',
  isSeekButtons: true,
  isLiveStream: false,
};

export function toPlayerOptions(form: IPlayerForm) {
  return {
    updateInterval: Number(form.updateInterval),
    downloadFirst: form.isDownloadFirst,
    keepAudioSessionActive: form.isKeepSession,
    preferredForwardBufferDuration: Number(form.forwardBuffer),
  };
}

export function playerControls(
  player: AudioPlayer,
  form: IPlayerForm,
): ICall[] {
  return [
    { label: 'play', run: async () => player.play() },
    { label: 'pause', run: async () => player.pause() },
    { label: 'seekTo', run: () => player.seekTo(Number(form.seconds)) },
    {
      label: 'setPlaybackRate',
      run: async () => player.setPlaybackRate(Number(form.rate), form.quality),
    },
    { label: 'replace', run: async () => player.replace(form.source) },
    {
      label: 'replace (alternate track)',
      run: async () => player.replace(ALTERNATE_URL),
    },
    { label: 'replace (null)', run: async () => player.replace(null) },
    {
      label: 'toggle loop',
      run: async () => {
        player.loop = !player.loop;
        return player.loop;
      },
    },
    {
      label: 'toggle muted',
      run: async () => {
        player.muted = !player.muted;
        return player.muted;
      },
    },
    {
      label: 'volume 0.3',
      run: async () => {
        player.volume = 0.3;
        return player.volume;
      },
    },
    {
      label: 'volume 1',
      run: async () => {
        player.volume = 1;
        return player.volume;
      },
    },
    {
      label: 'shouldCorrectPitch toggle',
      run: async () => {
        player.shouldCorrectPitch = !player.shouldCorrectPitch;
        return player.shouldCorrectPitch;
      },
    },
    { label: 'currentStatus', run: async () => player.currentStatus },
  ];
}

export function lockScreenCalls(
  player: AudioPlayer,
  form: IPlayerForm,
): ICall[] {
  return [
    {
      label: 'setActiveForLockScreen',
      run: async () =>
        player.setActiveForLockScreen(
          true,
          { title: form.title, artist: form.artist },
          {
            showSeekForward: form.isSeekButtons,
            showSeekBackward: form.isSeekButtons,
            isLiveStream: form.isLiveStream,
          },
        ),
    },
    {
      label: 'updateLockScreenMetadata',
      run: async () =>
        player.updateLockScreenMetadata({
          title: form.title,
          artist: form.artist,
        }),
    },
    {
      label: 'clearLockScreenControls',
      run: async () => player.clearLockScreenControls(),
    },
  ];
}
