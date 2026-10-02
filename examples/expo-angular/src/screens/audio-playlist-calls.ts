import type {
  AudioPlaylist,
  IAudioPlaylistLoopMode,
} from '@symbiote-native/audio/angular';
import type { ICall } from '../components/call-console';

export const TRACKS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
];
export const EXTRA_TRACK =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3';
export const LOOPS: readonly {
  label: string;
  value: IAudioPlaylistLoopMode;
}[] = [
  { label: 'none', value: 'none' },
  { label: 'single', value: 'single' },
  { label: 'all', value: 'all' },
];

export type IPlaylistForm = {
  loop: IAudioPlaylistLoopMode;
  interval: string;
  index: string;
  seconds: string;
  source: string;
};

export const INITIAL_PLAYLIST_FORM: IPlaylistForm = {
  loop: 'none',
  interval: '500',
  index: '0',
  seconds: '20',
  source: EXTRA_TRACK,
};

export function playlistControls(
  playlist: AudioPlaylist,
  form: IPlaylistForm,
): ICall[] {
  const index = Number(form.index);
  return [
    { label: 'play', run: async () => playlist.play() },
    { label: 'pause', run: async () => playlist.pause() },
    { label: 'next', run: async () => playlist.next() },
    { label: 'previous', run: async () => playlist.previous() },
    { label: 'skipTo', run: async () => playlist.skipTo(index) },
    { label: 'seekTo', run: () => playlist.seekTo(Number(form.seconds)) },
    { label: 'add', run: async () => playlist.add(form.source) },
    { label: 'insert', run: async () => playlist.insert(form.source, index) },
    { label: 'remove', run: async () => playlist.remove(index) },
    { label: 'clear', run: async () => playlist.clear() },
    {
      label: 'set loop',
      run: async () => {
        playlist.loop = form.loop;
        return playlist.loop;
      },
    },
    {
      label: 'toggle muted',
      run: async () => {
        playlist.muted = !playlist.muted;
        return playlist.muted;
      },
    },
    {
      label: 'volume 0.4',
      run: async () => {
        playlist.volume = 0.4;
        return playlist.volume;
      },
    },
    {
      label: 'playbackRate 1.25',
      run: async () => {
        playlist.playbackRate = 1.25;
        return playlist.playbackRate;
      },
    },
    { label: 'sources', run: async () => playlist.sources },
    { label: 'currentStatus', run: async () => playlist.currentStatus },
  ];
}
