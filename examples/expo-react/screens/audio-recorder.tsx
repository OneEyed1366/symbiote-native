import { useRef, useState } from 'react';
import {
  AudioQuality,
  IOSOutputFormat,
  RECORDING_STATUS_UPDATE,
  RecordingPresets,
  createAudioRecorder,
  useAudioRecorder,
  useAudioRecorderState,
} from '@symbiote-native/audio/react';
import type { AudioRecorder, IRecordingOptions, IRecordingStatus } from '@symbiote-native/audio/react';
import { CallConsole } from '../components/CallConsole';
import { Card, ChoiceRow, Field, ResultRow, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Audio);
type IPreset = 'high' | 'low' | 'custom';
const PRESET_CUSTOM: IPreset = 'custom';
const PRESET_LOW: IPreset = 'low';
const PRESETS: readonly { label: string; value: IPreset }[] = [
  { label: 'HIGH_QUALITY', value: 'high' },
  { label: 'LOW_QUALITY', value: PRESET_LOW },
  { label: 'custom', value: PRESET_CUSTOM },
];
const QUALITIES = Object.entries(AudioQuality)
  .filter(([, value]) => typeof value === 'number')
  .map(([label, value]) => ({ label, value: Number(value) }));
type IDirectory = 'cache' | 'document';
const DIRECTORIES: readonly { label: string; value: IDirectory }[] = [
  { label: 'cache', value: 'cache' },
  { label: 'document', value: 'document' },
];

type IForm = {
  preset: IPreset;
  directory: IDirectory;
  isMetering: boolean;
  sampleRate: string;
  bitRate: string;
  channels: string;
  quality: number;
  seconds: string;
  atTime: string;
  pollInterval: string;
  inputUid: string;
};
type ISetForm = (patch: Partial<IForm>) => void;

function optionsOf(form: IForm): IRecordingOptions {
  const base = form.preset === PRESET_LOW ? RecordingPresets.LOW_QUALITY : RecordingPresets.HIGH_QUALITY;
  const common = { ...base, directory: form.directory, isMeteringEnabled: form.isMetering };
  if (form.preset !== PRESET_CUSTOM) {
    return common;
  }
  return {
    ...common,
    sampleRate: Number(form.sampleRate),
    bitRate: Number(form.bitRate),
    numberOfChannels: Number(form.channels),
    ios: { ...base.ios, audioQuality: form.quality, outputFormat: IOSOutputFormat.MPEG4AAC },
  };
}

