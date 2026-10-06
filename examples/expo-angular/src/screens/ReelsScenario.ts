import { Component, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { FeedItem } from './FeedItem';
import { FEED_CLIPS } from './video-shared';

@Component({
  selector: 'ReelsScenario',
  standalone: true,
  imports: [ActionButton, FeedItem, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <Scenario
      testID="video-reels-scenario"
      title="Play one clip at a time in a feed"
      why="Reels and story feeds keep a single player busy: the clip on screen plays and the others hold no source, so memory and data stay low. Swiping hands the player to the next clip."
      [steps]="steps"
      expect="Only the active clip is playing, with its status moving to readyToPlay. Every other clip says unloaded."
    >
      @for (clip of clips; track clip.key) {
        <FeedItem
          [uri]="clip.uri"
          [isActive]="clip.index === active()"
          [index]="clip.index"
        />
      }
      <view class="button-row">
        <ActionButton
          testID="video-reels-prev"
          title="Previous clip"
          [color]="color()"
          (press)="previous()"
        />
        <ActionButton
          testID="video-reels-next"
          title="Next clip"
          [color]="color()"
          (press)="next()"
        />
      </view>
    </Scenario>
  `,
})
export class ReelsScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Press Next clip a few times',
    'Look at the status line of each clip',
  ];
  readonly clips = FEED_CLIPS.map((uri, index) => ({
    uri,
    index,
    key: `${uri}-${String(index)}`,
  }));
  readonly active = signal(0);

  previous(): void {
    this.active.update(value => Math.max(0, value - 1));
  }

  next(): void {
    this.active.update(value => Math.min(FEED_CLIPS.length - 1, value + 1));
  }
}
