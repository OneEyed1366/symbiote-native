import { defineComponent, onUnmounted, ref } from 'vue';
import {
  PLAYLIST_STATUS_UPDATE,
  TRACK_CHANGED,
  createAudioPlaylist,
  useAudioPlaylist,
  useAudioPlaylistStatus,
} from '@symbiote-native/audio/vue';
import type { AudioPlaylist, IAudioPlaylistLoopMode } from '@symbiote-native/audio/vue';
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

function FormCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="audio-playlist-form-card" title="Playlist inputs">
      <ChoiceRow testID="audio-playlist-loop" label="loop" options={LOOPS} value={props.form.loop} onChange={loop => props.setForm({ loop })} color={color} />
      <Field testID="audio-playlist-interval-input" label="updateInterval ms" value={props.form.interval} onChange={interval => props.setForm({ interval })} />
      <Field testID="audio-playlist-index-input" label="index (skipTo, insert, remove)" value={props.form.index} onChange={index => props.setForm({ index })} />
      <Field testID="audio-playlist-seconds-input" label="seekTo seconds" value={props.form.seconds} onChange={seconds => props.setForm({ seconds })} />
      <Field testID="audio-playlist-source-input" label="source uri (add, insert)" value={props.form.source} onChange={source => props.setForm({ source })} />
    </Card>
  );
}

const StatusCard = defineComponent<{ playlist: AudioPlaylist }>(
  props => {
    const status = useAudioPlaylistStatus(() => props.playlist);
    const lastChange = ref('no track change yet');
    const subscription = props.playlist.addListener(TRACK_CHANGED, data => {
      lastChange.value = `${data.previousIndex} -> ${data.currentIndex}`;
    });
    onUnmounted(() => subscription.remove());
    return () => (
      <Card testID="audio-playlist-status-card" title={`useAudioPlaylistStatus (${PLAYLIST_STATUS_UPDATE})`}>
        <ResultRow testID="audio-playlist-track" label="currentIndex / trackCount" value={`${status.value.currentIndex} / ${status.value.trackCount}`} />
        <ResultRow testID="audio-playlist-time" label="currentTime / duration" value={`${status.value.currentTime.toFixed(1)} / ${status.value.duration.toFixed(1)}`} />
        <ResultRow testID="audio-playlist-flags" label="playing, loaded, buffering" value={`${status.value.playing}, ${status.value.isLoaded}, ${status.value.isBuffering}`} />
        <ResultRow testID="audio-playlist-mix" label="volume, rate, muted, loop" value={`${status.value.volume}, ${status.value.playbackRate}, ${status.value.muted}, ${status.value.loop}`} />
        <ResultRow testID="audio-playlist-finished" label="didJustFinish" value={String(status.value.didJustFinish)} />
        <ResultRow testID="audio-playlist-change" label={TRACK_CHANGED} value={lastChange.value} />
      </Card>
    );
  },
  { name: 'StatusCard', props: ['playlist'] },
);

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

const HookPlaylist = defineComponent<{ form: IForm; setForm: ISetForm }>(
  props => {
    const playlist = useAudioPlaylist(() => ({ sources: TRACKS, updateInterval: Number(props.form.interval), loop: props.form.loop }));
    return () => (
      <>
        <FormCard form={props.form} setForm={props.setForm} />
        <CallConsole prefix="audio-playlist" title="useAudioPlaylist controls" color={color} hint="Changing interval or loop recreates the playlist." calls={controls(playlist.value, props.form)} />
        <StatusCard key={playlist.value.id} playlist={playlist.value} />
      </>
    );
  },
  { name: 'HookPlaylist', props: ['form', 'setForm'] },
);

const ImperativePlaylist = defineComponent<{ form: IForm }>(
  props => {
    let playlist: AudioPlaylist | null = null;
    const live = () => {
      if (playlist === null) {
        throw new Error('createAudioPlaylist first');
      }
      return playlist;
    };
    return () => (
      <CallConsole
        prefix="audio-playlist-imperative"
        title="createAudioPlaylist (manual lifetime)"
        color={color}
        calls={[
          { label: 'createAudioPlaylist', run: async () => { playlist = createAudioPlaylist({ sources: [...TRACKS, EXTRA_TRACK], updateInterval: Number(props.form.interval), loop: props.form.loop }); return playlist.id; } },
          { label: 'play (imperative)', run: async () => live().play() },
          { label: 'destroy', run: async () => { live().destroy(); playlist = null; return 'destroyed'; } },
        ]}
      />
    );
  },
  { name: 'ImperativePlaylist', props: ['form'] },
);

export const PlaylistCards = defineComponent(
  () => {
    const form = ref<IForm>({ loop: 'none', interval: '500', index: '0', seconds: '20', source: EXTRA_TRACK });
    const setForm: ISetForm = patch => {
      form.value = { ...form.value, ...patch };
    };
    return () => (
      <>
        <HookPlaylist form={form.value} setForm={setForm} />
        <ImperativePlaylist form={form.value} />
      </>
    );
  },
  { name: 'PlaylistCards' },
);