function FormCard({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  return (
    <Card testID="audio-recorder-form-card" title="Recorder inputs">
      <ChoiceRow testID="audio-recorder-preset" label="RecordingPresets" options={PRESETS} value={form.preset} onChange={preset => setForm({ preset })} color={color} />
      <ChoiceRow testID="audio-recorder-directory" label="directory" options={DIRECTORIES} value={form.directory} onChange={directory => setForm({ directory })} color={color} />
      <ToggleRow testID="audio-recorder-metering-switch" label="isMeteringEnabled" value={form.isMetering} onChange={isMetering => setForm({ isMetering })} color={color} />
      <Field testID="audio-recorder-rate-input" label="sampleRate (custom)" value={form.sampleRate} onChange={sampleRate => setForm({ sampleRate })} />
      <Field testID="audio-recorder-bitrate-input" label="bitRate (custom)" value={form.bitRate} onChange={bitRate => setForm({ bitRate })} />
      <Field testID="audio-recorder-channels-input" label="numberOfChannels (custom)" value={form.channels} onChange={channels => setForm({ channels })} />
      <ChoiceRow testID="audio-recorder-quality" label="AudioQuality (iOS, custom)" options={QUALITIES} value={form.quality} onChange={quality => setForm({ quality })} color={color} />
      <Field testID="audio-recorder-duration-input" label="forDuration seconds" value={form.seconds} onChange={seconds => setForm({ seconds })} />
      <Field testID="audio-recorder-at-input" label="atTime seconds (iOS)" value={form.atTime} onChange={atTime => setForm({ atTime })} />
      <Field testID="audio-recorder-poll-input" label="useAudioRecorderState interval ms" value={form.pollInterval} onChange={pollInterval => setForm({ pollInterval })} />
      <Field testID="audio-recorder-input-uid" label="input uid for setInput" value={form.inputUid} onChange={inputUid => setForm({ inputUid })} />
    </Card>
  );
}

function StateCard({ recorder, interval }: { recorder: AudioRecorder; interval: number }) {
  const state = useAudioRecorderState(recorder, interval);
  return (
    <Card testID="audio-recorder-state-card" title="useAudioRecorderState">
      <ResultRow testID="audio-recorder-can" label="canRecord, isRecording" value={`${state.canRecord}, ${state.isRecording}`} />
      <ResultRow testID="audio-recorder-duration" label="durationMillis" value={String(state.durationMillis)} />
      <ResultRow testID="audio-recorder-metering" label="metering" value={String(state.metering ?? 'off')} />
      <ResultRow testID="audio-recorder-url" label="url" value={state.url ?? 'none'} />
      <ResultRow testID="audio-recorder-reset" label="mediaServicesDidReset" value={String(state.mediaServicesDidReset)} />
    </Card>
  );
}

function controls(recorder: AudioRecorder, form: IForm) {
  return [
    { label: 'prepareToRecordAsync', run: async () => recorder.prepareToRecordAsync(optionsOf(form)) },
    { label: 'prepareToRecordAsync (no options)', run: async () => recorder.prepareToRecordAsync() },
    { label: 'record', run: async () => recorder.record() },
    { label: 'record (forDuration)', run: async () => recorder.record({ forDuration: Number(form.seconds) }) },
    { label: 'record (atTime)', run: async () => recorder.record({ atTime: Number(form.atTime) }) },
    { label: 'startRecordingAtTime', run: async () => recorder.startRecordingAtTime(Number(form.atTime)) },
    { label: 'recordForDuration', run: async () => recorder.recordForDuration(Number(form.seconds)) },
    { label: 'pause', run: async () => recorder.pause() },
    { label: 'stop', run: async () => { await recorder.stop(); return recorder.uri; } },
    { label: 'getStatus', run: async () => recorder.getStatus() },
    { label: 'getAvailableInputs', run: async () => recorder.getAvailableInputs() },
    { label: 'getCurrentInput', run: () => recorder.getCurrentInput() },
    { label: 'setInput', run: async () => recorder.setInput(form.inputUid) },
    { label: 'uri and currentTime', run: async () => ({ uri: recorder.uri, currentTime: recorder.currentTime, isRecording: recorder.isRecording }) },
  ];
}

function HookRecorder({ form, setForm }: { form: IForm; setForm: ISetForm }) {
  const [statuses, setStatuses] = useState('no status yet');
  const recorder = useAudioRecorder(optionsOf(form), (status: IRecordingStatus) =>
    setStatuses(`${RECORDING_STATUS_UPDATE}: finished=${status.isFinished} error=${status.error ?? 'none'} url=${status.url ?? 'none'}`),
  );
  return (
    <>
      <FormCard form={form} setForm={setForm} />
      <CallConsole prefix="audio-recorder" title="useAudioRecorder controls" color={color} hint="Needs the microphone permission from the Module card." calls={controls(recorder, form)} />
      <text testID="audio-recorder-status" className="info-text">{statuses}</text>
      <StateCard recorder={recorder} interval={Number(form.pollInterval)} />
    </>
  );
}

function ImperativeRecorder({ form }: { form: IForm }) {
  const recorder = useRef<AudioRecorder | null>(null);
  const live = () => {
    if (recorder.current === null) {
      throw new Error('createAudioRecorder first');
    }
    return recorder.current;
  };
  return (
    <CallConsole
      prefix="audio-recorder-imperative"
      title="createAudioRecorder (manual lifetime)"
      color={color}
      calls={[
        { label: 'createAudioRecorder', run: async () => { recorder.current = createAudioRecorder(optionsOf(form)); return recorder.current.id; } },
        { label: 'prepare (imperative)', run: async () => live().prepareToRecordAsync() },
        { label: 'record (imperative)', run: async () => live().record() },
        { label: 'stop (imperative)', run: async () => { await live().stop(); return live().uri; } },
      ]}
    />
  );
}

export function RecorderCards() {
  const [form, setFormState] = useState<IForm>({
    preset: 'high',
    directory: 'cache',
    isMetering: true,
    sampleRate: '44100',
    bitRate: '128000',
    channels: '2',
    quality: AudioQuality.HIGH,
    seconds: '5',
    atTime: '2',
    pollInterval: '500',
    inputUid: '',
  });
  const setForm: ISetForm = patch => setFormState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <HookRecorder form={form} setForm={setForm} />
      <ImperativeRecorder form={form} />
    </>
  );
}
