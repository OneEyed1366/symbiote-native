import { defineComponent, ref } from 'vue';
import {
  createAudioPlayer,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioSampleListener,
} from '@symbiote-native/audio/vue';
import type { AudioPlayer, IAudioSample, IPitchCorrectionQuality } from '@symbiote-native/audio/vue';
import { CallConsole } from '../components/CallConsole';
import { Card, ChoiceRow, Field, ResultRow, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Audio);
export const TRACK_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const ALTERNATE_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3';
const QUALITIES = (['low', 'medium', 'high'] as const satisfies readonly IPitchCorrectionQuality[]).map(value => ({ label: value, value }));

type IForm = {
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
type ISetForm = (patch: Partial<IForm>) => void;

function FormCard(props: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="audio-player-form-card" title="Player inputs">
      <Field testID="audio-player-source-input" label="source uri (replace)" value={props.form.source} onChange={source => props.setForm({ source })} />
      <Field testID="audio-player-interval-input" label="updateInterval ms" value={props.form.updateInterval} onChange={updateInterval => props.setForm({ updateInterval })} />
      <ToggleRow testID="audio-player-download-switch" label="downloadFirst" value={props.form.isDownloadFirst} onChange={isDownloadFirst => props.setForm({ isDownloadFirst })} color={color} />
      <ToggleRow testID="audio-player-keep-switch" label="keepAudioSessionActive (iOS)" value={props.form.isKeepSession} onChange={isKeepSession => props.setForm({ isKeepSession })} color={color} />
      <Field testID="audio-player-buffer-input" label="preferredForwardBufferDuration s" value={props.form.forwardBuffer} onChange={forwardBuffer => props.setForm({ forwardBuffer })} />
      <Field testID="audio-player-seconds-input" label="seekTo seconds" value={props.form.seconds} onChange={seconds => props.setForm({ seconds })} />
      <Field testID="audio-player-rate-input" label="setPlaybackRate" value={props.form.rate} onChange={rate => props.setForm({ rate })} />
      <ChoiceRow testID="audio-player-quality" label="pitchCorrectionQuality (iOS)" options={QUALITIES} value={props.form.quality} onChange={quality => props.setForm({ quality })} color={color} />
      <Field testID="audio-player-title-input" label="lock screen title" value={props.form.title} onChange={title => props.setForm({ title })} />
      <Field testID="audio-player-artist-input" label="lock screen artist" value={props.form.artist} onChange={artist => props.setForm({ artist })} />
      <ToggleRow testID="audio-player-seek-buttons-switch" label="showSeekForward and showSeekBackward" value={props.form.isSeekButtons} onChange={isSeekButtons => props.setForm({ isSeekButtons })} color={color} />
      <ToggleRow testID="audio-player-live-switch" label="isLiveStream" value={props.form.isLiveStream} onChange={isLiveStream => props.setForm({ isLiveStream })} color={color} />
    </Card>
  );
}

const StatusCard = defineComponent<{ player: AudioPlayer }>(
  props => {
    const status = useAudioPlayerStatus(() => props.player);
    return () => (
      <Card testID="audio-player-status-card" title="useAudioPlayerStatus">
        <ResultRow testID="audio-player-state" label="playbackState" value={`${status.value.playbackState} / ${status.value.timeControlStatus}`} />
        <ResultRow testID="audio-player-time" label="currentTime / duration" value={`${status.value.currentTime.toFixed(1)} / ${status.value.duration.toFixed(1)}`} />
        <ResultRow testID="audio-player-flags" label="playing, loaded, buffering, loop, mute" value={[status.value.playing, status.value.isLoaded, status.value.isBuffering, status.value.loop, status.value.mute].join(', ')} />
        <ResultRow testID="audio-player-rate" label="playbackRate, pitch, live" value={`${status.value.playbackRate}, ${status.value.shouldCorrectPitch}, ${status.value.isLive}`} />
        <ResultRow testID="audio-player-finished" label="didJustFinish, error" value={`${status.value.didJustFinish}, ${status.value.error ?? 'none'}`} />
      </Card>
    );
  },
  { name: 'StatusCard', props: ['player'] },
);

const SampleCard = defineComponent<{ player: AudioPlayer }>(
  props => {
    const isOn = ref(false);
    const sample = ref('no samples yet');
    const listener = (data: IAudioSample) => {
      sample.value = `t=${data.timestamp.toFixed(2)}, ${data.channels.length} channel(s), ${data.channels[0]?.frames.length ?? 0} frames`;
    };
    useAudioSampleListener(props.player, listener);
    const toggle = (next: boolean) => {
      isOn.value = next;
      props.player.setAudioSamplingEnabled(next);
    };
    return () => (
      <Card testID="audio-player-sample-card" title="useAudioSampleListener">
        <ToggleRow testID="audio-player-sampling-switch" label={`setAudioSamplingEnabled (supported: ${props.player.isAudioSamplingSupported})`} value={isOn.value} onChange={toggle} color={color} />
        <text testID="audio-player-sample" class="info-text">{sample.value}</text>
      </Card>
    );
  },
  { name: 'SampleCard', props: ['player'] },
);

