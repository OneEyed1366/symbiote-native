import { useRef, useState } from 'react';
import {
  createAudioPlayer,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioSampleListener,
} from '@symbiote-native/audio/react';
import type { AudioPlayer, IAudioSample, IPitchCorrectionQuality } from '@symbiote-native/audio/react';
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

function FormCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="audio-player-form-card" title="Player inputs">
      <Field testID="audio-player-source-input" label="source uri (replace)" value={form.source} onChange={source => setForm({ source })} />
      <Field testID="audio-player-interval-input" label="updateInterval ms" value={form.updateInterval} onChange={updateInterval => setForm({ updateInterval })} />
      <ToggleRow testID="audio-player-download-switch" label="downloadFirst" value={form.isDownloadFirst} onChange={isDownloadFirst => setForm({ isDownloadFirst })} color={color} />
      <ToggleRow testID="audio-player-keep-switch" label="keepAudioSessionActive (iOS)" value={form.isKeepSession} onChange={isKeepSession => setForm({ isKeepSession })} color={color} />
      <Field testID="audio-player-buffer-input" label="preferredForwardBufferDuration s" value={form.forwardBuffer} onChange={forwardBuffer => setForm({ forwardBuffer })} />
      <Field testID="audio-player-seconds-input" label="seekTo seconds" value={form.seconds} onChange={seconds => setForm({ seconds })} />
      <Field testID="audio-player-rate-input" label="setPlaybackRate" value={form.rate} onChange={rate => setForm({ rate })} />
      <ChoiceRow testID="audio-player-quality" label="pitchCorrectionQuality (iOS)" options={QUALITIES} value={form.quality} onChange={quality => setForm({ quality })} color={color} />
      <Field testID="audio-player-title-input" label="lock screen title" value={form.title} onChange={title => setForm({ title })} />
      <Field testID="audio-player-artist-input" label="lock screen artist" value={form.artist} onChange={artist => setForm({ artist })} />
      <ToggleRow testID="audio-player-seek-buttons-switch" label="showSeekForward and showSeekBackward" value={form.isSeekButtons} onChange={isSeekButtons => setForm({ isSeekButtons })} color={color} />
      <ToggleRow testID="audio-player-live-switch" label="isLiveStream" value={form.isLiveStream} onChange={isLiveStream => setForm({ isLiveStream })} color={color} />
    </Card>
  );
}

function StatusCard({ player }: { player: AudioPlayer }) {
  const status = useAudioPlayerStatus(player);
  return (
    <Card testID="audio-player-status-card" title="useAudioPlayerStatus">
      <ResultRow testID="audio-player-state" label="playbackState" value={`${status.playbackState} / ${status.timeControlStatus}`} />
      <ResultRow testID="audio-player-time" label="currentTime / duration" value={`${status.currentTime.toFixed(1)} / ${status.duration.toFixed(1)}`} />
      <ResultRow testID="audio-player-flags" label="playing, loaded, buffering, loop, mute" value={[status.playing, status.isLoaded, status.isBuffering, status.loop, status.mute].join(', ')} />
      <ResultRow testID="audio-player-rate" label="playbackRate, pitch, live" value={`${status.playbackRate}, ${status.shouldCorrectPitch}, ${status.isLive}`} />
      <ResultRow testID="audio-player-finished" label="didJustFinish, error" value={`${status.didJustFinish}, ${status.error ?? 'none'}`} />
    </Card>
  );
}

function SampleCard({ player }: { player: AudioPlayer }) {
  const [isOn, setIsOn] = useState(false);
  const [sample, setSample] = useState('no samples yet');
  const listener = (data: IAudioSample) =>
    setSample(`t=${data.timestamp.toFixed(2)}, ${data.channels.length} channel(s), ${data.channels[0]?.frames.length ?? 0} frames`);
  useAudioSampleListener(player, listener);
  const toggle = (next: boolean) => {
    setIsOn(next);
    player.setAudioSamplingEnabled(next);
  };
  return (
    <Card testID="audio-player-sample-card" title="useAudioSampleListener">
      <ToggleRow testID="audio-player-sampling-switch" label={`setAudioSamplingEnabled (supported: ${player.isAudioSamplingSupported})`} value={isOn} onChange={toggle} color={color} />
      <text testID="audio-player-sample" className="info-text">{sample}</text>
    </Card>
  );
}

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

function HookPlayer({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  const player = useAudioPlayer(TRACK_URL, {
    updateInterval: Number(form.updateInterval),
    downloadFirst: form.isDownloadFirst,
    keepAudioSessionActive: form.isKeepSession,
    preferredForwardBufferDuration: Number(form.forwardBuffer),
  });
  return (
    <>
      <FormCard form={form} setForm={setForm} />
      <CallConsole prefix="audio-player" title="useAudioPlayer controls" color={color} hint="Changing an option recreates the player." calls={controls(player, form)} />
      <CallConsole prefix="audio-lock" title="Lock screen" color={color} calls={lockScreen(player, form)} />
      <StatusCard player={player} />
      <SampleCard player={player} />
    </>
  );
}

function ImperativePlayer({ form }: { form: IForm }) {
  const player = useRef<AudioPlayer | null>(null);
  const live = () => {
    if (player.current === null) {
      throw new Error('createAudioPlayer first');
    }
    return player.current;
  };
  return (
    <CallConsole
      prefix="audio-imperative"
      title="createAudioPlayer (manual lifetime)"
      color={color}
      calls={[
        {
          label: 'createAudioPlayer',
          run: async () => {
            player.current = createAudioPlayer(form.source, {
              updateInterval: Number(form.updateInterval),
              downloadFirst: form.isDownloadFirst,
              keepAudioSessionActive: form.isKeepSession,
              preferredForwardBufferDuration: Number(form.forwardBuffer),
            });
            return player.current.id;
          },
        },
        { label: 'play (imperative)', run: async () => live().play() },
        { label: 'pause (imperative)', run: async () => live().pause() },
        { label: 'remove', run: async () => { live().remove(); player.current = null; return 'removed'; } },
      ]}
    />
  );
}

export function PlayerCards() {
  const [form, setFormState] = useState<IForm>({
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
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <HookPlayer form={form} setForm={setForm} />
      <ImperativePlayer form={form} />
    </>
  );
}
