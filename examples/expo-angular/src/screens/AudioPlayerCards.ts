import { Component, computed, signal } from '@angular/core';
import {
  createAudioPlayer,
  injectAudioPlayer,
} from '@symbiote-native/audio/angular';
import type { AudioPlayer } from '@symbiote-native/audio/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AudioPlayerStatusCard } from './AudioPlayerStatusCard';
import { AudioSampleCard } from './AudioSampleCard';
import {
  INITIAL_PLAYER_FORM,
  QUALITIES,
  TRACK_URL,
  lockScreenCalls,
  playerControls,
  toPlayerOptions,
} from './audio-player-calls';
import type { IPlayerForm } from './audio-player-calls';

@Component({
  selector: 'AudioPlayerCards',
  standalone: true,
  imports: [
    AudioPlayerStatusCard,
    AudioSampleCard,
    CallConsole,
    Card,
    ChoiceRow,
    Field,
    ToggleRow,
  ],
  template: `
    <Card testID="audio-player-form-card" title="Player inputs">
      <Field
        testID="audio-player-source-input"
        label="source uri (replace)"
        [value]="form().source"
        (valueChange)="patch({ source: $event })"
      />
      <Field
        testID="audio-player-interval-input"
        label="updateInterval ms"
        [value]="form().updateInterval"
        (valueChange)="patch({ updateInterval: $event })"
      />
      <ToggleRow
        testID="audio-player-download-switch"
        label="downloadFirst"
        [value]="form().isDownloadFirst"
        (valueChange)="patch({ isDownloadFirst: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="audio-player-keep-switch"
        label="keepAudioSessionActive (iOS)"
        [value]="form().isKeepSession"
        (valueChange)="patch({ isKeepSession: $event })"
        [color]="color"
      />
      <Field
        testID="audio-player-buffer-input"
        label="preferredForwardBufferDuration s"
        [value]="form().forwardBuffer"
        (valueChange)="patch({ forwardBuffer: $event })"
      />
      <Field
        testID="audio-player-seconds-input"
        label="seekTo seconds"
        [value]="form().seconds"
        (valueChange)="patch({ seconds: $event })"
      />
      <Field
        testID="audio-player-rate-input"
        label="setPlaybackRate"
        [value]="form().rate"
        (valueChange)="patch({ rate: $event })"
      />
      <ChoiceRow
        testID="audio-player-quality"
        label="pitchCorrectionQuality (iOS)"
        [options]="qualities"
        [value]="form().quality"
        (valueChange)="patch({ quality: $event })"
        [color]="color"
      />
      <Field
        testID="audio-player-title-input"
        label="lock screen title"
        [value]="form().title"
        (valueChange)="patch({ title: $event })"
      />
      <Field
        testID="audio-player-artist-input"
        label="lock screen artist"
        [value]="form().artist"
        (valueChange)="patch({ artist: $event })"
      />
      <ToggleRow
        testID="audio-player-seek-buttons-switch"
        label="showSeekForward and showSeekBackward"
        [value]="form().isSeekButtons"
        (valueChange)="patch({ isSeekButtons: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="audio-player-live-switch"
        label="isLiveStream"
        [value]="form().isLiveStream"
        (valueChange)="patch({ isLiveStream: $event })"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="audio-player"
      title="useAudioPlayer controls"
      [color]="color"
      hint="Changing an option recreates the player."
      [calls]="controls()"
    />
    <CallConsole
      prefix="audio-lock"
      title="Lock screen"
      [color]="color"
      [calls]="lockCalls()"
    />
    @for (current of currentPlayer(); track current.id) {
      <AudioPlayerStatusCard [player]="current" />
      <AudioSampleCard [player]="current" [color]="color" />
    }
    <CallConsole
      prefix="audio-imperative"
      title="createAudioPlayer (manual lifetime)"
      [color]="color"
      [calls]="imperativeCalls"
    />
  `,
})
export class AudioPlayerCards {
  readonly color = lineColorOf(ROUTE_NAME.Audio);
  readonly qualities = QUALITIES;

  readonly form = signal<IPlayerForm>({ ...INITIAL_PLAYER_FORM });
  private imperative: AudioPlayer | null = null;

  readonly player = injectAudioPlayer(
    () => TRACK_URL,
    () => toPlayerOptions(this.form()),
  );

  readonly currentPlayer = computed(() => [this.player()]);
  readonly controls = computed(() =>
    playerControls(this.player(), this.form()),
  );
  readonly lockCalls = computed(() =>
    lockScreenCalls(this.player(), this.form()),
  );

  private live(): AudioPlayer {
    if (this.imperative === null) {
      throw new Error('createAudioPlayer first');
    }
    return this.imperative;
  }

  readonly imperativeCalls = [
    {
      label: 'createAudioPlayer',
      run: async () => {
        this.imperative = createAudioPlayer(
          this.form().source,
          toPlayerOptions(this.form()),
        );
        return this.imperative.id;
      },
    },
    { label: 'play (imperative)', run: async () => this.live().play() },
    { label: 'pause (imperative)', run: async () => this.live().pause() },
    {
      label: 'remove',
      run: async () => {
        this.live().remove();
        this.imperative = null;
        return 'removed';
      },
    },
  ];

  patch(change: Partial<IPlayerForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
