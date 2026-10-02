import {
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
} from '@symbiote-native/audio/vue';
import type {
  AudioRecorder,
  IRecordingOptions,
} from '@symbiote-native/audio/vue';
import type { ICall } from '../components/call-console';

export type IPreset = 'high' | 'low' | 'custom';
export type IDirectory = 'cache' | 'document';

const PRESET_CUSTOM: IPreset = 'custom';
const PRESET_LOW: IPreset = 'low';

export const PRESETS: readonly { label: string; value: IPreset }[] = [
  { label: 'HIGH_QUALITY', value: 'high' },
  { label: 'LOW_QUALITY', value: PRESET_LOW },
  { label: 'custom', value: PRESET_CUSTOM },
];
export const QUALITIES = Object.entries(AudioQuality)
  .filter(([, value]) => typeof value === 'number')
  .map(([label, value]) => ({ label, value: Number(value) }));
export const DIRECTORIES: readonly { label: string; value: IDirectory }[] = [
  { label: 'cache', value: 'cache' },
  { label: 'document', value: 'document' },
];

export type IRecorderForm = {
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

export const INITIAL_RECORDER_FORM: IRecorderForm = {
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
};

export function optionsOf(form: IRecorderForm): IRecordingOptions {
  const base =
    form.preset === PRESET_LOW
      ? RecordingPresets.LOW_QUALITY
      : RecordingPresets.HIGH_QUALITY;
  const common = {
    ...base,
    directory: form.directory,
    isMeteringEnabled: form.isMetering,
  };
  if (form.preset !== PRESET_CUSTOM) {
    return common;
  }
  return {
    ...common,
    sampleRate: Number(form.sampleRate),
    bitRate: Number(form.bitRate),
    numberOfChannels: Number(form.channels),
    ios: {
      ...base.ios,
      audioQuality: form.quality,
      outputFormat: IOSOutputFormat.MPEG4AAC,
    },
  };
}

export function recorderControls(
  recorder: AudioRecorder,
  form: IRecorderForm,
): ICall[] {
  return [
    {
      label: 'prepareToRecordAsync',
      run: async () => recorder.prepareToRecordAsync(optionsOf(form)),
    },
    {
      label: 'prepareToRecordAsync (no options)',
      run: async () => recorder.prepareToRecordAsync(),
    },
    { label: 'record', run: async () => recorder.record() },
    {
      label: 'record (forDuration)',
      run: async () => recorder.record({ forDuration: Number(form.seconds) }),
    },
    {
      label: 'record (atTime)',
      run: async () => recorder.record({ atTime: Number(form.atTime) }),
    },
    {
      label: 'startRecordingAtTime',
      run: async () => recorder.startRecordingAtTime(Number(form.atTime)),
    },
    {
      label: 'recordForDuration',
      run: async () => recorder.recordForDuration(Number(form.seconds)),
    },
    { label: 'pause', run: async () => recorder.pause() },
    {
      label: 'stop',
      run: async () => {
        await recorder.stop();
        return recorder.uri;
      },
    },
    { label: 'getStatus', run: async () => recorder.getStatus() },
    {
      label: 'getAvailableInputs',
      run: async () => recorder.getAvailableInputs(),
    },
    { label: 'getCurrentInput', run: () => recorder.getCurrentInput() },
    { label: 'setInput', run: async () => recorder.setInput(form.inputUid) },
    {
      label: 'uri and currentTime',
      run: async () => ({
        uri: recorder.uri,
        currentTime: recorder.currentTime,
        isRecording: recorder.isRecording,
      }),
    },
  ];
}
