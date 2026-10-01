import { Component, computed, signal } from '@angular/core';
import {
  createAudioPlaylist,
  injectAudioPlaylist,
} from '@symbiote-native/audio/angular';
import type { AudioPlaylist } from '@symbiote-native/audio/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { AudioPlaylistStatusCard } from './AudioPlaylistStatusCard';
import {
  EXTRA_TRACK,
  INITIAL_PLAYLIST_FORM,
  LOOPS,
  TRACKS,
  playlistControls,
} from './audio-playlist-calls';
import type { IPlaylistForm } from './audio-playlist-calls';

@Component({
  selector: 'AudioPlaylistCards',
  standalone: true,
  imports: [AudioPlaylistStatusCard, CallConsole, Card, ChoiceRow, Field],
  template: `
    <Card testID="audio-playlist-form-card" title="Playlist inputs">
      <ChoiceRow
        testID="audio-playlist-loop"
        label="loop"
        [options]="loops"
        [value]="form().loop"
        (valueChange)="patch({ loop: $event })"
        [color]="color"
      />
      <Field
        testID="audio-playlist-interval-input"
        label="updateInterval ms"
        [value]="form().interval"
        (valueChange)="patch({ interval: $event })"
      />
      <Field
        testID="audio-playlist-index-input"
        label="index (skipTo, insert, remove)"
        [value]="form().index"
        (valueChange)="patch({ index: $event })"
      />
      <Field
        testID="audio-playlist-seconds-input"
        label="seekTo seconds"
        [value]="form().seconds"
        (valueChange)="patch({ seconds: $event })"
      />
      <Field
        testID="audio-playlist-source-input"
        label="source uri (add, insert)"
        [value]="form().source"
        (valueChange)="patch({ source: $event })"
      />
    </Card>
    <CallConsole
      prefix="audio-playlist"
      title="useAudioPlaylist controls"
      [color]="color"
      hint="Changing interval or loop recreates the playlist."
      [calls]="controls()"
    />
    @for (current of currentPlaylist(); track current.id) {
      <AudioPlaylistStatusCard [playlist]="current" />
    }
    <CallConsole
      prefix="audio-playlist-imperative"
      title="createAudioPlaylist (manual lifetime)"
      [color]="color"
      [calls]="imperativeCalls"
    />
  `,
})
export class AudioPlaylistCards {
  readonly color = lineColorOf(ROUTE_NAME.Audio);
  readonly loops = LOOPS;

  readonly form = signal<IPlaylistForm>({ ...INITIAL_PLAYLIST_FORM });
  private imperative: AudioPlaylist | null = null;

  readonly playlist = injectAudioPlaylist(() => ({
    sources: TRACKS,
    updateInterval: Number(this.form().interval),
    loop: this.form().loop,
  }));

  readonly currentPlaylist = computed(() => [this.playlist()]);
  readonly controls = computed(() =>
    playlistControls(this.playlist(), this.form()),
  );

  private live(): AudioPlaylist {
    if (this.imperative === null) {
      throw new Error('createAudioPlaylist first');
    }
    return this.imperative;
  }

  readonly imperativeCalls = [
    {
      label: 'createAudioPlaylist',
      run: async () => {
        this.imperative = createAudioPlaylist({
          sources: [...TRACKS, EXTRA_TRACK],
          updateInterval: Number(this.form().interval),
          loop: this.form().loop,
        });
        return this.imperative.id;
      },
    },
    { label: 'play (imperative)', run: async () => this.live().play() },
    {
      label: 'destroy',
      run: async () => {
        this.live().destroy();
        this.imperative = null;
        return 'destroyed';
      },
    },
  ];

  patch(change: Partial<IPlaylistForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
