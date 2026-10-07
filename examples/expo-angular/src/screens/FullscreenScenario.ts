import { Component, computed, input, signal, viewChild } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  injectVideoPlayer,
  isPictureInPictureSupported,
  VideoAirPlayButton,
  VideoView,
} from '@symbiote-native/video/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { injectPlayerEventOrNull } from './video-parts';
import {
  FULLSCREEN_OPTIONS,
  MP4_URI,
  TIME_UPDATE_SECONDS,
  errorLine,
  pushLog,
} from './video-shared';

@Component({
  selector: 'FullscreenScenario',
  standalone: true,
  imports: [
    ActionButton,
    ResultRow,
    Scenario,
    SYMBIOTE_ELEMENTS,
    VideoAirPlayButton,
    VideoView,
  ],
  template: `
    <Scenario
      testID="video-fullscreen-scenario"
      title="Go fullscreen, keep watching in a corner window, or cast"
      why="Players offer fullscreen for movies, picture in picture to keep a video over other apps, and AirPlay to send it to a TV."
      [steps]="steps"
      expect="Each action adds a line to the event log: fullscreen enter and exit, picture in picture start and stop. The video keeps playing in its small window, and AirPlay shows true while casting."
    >
      <VideoView
        #view
        testID="video-fullscreen"
        [player]="player()"
        [nativeControls]="true"
        [allowsPictureInPicture]="true"
        [startsPictureInPictureAutomatically]="true"
        [fullscreenOptions]="fullscreenOptions"
        class="vid-video"
        [onFullscreenEnter]="onFullscreenEnter"
        [onFullscreenExit]="onFullscreenExit"
        [onPictureInPictureStart]="onPipStart"
        [onPictureInPictureStop]="onPipStop"
        [onFirstFrameRender]="onFirstFrame"
      />
      <ResultRow
        testID="video-pip-supported"
        label="isPictureInPictureSupported()"
        [value]="pipSupported"
      />
      <ResultRow
        testID="video-airplay-active"
        label="isExternalPlaybackActiveChange"
        [value]="externalText()"
      />
      <view class="button-row">
        <ActionButton
          testID="video-play"
          title="Play"
          [color]="color()"
          (press)="player().play()"
        />
        <ActionButton
          testID="video-enter-fullscreen"
          title="Fullscreen"
          [color]="color()"
          (press)="enterFullscreen()"
        />
        <ActionButton
          testID="video-start-pip"
          title="Picture in picture"
          [color]="color()"
          (press)="startPip()"
        />
        <ActionButton
          testID="video-stop-pip"
          title="Stop PiP"
          [color]="color()"
          (press)="stopPip()"
        />
      </view>
      <view class="capability-row">
        <text class="capability-label">AirPlay route picker (iOS)</text>
        <VideoAirPlayButton
          testID="video-airplay"
          tint="#94a3b8"
          [activeTint]="color()"
          class="vid-airplay"
        />
      </view>
      @if (events().length === 0) {
        <ResultRow
          testID="video-events-empty"
          label="Events"
          value="none yet"
        />
      } @else {
        @for (line of events(); track line) {
          <ResultRow testID="video-event" label="event" [value]="line" />
        }
      }
    </Scenario>
  `,
})
export class FullscreenScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Press Fullscreen, then leave it with the system button',
    'Start playing, press Picture in picture and go to the home screen',
    'On iOS tap the AirPlay button and pick a device',
  ];
  readonly fullscreenOptions = FULLSCREEN_OPTIONS;
  readonly pipSupported = String(isPictureInPictureSupported());

  private readonly view = viewChild<VideoView>('view');
  readonly player = injectVideoPlayer(
    () => MP4_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
      instance.allowsExternalPlayback = true;
    },
  );
  private readonly external = injectPlayerEventOrNull(
    this.player,
    'isExternalPlaybackActiveChange',
  );
  readonly externalText = computed(() =>
    String(
      this.external()?.isExternalPlaybackActive ??
        this.player().isExternalPlaybackActive,
    ),
  );
  readonly events = signal<string[]>([]);

  readonly onFullscreenEnter = (): void => this.log('fullscreen enter');
  readonly onFullscreenExit = (): void => this.log('fullscreen exit');
  readonly onPipStart = (): void => this.log('picture in picture start');
  readonly onPipStop = (): void => this.log('picture in picture stop');
  readonly onFirstFrame = (): void => this.log('first frame rendered');

  private log(line: string): void {
    this.events.update(previous => pushLog(previous, line));
  }

  private async run(
    action: Promise<void> | undefined,
    name: string,
  ): Promise<void> {
    try {
      await action;
    } catch (error) {
      this.log(`${name} failed: ${errorLine(error)}`);
    }
  }

  enterFullscreen(): void {
    void this.run(this.view()?.enterFullscreen(), 'enterFullscreen');
  }

  startPip(): void {
    void this.run(
      this.view()?.startPictureInPicture(),
      'startPictureInPicture',
    );
  }

  stopPip(): void {
    void this.run(this.view()?.stopPictureInPicture(), 'stopPictureInPicture');
  }
}
