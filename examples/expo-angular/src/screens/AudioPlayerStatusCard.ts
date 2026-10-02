import { Component, OnInit, input } from '@angular/core';
import { injectAudioPlayerStatus } from '@symbiote-native/audio/angular';
import type { AudioPlayer, IAudioStatus } from '@symbiote-native/audio/angular';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { bindAfterInputs } from './bind-after-inputs';

@Component({
  selector: 'AudioPlayerStatusCard',
  standalone: true,
  imports: [Card, ResultRow],
  template: `
    @if (status.value(); as current) {
      <Card testID="audio-player-status-card" title="useAudioPlayerStatus">
        <ResultRow
          testID="audio-player-state"
          label="playbackState"
          [value]="current.playbackState + ' / ' + current.timeControlStatus"
        />
        <ResultRow
          testID="audio-player-time"
          label="currentTime / duration"
          [value]="
            current.currentTime.toFixed(1) + ' / ' + current.duration.toFixed(1)
          "
        />
        <ResultRow
          testID="audio-player-flags"
          label="playing, loaded, buffering, loop, mute"
          [value]="flagsOf(current)"
        />
        <ResultRow
          testID="audio-player-rate"
          label="playbackRate, pitch, live"
          [value]="
            current.playbackRate +
            ', ' +
            current.shouldCorrectPitch +
            ', ' +
            current.isLive
          "
        />
        <ResultRow
          testID="audio-player-finished"
          label="didJustFinish, error"
          [value]="current.didJustFinish + ', ' + (current.error ?? 'none')"
        />
      </Card>
    }
  `,
})
export class AudioPlayerStatusCard implements OnInit {
  readonly player = input.required<AudioPlayer>();
  readonly status = bindAfterInputs<IAudioStatus>();

  ngOnInit(): void {
    this.status.connect(() => injectAudioPlayerStatus(() => this.player()));
  }

  flagsOf(current: IAudioStatus): string {
    return [
      current.playing,
      current.isLoaded,
      current.isBuffering,
      current.loop,
      current.mute,
    ].join(', ');
  }
}
