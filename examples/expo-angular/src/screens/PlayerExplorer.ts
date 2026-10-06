import { Component, input, signal } from '@angular/core';
import { injectVideoPlayer, VideoView } from '@symbiote-native/video/angular';
import type {
  IVideoAudioMixingMode,
  IVideoContentFit,
} from '@symbiote-native/video/angular';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { ToggleRow } from '../components/ToggleRow';
import { FIT_OPTIONS, METADATA_SOURCE, MIXING_OPTIONS } from './video-shared';

@Component({
  selector: 'PlayerExplorer',
  standalone: true,
  imports: [Card, ChoiceRow, Explorer, ToggleRow, VideoView],
  template: `
    <Explorer testID="video-explorer" [color]="color()">
      <ng-template>
        <Card testID="video-playground" title="Every option">
          <VideoView
            testID="video-playground-view"
            [player]="player()"
            [nativeControls]="true"
            [contentFit]="fit()"
            [showsTimecodes]="isTimecodes()"
            [requiresLinearPlayback]="isLinear()"
            class="vid-video"
          />
          <ChoiceRow
            testID="video-fit"
            label="contentFit"
            [color]="color()"
            [options]="fitOptions"
            [(value)]="fit"
          />
          <ToggleRow
            testID="video-timecodes"
            label="showsTimecodes (iOS)"
            [color]="color()"
            [(value)]="isTimecodes"
          />
          <ToggleRow
            testID="video-linear"
            label="requiresLinearPlayback: no skipping"
            [color]="color()"
            [(value)]="isLinear"
          />
          <ToggleRow
            testID="video-pitch"
            label="preservesPitch (try 2x speed)"
            [value]="isPitchKept()"
            [color]="color()"
            (valueChange)="setPitch($event)"
          />
          <ToggleRow
            testID="video-keep-awake"
            label="keepScreenOnWhilePlaying"
            [value]="isScreenOn()"
            [color]="color()"
            (valueChange)="setScreenOn($event)"
          />
          <ToggleRow
            testID="video-background"
            label="staysActiveInBackground (needs the audio background mode)"
            [value]="isBackground()"
            [color]="color()"
            (valueChange)="setBackground($event)"
          />
          <ToggleRow
            testID="video-now-playing"
            label="showNowPlayingNotification (lock screen card with the metadata)"
            [value]="isNowPlaying()"
            [color]="color()"
            (valueChange)="setNowPlaying($event)"
          />
          <ChoiceRow
            testID="video-mixing"
            label="audioMixingMode: how it shares audio with other apps"
            [color]="color()"
            [value]="mixing()"
            [options]="mixingOptions"
            (valueChange)="setMixing($event)"
          />
        </Card>
      </ng-template>
    </Explorer>
  `,
})
export class PlayerExplorer {
  readonly color = input.required<string>();

  readonly fitOptions = FIT_OPTIONS;
  readonly mixingOptions = MIXING_OPTIONS;
  readonly player = injectVideoPlayer(() => METADATA_SOURCE);
  readonly isNowPlaying = signal(false);
  readonly mixing = signal<IVideoAudioMixingMode>('auto');
  readonly fit = signal<IVideoContentFit>('contain');
  readonly isTimecodes = signal(true);
  readonly isLinear = signal(false);
  readonly isPitchKept = signal(true);
  readonly isScreenOn = signal(true);
  readonly isBackground = signal(false);

  setPitch(value: boolean): void {
    this.player().preservesPitch = value;
    this.isPitchKept.set(value);
  }

  setScreenOn(value: boolean): void {
    this.player().keepScreenOnWhilePlaying = value;
    this.isScreenOn.set(value);
  }

  setBackground(value: boolean): void {
    this.player().staysActiveInBackground = value;
    this.isBackground.set(value);
  }

  setNowPlaying(value: boolean): void {
    this.player().showNowPlayingNotification = value;
    this.isNowPlaying.set(value);
  }

  setMixing(value: IVideoAudioMixingMode): void {
    this.player().audioMixingMode = value;
    this.mixing.set(value);
  }
}
