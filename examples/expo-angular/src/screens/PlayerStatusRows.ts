import { Component, computed, input } from '@angular/core';
import type { Signal } from '@angular/core';
import type { VideoPlayer } from '@symbiote-native/video/angular';
import { ResultRow } from '../components/ResultRow';
import { injectPlayerEventOrNull } from './video-parts';
import { statusLine, timeLine } from './video-shared';

// Live values of the player through the `injectEvent` function of the adapter. The player is an
// input, which is not readable while the fields are created, so the events start empty and the
// rows fall back to the player's own values until the first event
@Component({
  selector: 'PlayerStatusRows',
  standalone: true,
  imports: [ResultRow],
  template: `
    <ResultRow
      [testID]="prefix() + '-status'"
      label="statusChange"
      [value]="statusText()"
    />
    <ResultRow
      [testID]="prefix() + '-playing'"
      label="playingChange"
      [value]="playingText()"
    />
    <ResultRow
      [testID]="prefix() + '-time'"
      label="timeUpdate"
      [value]="timeText()"
    />
  `,
})
export class PlayerStatusRows {
  readonly player = input.required<Signal<VideoPlayer>>();
  readonly prefix = input.required<string>();

  private readonly current = computed(() => this.player()());
  private readonly status = injectPlayerEventOrNull(
    this.current,
    'statusChange',
  );
  private readonly playing = injectPlayerEventOrNull(
    this.current,
    'playingChange',
  );
  private readonly time = injectPlayerEventOrNull(this.current, 'timeUpdate');

  readonly statusText = computed(() =>
    statusLine(
      this.status()?.status ?? this.current().status,
      this.status()?.error?.message,
    ),
  );
  readonly playingText = computed(() =>
    String(this.playing()?.isPlaying ?? this.current().playing),
  );
  readonly timeText = computed(() =>
    timeLine(
      this.time()?.currentTime ?? this.current().currentTime,
      this.current().duration,
      this.time()?.bufferedPosition ?? this.current().bufferedPosition,
    ),
  );
}
