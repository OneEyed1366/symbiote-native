import { Component, computed, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectVideoPlayer, VideoView } from '@symbiote-native/video/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { PlayerStatusRows } from './PlayerStatusRows';
import { injectPlayerEventOrNull } from './video-parts';
import {
  HLS_URI,
  MP4_URI,
  TIME_UPDATE_SECONDS,
  errorLine,
  trackLabel,
  trackSummary,
} from './video-shared';

@Component({
  selector: 'TracksScenario',
  standalone: true,
  imports: [
    ActionButton,
    PlayerStatusRows,
    ResultRow,
    Scenario,
    SYMBIOTE_ELEMENTS,
    VideoView,
  ],
  template: `
    <Scenario
      testID="video-tracks-scenario"
      title="Pick a subtitle, a language and see the quality"
      why="Streams ship several audio languages, subtitles and bitrates. An app lists them from the player and lets the user choose, or swaps the whole source for the next episode."
      [steps]="steps"
      expect="The lists show what the stream offers. Choosing a subtitle shows its text on the picture and updates the line below, and the quality line shows the current resolution."
    >
      <VideoView
        testID="video-tracks"
        [player]="player()"
        [nativeControls]="true"
        class="vid-video"
      />
      <PlayerStatusRows [player]="player" prefix="video-tracks" />
      <ResultRow
        testID="video-tracks-source"
        label="Source"
        [value]="source()"
      />
      <ResultRow
        testID="video-tracks-duration"
        label="sourceLoad"
        [value]="summary()"
      />
      <ResultRow
        testID="video-tracks-quality"
        label="videoTrack"
        [value]="quality()"
      />
      <ResultRow
        testID="video-tracks-subtitle"
        label="subtitleTrack"
        [value]="subtitleText()"
      />
      <ResultRow
        testID="video-tracks-audio"
        label="audioTrack"
        [value]="audioText()"
      />
      <view class="button-row">
        <ActionButton
          testID="video-subtitle-off"
          title="Subtitles off"
          [color]="color()"
          (press)="player().subtitleTrack = null"
        />
        @for (item of subtitles(); track item.id ?? item.label) {
          <ActionButton
            [testID]="'video-subtitle-' + item.language"
            [title]="item.label"
            [color]="color()"
            (press)="player().subtitleTrack = item"
          />
        }
      </view>
      <view class="button-row">
        @for (item of audios(); track item.id ?? item.label) {
          <ActionButton
            [testID]="'video-audio-' + item.language"
            [title]="item.label"
            [color]="color()"
            (press)="player().audioTrack = item"
          />
        }
      </view>
      <view class="button-row">
        <ActionButton
          testID="video-switch-mp4"
          title="Switch to the MP4"
          [color]="color()"
          (press)="switchTo('MP4', mp4Uri)"
        />
        <ActionButton
          testID="video-switch-hls"
          title="Switch back to the stream"
          [color]="color()"
          (press)="switchTo('adaptive stream', hlsUri)"
        />
      </view>
    </Scenario>
  `,
})
export class TracksScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Press play on the native controls',
    'Press a subtitle button, then an audio button',
    'Press Switch to the MP4 and back',
  ];
  readonly mp4Uri = MP4_URI;
  readonly hlsUri = HLS_URI;

  readonly player = injectVideoPlayer(
    () => HLS_URI,
    instance => {
      instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    },
  );
  private readonly load = injectPlayerEventOrNull(this.player, 'sourceLoad');
  private readonly subtitle = injectPlayerEventOrNull(
    this.player,
    'subtitleTrackChange',
  );
  private readonly audio = injectPlayerEventOrNull(
    this.player,
    'audioTrackChange',
  );
  private readonly video = injectPlayerEventOrNull(
    this.player,
    'videoTrackChange',
  );
  readonly source = signal('adaptive stream');

  readonly subtitles = computed(
    () => this.load()?.availableSubtitleTracks ?? [],
  );
  readonly audios = computed(() => this.load()?.availableAudioTracks ?? []);
  readonly summary = computed(() => {
    const load = this.load();
    return load === null
      ? 'not loaded'
      : trackSummary(
          load.duration,
          load.availableVideoTracks.length,
          this.audios().length,
          this.subtitles().length,
        );
  });
  readonly quality = computed(() => {
    const track = this.video()?.videoTrack ?? this.player().videoTrack;
    return track === null
      ? 'unknown'
      : `${track.size.width}x${track.size.height}`;
  });
  readonly subtitleText = computed(() =>
    trackLabel(this.subtitle()?.subtitleTrack ?? this.player().subtitleTrack),
  );
  readonly audioText = computed(() =>
    trackLabel(this.audio()?.audioTrack ?? this.player().audioTrack),
  );

  async switchTo(name: string, uri: string): Promise<void> {
    this.source.set(`loading ${name}…`);
    try {
      await this.player().replaceAsync(uri);
      this.source.set(name);
    } catch (error) {
      this.source.set(`failed: ${errorLine(error)}`);
    }
  }
}
