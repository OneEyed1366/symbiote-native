import { useEffect, useRef, useState } from 'react';
import {
  PLAYLIST_STATUS_UPDATE,
  TRACK_CHANGED,
  createAudioPlaylist,
  useAudioPlaylist,
  useAudioPlaylistStatus,
} from '@symbiote-native/audio/react';
import type { AudioPlaylist, IAudioPlaylistLoopMode } from '@symbiote-native/audio/react';
import { CallConsole } from '../components/CallConsole';
import { Card, ChoiceRow, Field, ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Audio);
const TRACKS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
];
const EXTRA_TRACK = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3';
const LOOPS: readonly { label: string; value: IAudioPlaylistLoopMode }[] = [
  { label: 'none', value: 'none' },
  { label: 'single', value: 'single' },
  { label: 'all', value: 'all' },
];

type IForm = { loop: IAudioPlaylistLoopMode; interval: string; index: string; seconds: string; source: string };
type ISetForm = (patch: Partial<IForm>) => void;

function FormCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="audio-playlist-form-card" title="Playlist inputs">
      <ChoiceRow testID="audio-playlist-loop" label="loop" options={LOOPS} value={form.loop} onChange={loop => setForm({ loop })} color={color} />
      <Field testID="audio-playlist-interval-input" label="updateInterval ms" value={form.interval} onChange={interval => setForm({ interval })} />
      <Field testID="audio-playlist-index-input" label="index (skipTo, insert, remove)" value={form.index} onChange={index => setForm({ index })} />
      <Field testID="audio-playlist-seconds-input" label="seekTo seconds" value={form.seconds} onChange={seconds => setForm({ seconds })} />
      <Field testID="audio-playlist-source-input" label="source uri (add, insert)" value={form.source} onChange={source => setForm({ source })} />
    </Card>
  );
}

function StatusCard({ playlist }: { playlist: AudioPlaylist }) {
  const status = useAudioPlaylistStatus(playlist);
  const [lastChange, setLastChange] = useState('no track change yet');
  useEffect(() => {
    const subscription = playlist.addListener(TRACK_CHANGED, data => setLastChange(`${data.previousIndex} -> ${data.currentIndex}`));
    return () => subscription.remove();
  }, [playlist]);
  return (
    <Card testID="audio-playlist-status-card" title={`useAudioPlaylistStatus (${PLAYLIST_STATUS_UPDATE})`}>
      <ResultRow testID="audio-playlist-track" label="currentIndex / trackCount" value={`${status.currentIndex} / ${status.trackCount}`} />
      <ResultRow testID="audio-playlist-time" label="currentTime / duration" value={`${status.currentTime.toFixed(1)} / ${status.duration.toFixed(1)}`} />
      <ResultRow testID="audio-playlist-flags" label="playing, loaded, buffering" value={`${status.playing}, ${status.isLoaded}, ${status.isBuffering}`} />
      <ResultRow testID="audio-playlist-mix" label="volume, rate, muted, loop" value={`${status.volume}, ${status.playbackRate}, ${status.muted}, ${status.loop}`} />
      <ResultRow testID="audio-playlist-finished" label="didJustFinish" value={String(status.didJustFinish)} />
      <ResultRow testID="audio-playlist-change" label={TRACK_CHANGED} value={lastChange} />
    </Card>
  );
}

function controls(playlist: AudioPlaylist, form: IForm) {
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
    { label: 'set loop', run: async () => { playlist.loop = form.loop; return playlist.loop; } },
    { label: 'toggle muted', run: async () => { playlist.muted = !playlist.muted; return playlist.muted; } },
    { label: 'volume 0.4', run: async () => { playlist.volume = 0.4; return playlist.volume; } },
    { label: 'playbackRate 1.25', run: async () => { playlist.playbackRate = 1.25; return playlist.playbackRate; } },
    { label: 'sources', run: async () => playlist.sources },
    { label: 'currentStatus', run: async () => playlist.currentStatus },
  ];
}

function HookPlaylist({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  const playlist = useAudioPlaylist({ sources: TRACKS, updateInterval: Number(form.interval), loop: form.loop });
  return (
    <>
      <FormCard form={form} setForm={setForm} />
      <CallConsole prefix="audio-playlist" title="useAudioPlaylist controls" color={color} hint="Changing interval or loop recreates the playlist." calls={controls(playlist, form)} />
      <StatusCard playlist={playlist} />
    </>
  );
}

function ImperativePlaylist({ form }: { form: IForm }) {
  const playlist = useRef<AudioPlaylist | null>(null);
  const live = () => {
    if (playlist.current === null) {
      throw new Error('createAudioPlaylist first');
    }
    return playlist.current;
  };
  return (
    <CallConsole
      prefix="audio-playlist-imperative"
      title="createAudioPlaylist (manual lifetime)"
      color={color}
      calls={[
        { label: 'createAudioPlaylist', run: async () => { playlist.current = createAudioPlaylist({ sources: [...TRACKS, EXTRA_TRACK], updateInterval: Number(form.interval), loop: form.loop }); return playlist.current.id; } },
        { label: 'play (imperative)', run: async () => live().play() },
        { label: 'destroy', run: async () => { live().destroy(); playlist.current = null; return 'destroyed'; } },
      ]}
    />
  );
}

export function PlaylistCards() {
  const [form, setFormState] = useState<IForm>({ loop: 'none', interval: '500', index: '0', seconds: '20', source: EXTRA_TRACK });
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <HookPlaylist form={form} setForm={setForm} />
      <ImperativePlaylist form={form} />
    </>
  );
}
