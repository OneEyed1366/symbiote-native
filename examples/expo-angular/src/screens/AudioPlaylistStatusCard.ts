import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  PLAYLIST_STATUS_UPDATE,
  TRACK_CHANGED,
  injectAudioPlaylistStatus,
} from '@symbiote-native/audio/angular';
import type {
  AudioPlaylist,
  IAudioPlaylistStatus,
} from '@symbiote-native/audio/angular';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { bindAfterInputs } from './bind-after-inputs';

@Component({
  selector: 'AudioPlaylistStatusCard',
  standalone: true,
  imports: [Card, ResultRow],
  template: `
    @if (status.value(); as current) {
      <Card testID="audio-playlist-status-card" [title]="title">
        <ResultRow
          testID="audio-playlist-track"
          label="currentIndex / trackCount"
          [value]="current.currentIndex + ' / ' + current.trackCount"
        />
        <ResultRow
          testID="audio-playlist-time"
          label="currentTime / duration"
          [value]="
            current.currentTime.toFixed(1) + ' / ' + current.duration.toFixed(1)
          "
        />
        <ResultRow
          testID="audio-playlist-flags"
          label="playing, loaded, buffering"
          [value]="
            current.playing +
            ', ' +
            current.isLoaded +
            ', ' +
            current.isBuffering
          "
        />
        <ResultRow
          testID="audio-playlist-mix"
          label="volume, rate, muted, loop"
          [value]="
            current.volume +
            ', ' +
            current.playbackRate +
            ', ' +
            current.muted +
            ', ' +
            current.loop
          "
        />
        <ResultRow
          testID="audio-playlist-finished"
          label="didJustFinish"
          [value]="'' + current.didJustFinish"
        />
        <ResultRow
          testID="audio-playlist-change"
          [label]="trackChanged"
          [value]="lastChange()"
        />
      </Card>
    }
  `,
})
export class AudioPlaylistStatusCard implements OnInit {
  readonly playlist = input.required<AudioPlaylist>();

  readonly title = `useAudioPlaylistStatus (${PLAYLIST_STATUS_UPDATE})`;
  readonly trackChanged = TRACK_CHANGED;
  readonly status = bindAfterInputs<IAudioPlaylistStatus>();
  readonly lastChange = signal('no track change yet');
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.status.connect(() => injectAudioPlaylistStatus(() => this.playlist()));
    const subscription = this.playlist().addListener(TRACK_CHANGED, data => {
      this.lastChange.set(`${data.previousIndex} -> ${data.currentIndex}`);
    });
    this.destroyRef.onDestroy(() => subscription.remove());
  }
}
