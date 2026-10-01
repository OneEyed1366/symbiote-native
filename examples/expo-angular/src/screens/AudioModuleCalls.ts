import { Component, signal } from '@angular/core';
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
  getPreloadedSources,
  getRecordingPermissionsAsync,
  preload,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from '@symbiote-native/audio/angular';
import type { IInterruptionMode } from '@symbiote-native/audio/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { TRACK_URL } from './audio-player-calls';

const MODES: readonly { label: string; value: IInterruptionMode }[] = [
  { label: 'mixWithOthers', value: 'mixWithOthers' },
  { label: 'doNotMix', value: 'doNotMix' },
  { label: 'duckOthers', value: 'duckOthers' },
];

@Component({
  selector: 'AudioModuleCalls',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="audio-mode-card" title="Audio mode inputs">
      <ToggleRow
        testID="audio-mode-silent-switch"
        label="playsInSilentMode"
        [(value)]="playsInSilentMode"
        [color]="color"
      />
      <ChoiceRow
        testID="audio-mode-interruption"
        label="interruptionMode"
        [options]="modes"
        [(value)]="interruptionMode"
        [color]="color"
      />
      <ToggleRow
        testID="audio-mode-recording-switch"
        label="allowsRecording (iOS)"
        [(value)]="allowsRecording"
        [color]="color"
      />
      <ToggleRow
        testID="audio-mode-background-switch"
        label="shouldPlayInBackground"
        [(value)]="shouldPlayInBackground"
        [color]="color"
      />
      <ToggleRow
        testID="audio-mode-earpiece-switch"
        label="shouldRouteThroughEarpiece"
        [(value)]="shouldRouteThroughEarpiece"
        [color]="color"
      />
      <ToggleRow
        testID="audio-mode-background-recording-switch"
        label="allowsBackgroundRecording"
        [(value)]="allowsBackgroundRecording"
        [color]="color"
      />
    </Card>
    <Card testID="audio-preload-card" title="Preload inputs">
      <Field
        testID="audio-preload-source-input"
        label="source uri"
        [(value)]="source"
      />
      <Field
        testID="audio-preload-buffer-input"
        label="preferredForwardBufferDuration"
        [(value)]="buffer"
      />
    </Card>
    <CallConsole
      prefix="audio-module"
      title="Module functions"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class AudioModuleCalls {
  readonly color = lineColorOf(ROUTE_NAME.Audio);
  readonly modes = MODES;

  readonly playsInSilentMode = signal(true);
  readonly interruptionMode = signal<IInterruptionMode>(MODES[0].value);
  readonly allowsRecording = signal(false);
  readonly shouldPlayInBackground = signal(false);
  readonly shouldRouteThroughEarpiece = signal(false);
  readonly allowsBackgroundRecording = signal(false);
  readonly source = signal(TRACK_URL);
  readonly buffer = signal('10');

  readonly calls = [
    {
      label: 'setAudioModeAsync',
      run: () =>
        setAudioModeAsync({
          playsInSilentMode: this.playsInSilentMode(),
          interruptionMode: this.interruptionMode(),
          allowsRecording: this.allowsRecording(),
          shouldPlayInBackground: this.shouldPlayInBackground(),
          shouldRouteThroughEarpiece: this.shouldRouteThroughEarpiece(),
          allowsBackgroundRecording: this.allowsBackgroundRecording(),
        }),
    },
    {
      label: 'setIsAudioActiveAsync (false)',
      run: () => setIsAudioActiveAsync(false),
    },
    {
      label: 'setIsAudioActiveAsync (true)',
      run: () => setIsAudioActiveAsync(true),
    },
    {
      label: 'getRecordingPermissionsAsync',
      run: () => getRecordingPermissionsAsync(),
    },
    {
      label: 'requestRecordingPermissionsAsync',
      run: () => requestRecordingPermissionsAsync(),
    },
    {
      label: 'requestNotificationPermissionsAsync',
      run: () => requestNotificationPermissionsAsync(),
    },
    {
      label: 'preload',
      run: () =>
        preload(this.source(), {
          preferredForwardBufferDuration: Number(this.buffer()),
        }),
    },
    { label: 'getPreloadedSources', run: () => getPreloadedSources() },
    {
      label: 'clearPreloadedSource',
      run: () => clearPreloadedSource(this.source()),
    },
    {
      label: 'clearAllPreloadedSources',
      run: () => clearAllPreloadedSources(),
    },
    {
      label: 'event name constants',
      run: async () => ({
        PLAYBACK_STATUS_UPDATE,
        AUDIO_SAMPLE_UPDATE,
        RECORDING_STATUS_UPDATE,
        PLAYLIST_STATUS_UPDATE,
        TRACK_CHANGED,
        AUDIO_STREAM_BUFFER,
        AUDIO_STREAM_STATUS,
      }),
    },
  ];
}
