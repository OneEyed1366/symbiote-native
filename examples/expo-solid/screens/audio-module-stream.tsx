import { createSignal } from 'solid-js';
import {
  AUDIO_SAMPLE_UPDATE,
  AUDIO_STREAM_BUFFER,
  AUDIO_STREAM_STATUS,
  PLAYBACK_STATUS_UPDATE,
  PLAYLIST_STATUS_UPDATE,
  RECORDING_STATUS_UPDATE,
  TRACK_CHANGED,
  clearAllPreloadedSources,
  clearPreloadedSource,
  createAudioStream,
  getPreloadedSources,
  getRecordingPermissionsAsync,
  preload,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioStream,
} from '@symbiote-native/audio/solid';
import type {
  AudioStream,
  IAudioStreamBuffer,
  IAudioStreamEncoding,
  IInterruptionMode,
} from '@symbiote-native/audio/solid';
import { CallConsole } from '../components/CallConsole';
import { Card, ChoiceRow, Field, ResultRow, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { TRACK_URL } from './audio-player';

const color = lineColorOf(ROUTE_NAME.Audio);
const MODES: readonly { label: string; value: IInterruptionMode }[] = [
  { label: 'mixWithOthers', value: 'mixWithOthers' },
  { label: 'doNotMix', value: 'doNotMix' },
  { label: 'duckOthers', value: 'duckOthers' },
];
const ENCODINGS: readonly { label: string; value: IAudioStreamEncoding }[] = [
  { label: 'float32', value: 'float32' },
  { label: 'int16', value: 'int16' },
];

type IMode = {
  playsInSilentMode: boolean;
  interruptionMode: IInterruptionMode;
  allowsRecording: boolean;
  shouldPlayInBackground: boolean;
  shouldRouteThroughEarpiece: boolean;
  allowsBackgroundRecording: boolean;
};

function ModeCard(props: { mode: IMode; setMode: (patch: Partial<IMode>) => void }) {
  return (
    <Card testID="audio-mode-card" title="Audio mode inputs">
      <ToggleRow testID="audio-mode-silent-switch" label="playsInSilentMode" value={props.mode.playsInSilentMode} onChange={playsInSilentMode => props.setMode({ playsInSilentMode })} color={color} />
      <ChoiceRow testID="audio-mode-interruption" label="interruptionMode" options={MODES} value={props.mode.interruptionMode} onChange={interruptionMode => props.setMode({ interruptionMode })} color={color} />
      <ToggleRow testID="audio-mode-recording-switch" label="allowsRecording (iOS)" value={props.mode.allowsRecording} onChange={allowsRecording => props.setMode({ allowsRecording })} color={color} />
      <ToggleRow testID="audio-mode-background-switch" label="shouldPlayInBackground" value={props.mode.shouldPlayInBackground} onChange={shouldPlayInBackground => props.setMode({ shouldPlayInBackground })} color={color} />
      <ToggleRow testID="audio-mode-earpiece-switch" label="shouldRouteThroughEarpiece" value={props.mode.shouldRouteThroughEarpiece} onChange={shouldRouteThroughEarpiece => props.setMode({ shouldRouteThroughEarpiece })} color={color} />
      <ToggleRow testID="audio-mode-background-recording-switch" label="allowsBackgroundRecording" value={props.mode.allowsBackgroundRecording} onChange={allowsBackgroundRecording => props.setMode({ allowsBackgroundRecording })} color={color} />
    </Card>
  );
}

function ModuleCalls() {
  const [mode, setModeState] = createSignal<IMode>({
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    allowsRecording: false,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    allowsBackgroundRecording: false,
  });
  const [source, setSource] = createSignal(TRACK_URL);
  const [buffer, setBuffer] = createSignal('10');
  return (
    <>
      <ModeCard mode={mode()} setMode={patch => setModeState(previous => ({ ...previous, ...patch }))} />
      <Card testID="audio-preload-card" title="Preload inputs">
        <Field testID="audio-preload-source-input" label="source uri" value={source()} onChange={setSource} />
        <Field testID="audio-preload-buffer-input" label="preferredForwardBufferDuration" value={buffer()} onChange={setBuffer} />
      </Card>
      <CallConsole
        prefix="audio-module"
        title="Module functions"
        color={color}
        calls={[
          { label: 'setAudioModeAsync', run: () => setAudioModeAsync(mode()) },
          { label: 'setIsAudioActiveAsync (false)', run: () => setIsAudioActiveAsync(false) },
          { label: 'setIsAudioActiveAsync (true)', run: () => setIsAudioActiveAsync(true) },
          { label: 'getRecordingPermissionsAsync', run: () => getRecordingPermissionsAsync() },
          { label: 'requestRecordingPermissionsAsync', run: () => requestRecordingPermissionsAsync() },
          { label: 'requestNotificationPermissionsAsync', run: () => requestNotificationPermissionsAsync() },
          { label: 'preload', run: () => preload(source(), { preferredForwardBufferDuration: Number(buffer()) }) },
          { label: 'getPreloadedSources', run: () => getPreloadedSources() },
          { label: 'clearPreloadedSource', run: () => clearPreloadedSource(source()) },
          { label: 'clearAllPreloadedSources', run: () => clearAllPreloadedSources() },
          {
            label: 'event name constants',
            run: async () => ({ PLAYBACK_STATUS_UPDATE, AUDIO_SAMPLE_UPDATE, RECORDING_STATUS_UPDATE, PLAYLIST_STATUS_UPDATE, TRACK_CHANGED, AUDIO_STREAM_BUFFER, AUDIO_STREAM_STATUS }),
          },
        ]}
      />
    </>
  );
}

type IStreamForm = { sampleRate: string; channels: string; encoding: IAudioStreamEncoding };

function StreamInputs(props: { form: IStreamForm; setForm: (patch: Partial<IStreamForm>) => void }) {
  return (
    <Card testID="audio-stream-form-card" title="Stream inputs">
      <Field testID="audio-stream-rate-input" label="sampleRate" value={props.form.sampleRate} onChange={sampleRate => props.setForm({ sampleRate })} />
      <Field testID="audio-stream-channels-input" label="channels" value={props.form.channels} onChange={channels => props.setForm({ channels })} />
      <ChoiceRow testID="audio-stream-encoding" label="encoding" options={ENCODINGS} value={props.form.encoding} onChange={encoding => props.setForm({ encoding })} color={color} />
    </Card>
  );
}

function HookStream(props: { form: IStreamForm }) {
  const [last, setLast] = createSignal('no buffer yet');
  const onBuffer = (data: IAudioStreamBuffer) =>
    setLast(`${data.data.byteLength} bytes, ${data.sampleRate} Hz, ${data.channels} ch, t=${data.timestamp.toFixed(2)}`);
  const result = useAudioStream(() => ({
    sampleRate: Number(props.form.sampleRate),
    channels: Number(props.form.channels),
    encoding: props.form.encoding,
    onBuffer,
  }));
  return (
    <>
      <CallConsole
        prefix="audio-stream"
        title="useAudioStream (needs the microphone permission)"
        color={color}
        calls={[
          { label: 'start', run: () => result().stream.start() },
          { label: 'stop', run: async () => result().stream.stop() },
          { label: 'stream properties', run: async () => ({ id: result().stream.id, sampleRate: result().stream.sampleRate, channels: result().stream.channels, isStreaming: result().stream.isStreaming }) },
        ]}
      />
      <Card testID="audio-stream-status-card" title="Stream state">
        <ResultRow testID="audio-stream-streaming" label="isStreaming" value={String(result().isStreaming)} />
        <ResultRow testID="audio-stream-buffer" label="last buffer (onBuffer)" value={last()} />
      </Card>
    </>
  );
}

function ImperativeStream(props: { form: IStreamForm }) {
  let stream: AudioStream | null = null;
  const live = () => {
    if (stream === null) {
      throw new Error('createAudioStream first');
    }
    return stream;
  };
  return (
    <CallConsole
      prefix="audio-stream-imperative"
      title="createAudioStream (manual lifetime)"
      color={color}
      calls={[
        { label: 'createAudioStream', run: async () => { stream = createAudioStream({ sampleRate: Number(props.form.sampleRate), channels: Number(props.form.channels), encoding: props.form.encoding }); return stream.id; } },
        { label: 'start (imperative)', run: () => live().start() },
        { label: 'stop (imperative)', run: async () => live().stop() },
      ]}
    />
  );
}

export function ModuleStreamCards() {
  const [form, setFormState] = createSignal<IStreamForm>({ sampleRate: '48000', channels: '1', encoding: 'float32' });
  return (
    <>
      <ModuleCalls />
      <StreamInputs form={form()} setForm={patch => setFormState(previous => ({ ...previous, ...patch }))} />
      <HookStream form={form()} />
      <ImperativeStream form={form()} />
    </>
  );
}
