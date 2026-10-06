import { Component, computed, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectVideoPlayer, VideoView } from '@symbiote-native/video/angular';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { injectPlayerEventOrNull } from './video-parts';
import { CLIP_URI } from './video-shared';

@Component({
  selector: 'FeedScenario',
  standalone: true,
  imports: [ActionButton, Scenario, SYMBIOTE_ELEMENTS, VideoView],
  template: `
    <Scenario
      testID="video-feed-scenario"
      title="Autoplay a muted looping clip, tap to unmute"
      why="Feeds and product pages start a short clip silently and in a loop, and give sound only after a tap, so nothing blares at a user who is scrolling."
      [steps]="steps"
      expect="The clip starts without any tap, repeats when it ends and is silent. Unmute turns the sound on, Pause freezes the picture."
    >
      <view>
        <VideoView
          testID="video-feed"
          [player]="player()"
          [nativeControls]="false"
          contentFit="cover"
          class="vid-feed"
        />
        <view class="vid-badge">
          <text class="vid-badge-text">{{ badge() }}</text>
        </view>
      </view>
      <view class="button-row">
        <ActionButton
          testID="video-feed-mute"
          [title]="muteTitle()"
          [color]="color()"
          (press)="toggleMute()"
        />
        <ActionButton
          testID="video-feed-play"
          [title]="playTitle()"
          [color]="color()"
          (press)="togglePlay()"
        />
      </view>
    </Scenario>
  `,
})
export class FeedScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Open the card and watch the clip start by itself',
    'Tap Unmute',
    'Press Pause',
  ];
  readonly player = injectVideoPlayer(
    () => CLIP_URI,
    instance => {
      instance.loop = true;
      instance.muted = true;
      instance.play();
    },
  );
  private readonly mutedEvent = injectPlayerEventOrNull(
    this.player,
    'mutedChange',
  );
  private readonly playingEvent = injectPlayerEventOrNull(
    this.player,
    'playingChange',
  );

  private readonly isMuted = computed(
    () => this.mutedEvent()?.muted ?? this.player().muted,
  );
  private readonly isPlaying = computed(
    () => this.playingEvent()?.isPlaying ?? this.player().playing,
  );
  readonly badge = computed(() => (this.isMuted() ? 'muted' : 'sound on'));
  readonly muteTitle = computed(() => (this.isMuted() ? 'Unmute' : 'Mute'));
  readonly playTitle = computed(() => (this.isPlaying() ? 'Pause' : 'Play'));

  toggleMute(): void {
    this.player().muted = !this.player().muted;
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this.player().pause();
    } else {
      this.player().play();
    }
  }
}
