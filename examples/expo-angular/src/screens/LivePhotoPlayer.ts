import { Component, input, signal, viewChild } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { LivePhotoView } from '@symbiote-native/live-photo/angular';
import type {
  ILivePhotoAsset,
  ILivePhotoContentFit,
} from '@symbiote-native/live-photo/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Explorer } from '../components/Explorer';
import { ResultRow } from '../components/ResultRow';
import { ToggleRow } from '../components/ToggleRow';
import { FIT_OPTIONS, errorLine, pushLogLine } from './live-photo-shared';

@Component({
  selector: 'LivePhotoPlayer',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    ChoiceRow,
    Explorer,
    LivePhotoView,
    ResultRow,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <Card testID="live-photo-player-card" title="The Live Photo view">
      @if (source(); as asset) {
        <LivePhotoView
          #view
          testID="live-photo-view"
          class="live-view"
          [source]="asset"
          [isMuted]="isMuted()"
          [contentFit]="fit()"
          [useDefaultGestureRecognizer]="isGesture()"
          [onLoadStart]="onLoadStart"
          [onPreviewPhotoLoad]="onPreviewPhotoLoad"
          [onLoadComplete]="onLoadComplete"
          [onLoadError]="onLoadError"
          [onPlaybackStart]="onPlaybackStart"
          [onPlaybackStop]="onPlaybackStop"
        />
      } @else {
        <view testID="live-photo-placeholder" class="live-placeholder">
          <text class="hero-body"
            >Pick or load a Live Photo above, it is shown here.</text
          >
        </view>
      }
      <view class="button-row">
        <ActionButton
          testID="live-photo-hint"
          title="Play a hint"
          [color]="color()"
          (press)="play('hint')"
        />
        <ActionButton
          testID="live-photo-full"
          title="Play fully"
          [color]="color()"
          (press)="play('full')"
        />
        <ActionButton
          testID="live-photo-stop"
          title="Stop"
          [color]="color()"
          (press)="stop()"
        />
      </view>
      @if (lines().length === 0) {
        <ResultRow
          testID="live-photo-log-empty"
          label="Events"
          value="none yet"
        />
      } @else {
        @for (line of lines(); track line) {
          <ResultRow testID="live-photo-log" label="event" [value]="line" />
        }
      }
      <Explorer testID="live-photo-explorer" [color]="color()">
        <ng-template>
          <ToggleRow
            testID="live-photo-muted"
            label="isMuted"
            [color]="color()"
            [(value)]="isMuted"
          />
          <ToggleRow
            testID="live-photo-gesture"
            label="useDefaultGestureRecognizer: press and hold plays"
            [color]="color()"
            [(value)]="isGesture"
          />
          <ChoiceRow
            testID="live-photo-fit"
            label="contentFit"
            [color]="color()"
            [options]="fitOptions"
            [(value)]="fit"
          />
        </ng-template>
      </Explorer>
    </Card>
  `,
})
export class LivePhotoPlayer {
  readonly source = input.required<ILivePhotoAsset | null>();
  readonly color = input.required<string>();

  readonly fitOptions = FIT_OPTIONS;
  private readonly view = viewChild<LivePhotoView>('view');
  readonly lines = signal<string[]>([]);
  readonly isMuted = signal(true);
  readonly isGesture = signal(true);
  readonly fit = signal<ILivePhotoContentFit>('contain');

  readonly onLoadStart = (): void => this.log('load start');
  readonly onPreviewPhotoLoad = (): void => this.log('preview photo loaded');
  readonly onLoadComplete = (): void => this.log('ready to play');
  readonly onLoadError = (error: { message: string }): void =>
    this.log(`load error: ${error.message}`);
  readonly onPlaybackStart = (): void => this.log('playback start');
  readonly onPlaybackStop = (): void => this.log('playback stop');

  private log(line: string): void {
    this.lines.update(previous => pushLogLine(previous, line));
  }

  private guard(action: () => void): void {
    try {
      action();
    } catch (error: unknown) {
      this.log(`failed: ${errorLine(error)}`);
    }
  }

  play(style: 'hint' | 'full'): void {
    this.guard(() => this.view()?.startPlayback(style));
  }

  stop(): void {
    this.guard(() => this.view()?.stopPlayback());
  }
}
