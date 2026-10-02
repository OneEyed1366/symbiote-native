import { Component, computed } from '@angular/core';
import {
  injectAudioPlayer,
  injectAudioPlayerStatus,
} from '@symbiote-native/audio/angular';
import { CallConsole } from '../components/CallConsole';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { TRACK_URL } from './audio-player-calls';

const SEEK_STEP_SECONDS = 10;

@Component({
  selector: 'AudioPlaybackScenario',
  standalone: true,
  imports: [CallConsole, ResultRow, Scenario],
  template: `
    <Scenario
      testID="audio-playback-scenario"
      title="Play a song or a podcast episode"
      why="Stream a remote track with play, pause and seeking, and follow its progress. Keep playing with the screen locked after enabling background mode in the explorer."
      [steps]="steps"
      expect="Audio plays, and the time row moves while it plays. Skipping jumps ten seconds and Pause freezes the time."
    >
      <CallConsole
        isBare
        prefix="audio-playback"
        title="Player"
        [color]="color"
        [calls]="calls"
      />
      <ResultRow
        testID="audio-playback-time"
        label="time"
        [value]="timeText()"
      />
      <ResultRow
        testID="audio-playback-state"
        label="state"
        [value]="stateText()"
      />
    </Scenario>
  `,
})
export class AudioPlaybackScenario {
  readonly color = lineColorOf(ROUTE_NAME.Audio);
  readonly steps = ['Press Play', 'Press Skip forward 10 s', 'Press Pause'];

  private readonly player = injectAudioPlayer(() => TRACK_URL);
  private readonly status = injectAudioPlayerStatus(() => this.player());

  readonly stateText = computed((): string => {
    const status = this.status();
    if (status.playing) {
      return 'playing';
    }
    return status.isBuffering ? 'buffering' : 'paused';
  });

  readonly timeText = computed(
    () =>
      `${this.status().currentTime.toFixed(1)} / ${this.status().duration.toFixed(1)} s`,
  );

  readonly calls = [
    { label: 'Play', run: async () => this.player().play() },
    { label: 'Pause', run: async () => this.player().pause() },
    {
      label: 'Skip forward 10 s',
      run: () =>
        this.player().seekTo(this.player().currentTime + SEEK_STEP_SECONDS),
    },
  ];
}
