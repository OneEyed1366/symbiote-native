import { Component, computed, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectVideoPlayer, VideoView } from '@symbiote-native/video/angular';
import { ActionButton } from '../components/ActionButton';
import { ChoiceRow } from '../components/ChoiceRow';
import { Scenario } from '../components/Scenario';
import { ToggleRow } from '../components/ToggleRow';
import { PlayerStatusRows } from './PlayerStatusRows';
import { injectPlayerEventOrNull } from './video-parts';
import {
  MP4_URI,
  RATES,
  SEEK_SECONDS,
  TIME_UPDATE_SECONDS,
} from './video-shared';

@Component({
  selector: 'CustomControlsScenario',
  standalone: true,
  imports: [
    ActionButton,
    ChoiceRow,
    PlayerStatusRows,
    Scenario,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
    VideoView,
  ],
  template: `
    <Scenario
      testID="video-custom-scenario"
      title="Build your own player controls"
      why="Branded players, lesson apps and short-video feeds hide the system bar and draw their own buttons over the video, driven by the player object."
      [steps]="steps"
      expect="The picture jumps 10 seconds each way, plays twice as fast at 2x, goes silent when muted, and Replay starts again from 0:00."
    >
      <VideoView
        testID="video-custom"
        [player]="player()"
        [nativeControls]="false"
        contentFit="cover"
        class="vid-video"
      />
      <PlayerStatusRows [player]="player" prefix="video-custom" />
      <view class="button-row">
        <ActionButton
          testID="video-custom-play"
          [title]="playTitle()"
          [color]="color()"
          (press)="togglePlay()"
        />
        <ActionButton
          testID="video-custom-back"
          [title]="backTitle"
          [color]="color()"
          (press)="player().seekBy(-seekSeconds)"
        />
        <ActionButton
          testID="video-custom-forward"
          [title]="forwardTitle"
          [color]="color()"
          (press)="player().seekBy(seekSeconds)"
        />
        <ActionButton
          testID="video-custom-replay"
          title="Replay"
          [color]="color()"
          (press)="player().replay()"
        />
      </view>
      <ChoiceRow
        testID="video-custom-rate"
        label="playbackRate"
        [color]="color()"
        [value]="rate()"
        [options]="rates"
        (valueChange)="setRate($event)"
      />
      <ToggleRow
        testID="video-custom-muted"
        label="muted"
        [value]="isMuted()"
        [color]="color()"
        (valueChange)="setMuted($event)"
      />
      <ToggleRow
        testID="video-custom-loop"
        label="loop"
        [value]="isLooping()"
        [color]="color()"
        (valueChange)="setLoop($event)"
      />
    </Scenario>
  `,
})
export class CustomControlsScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Press Play, then Seek +10 s and Seek -10 s',
    'Change the speed to 2x',
    'Press Mute, then Replay',
  ];
  readonly rates = RATES;
  readonly seekSeconds = SEEK_SECONDS;
  readonly backTitle = `-${SEEK_SECONDS} s`;
  readonly forwardTitle = `+${SEEK_SECONDS} s`;

  readonly player = injectVideoPlayer(
    () => MP4_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
      instance.volume = 0.8;
    },
  );
  private readonly playing = injectPlayerEventOrNull(
    this.player,
    'playingChange',
  );
  private readonly rateEvent = injectPlayerEventOrNull(
    this.player,
    'playbackRateChange',
  );
  private readonly mutedEvent = injectPlayerEventOrNull(
    this.player,
    'mutedChange',
  );

  readonly isLooping = signal(false);
  private readonly isPlaying = computed(
    () => this.playing()?.isPlaying ?? this.player().playing,
  );
  readonly playTitle = computed(() => (this.isPlaying() ? 'Pause' : 'Play'));
  readonly rate = computed(
    () => this.rateEvent()?.playbackRate ?? this.player().playbackRate,
  );
  readonly isMuted = computed(
    () => this.mutedEvent()?.muted ?? this.player().muted,
  );

  togglePlay(): void {
    if (this.isPlaying()) {
      this.player().pause();
    } else {
      this.player().play();
    }
  }

  setRate(value: number): void {
    this.player().playbackRate = value;
  }

  setMuted(value: boolean): void {
    this.player().muted = value;
  }

  setLoop(value: boolean): void {
    this.player().loop = value;
    this.isLooping.set(value);
  }
}