function controls(player: AudioPlayer, form: IForm) {
  return [
    { label: 'play', run: async () => player.play() },
    { label: 'pause', run: async () => player.pause() },
    { label: 'seekTo', run: () => player.seekTo(Number(form.seconds)) },
    { label: 'setPlaybackRate', run: async () => player.setPlaybackRate(Number(form.rate), form.quality) },
    { label: 'replace', run: async () => player.replace(form.source) },
    { label: 'replace (alternate track)', run: async () => player.replace(ALTERNATE_URL) },
    { label: 'replace (null)', run: async () => player.replace(null) },
    { label: 'toggle loop', run: async () => { player.loop = !player.loop; return player.loop; } },
    { label: 'toggle muted', run: async () => { player.muted = !player.muted; return player.muted; } },
    { label: 'volume 0.3', run: async () => { player.volume = 0.3; return player.volume; } },
    { label: 'volume 1', run: async () => { player.volume = 1; return player.volume; } },
    { label: 'shouldCorrectPitch toggle', run: async () => { player.shouldCorrectPitch = !player.shouldCorrectPitch; return player.shouldCorrectPitch; } },
    { label: 'currentStatus', run: async () => player.currentStatus },
  ];
}

function lockScreen(player: AudioPlayer, form: IForm) {
  return [
    {
      label: 'setActiveForLockScreen',
      run: async () =>
        player.setActiveForLockScreen(true, { title: form.title, artist: form.artist }, { showSeekForward: form.isSeekButtons, showSeekBackward: form.isSeekButtons, isLiveStream: form.isLiveStream }),
    },
    { label: 'updateLockScreenMetadata', run: async () => player.updateLockScreenMetadata({ title: form.title, artist: form.artist }) },
    { label: 'clearLockScreenControls', run: async () => player.clearLockScreenControls() },
  ];
}

const HookPlayer = defineComponent<{ form: IForm; setForm: ISetForm }>(
  props => {
    const player = useAudioPlayer(
      () => TRACK_URL,
      () => ({
        updateInterval: Number(props.form.updateInterval),
        downloadFirst: props.form.isDownloadFirst,
        keepAudioSessionActive: props.form.isKeepSession,
        preferredForwardBufferDuration: Number(props.form.forwardBuffer),
      }),
    );
    return () => (
      <>
        <FormCard form={props.form} setForm={props.setForm} />
        <CallConsole prefix="audio-player" title="useAudioPlayer controls" color={color} hint="Changing an option recreates the player." calls={controls(player.value, props.form)} />
        <CallConsole prefix="audio-lock" title="Lock screen" color={color} calls={lockScreen(player.value, props.form)} />
        <StatusCard key={player.value.id} player={player.value} />
        <SampleCard key={player.value.id} player={player.value} />
      </>
    );
  },
  { name: 'HookPlayer', props: ['form', 'setForm'] },
);

const ImperativePlayer = defineComponent<{ form: IForm }>(
  props => {
    let player: AudioPlayer | null = null;
    const live = () => {
      if (player === null) {
        throw new Error('createAudioPlayer first');
      }
      return player;
    };
    return () => (
      <CallConsole
        prefix="audio-imperative"
        title="createAudioPlayer (manual lifetime)"
        color={color}
        calls={[
          {
            label: 'createAudioPlayer',
            run: async () => {
              player = createAudioPlayer(props.form.source, {
                updateInterval: Number(props.form.updateInterval),
                downloadFirst: props.form.isDownloadFirst,
                keepAudioSessionActive: props.form.isKeepSession,
                preferredForwardBufferDuration: Number(props.form.forwardBuffer),
              });
              return player.id;
            },
          },
          { label: 'play (imperative)', run: async () => live().play() },
          { label: 'pause (imperative)', run: async () => live().pause() },
          { label: 'remove', run: async () => { live().remove(); player = null; return 'removed'; } },
        ]}
      />
    );
  },
  { name: 'ImperativePlayer', props: ['form'] },
);

export const PlayerCards = defineComponent(
  () => {
    const form = ref<IForm>({
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
    });
    const setForm: ISetForm = patch => {
      form.value = { ...form.value, ...patch };
    };
    return () => (
      <>
        <HookPlayer form={form.value} setForm={setForm} />
        <ImperativePlayer form={form.value} />
      </>
    );
  },
  { name: 'PlayerCards' },
);
