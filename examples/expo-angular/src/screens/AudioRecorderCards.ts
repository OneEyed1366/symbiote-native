import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  RECORDING_STATUS_UPDATE,
  createAudioRecorder,
  injectAudioRecorder,
} from '@symbiote-native/audio/angular';
import type {
  AudioRecorder,
  IRecordingStatus,
} from '@symbiote-native/audio/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AudioRecorderStateCard } from './AudioRecorderStateCard';
import {
  DIRECTORIES,
  INITIAL_RECORDER_FORM,
  PRESETS,
  QUALITIES,
  optionsOf,
  recorderControls,
} from './audio-recorder-options';
import type { IRecorderForm } from './audio-recorder-options';

@Component({
  selector: 'AudioRecorderCards',
  standalone: true,
  imports: [
    AudioRecorderStateCard,
    CallConsole,
    Card,
    ChoiceRow,
    Field,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <Card testID="audio-recorder-form-card" title="Recorder inputs">
      <ChoiceRow
        testID="audio-recorder-preset"
        label="RecordingPresets"
        [options]="presets"
        [value]="form().preset"
        (valueChange)="patch({ preset: $event })"
        [color]="color"
      />
      <ChoiceRow
        testID="audio-recorder-directory"
        label="directory"
        [options]="directories"
        [value]="form().directory"
        (valueChange)="patch({ directory: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="audio-recorder-metering-switch"
        label="isMeteringEnabled"
        [value]="form().isMetering"
        (valueChange)="patch({ isMetering: $event })"
        [color]="color"
      />
      <Field
        testID="audio-recorder-rate-input"
        label="sampleRate (custom)"
        [value]="form().sampleRate"
        (valueChange)="patch({ sampleRate: $event })"
      />
      <Field
        testID="audio-recorder-bitrate-input"
        label="bitRate (custom)"
        [value]="form().bitRate"
        (valueChange)="patch({ bitRate: $event })"
      />
      <Field
        testID="audio-recorder-channels-input"
        label="numberOfChannels (custom)"
        [value]="form().channels"
        (valueChange)="patch({ channels: $event })"
      />
      <ChoiceRow
        testID="audio-recorder-quality"
        label="AudioQuality (iOS, custom)"
        [options]="qualities"
        [value]="form().quality"
        (valueChange)="patch({ quality: $event })"
        [color]="color"
      />
      <Field
        testID="audio-recorder-duration-input"
        label="forDuration seconds"
        [value]="form().seconds"
        (valueChange)="patch({ seconds: $event })"
      />
      <Field
        testID="audio-recorder-at-input"
        label="atTime seconds (iOS)"
        [value]="form().atTime"
        (valueChange)="patch({ atTime: $event })"
      />
      <Field
        testID="audio-recorder-poll-input"
        label="useAudioRecorderState interval ms"
        [value]="form().pollInterval"
        (valueChange)="patch({ pollInterval: $event })"
      />
      <Field
        testID="audio-recorder-input-uid"
        label="input uid for setInput"
        [value]="form().inputUid"
        (valueChange)="patch({ inputUid: $event })"
      />
    </Card>
    <CallConsole
      prefix="audio-recorder"
      title="useAudioRecorder controls"
      [color]="color"
      hint="Needs the microphone permission from the Module card."
      [calls]="controls()"
    />
    <text testID="audio-recorder-status" class="info-text">{{
      statuses()
    }}</text>
    @for (item of stateCards(); track item.key) {
      <AudioRecorderStateCard
        [recorder]="item.recorder"
        [interval]="item.interval"
      />
    }
    <CallConsole
      prefix="audio-recorder-imperative"
      title="createAudioRecorder (manual lifetime)"
      [color]="color"
      [calls]="imperativeCalls"
    />
  `,
})
export class AudioRecorderCards {
  readonly color = lineColorOf(ROUTE_NAME.Audio);
  readonly presets = PRESETS;
  readonly directories = DIRECTORIES;
  readonly qualities = QUALITIES;

  readonly form = signal<IRecorderForm>({ ...INITIAL_RECORDER_FORM });
  readonly statuses = signal('no status yet');
  private imperative: AudioRecorder | null = null;

  readonly recorder = injectAudioRecorder(
    () => optionsOf(this.form()),
    (status: IRecordingStatus) => {
      this.statuses.set(
        `${RECORDING_STATUS_UPDATE}: finished=${status.isFinished} error=${status.error ?? 'none'} url=${status.url ?? 'none'}`,
      );
    },
  );

  readonly controls = computed(() =>
    recorderControls(this.recorder(), this.form()),
  );
  readonly stateCards = computed(() => {
    const interval = Number(this.form().pollInterval);
    return [
      {
        key: `${String(this.recorder().id)}:${interval}`,
        recorder: this.recorder(),
        interval,
      },
    ];
  });

  private live(): AudioRecorder {
    if (this.imperative === null) {
      throw new Error('createAudioRecorder first');
    }
    return this.imperative;
  }

  readonly imperativeCalls = [
    {
      label: 'createAudioRecorder',
      run: async () => {
        this.imperative = createAudioRecorder(optionsOf(this.form()));
        return this.imperative.id;
      },
    },
    {
      label: 'prepare (imperative)',
      run: async () => this.live().prepareToRecordAsync(),
    },
    { label: 'record (imperative)', run: async () => this.live().record() },
    {
      label: 'stop (imperative)',
      run: async () => {
        await this.live().stop();
        return this.live().uri;
      },
    },
  ];

  patch(change: Partial<IRecorderForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
