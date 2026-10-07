import { Component, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ExpoImage } from '@symbiote-native/image/angular';
import { injectVideoPlayer } from '@symbiote-native/video/angular';
import type { VideoThumbnail } from '@symbiote-native/video/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import {
  MP4_URI,
  THUMB_MAX_WIDTH,
  THUMB_TIMES,
  errorLine,
  formatTime,
} from './video-shared';

@Component({
  selector: 'ThumbnailsScenario',
  standalone: true,
  imports: [ActionButton, ExpoImage, ResultRow, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <Scenario
      testID="video-thumbs-scenario"
      title="Show preview frames for a seek bar or a gallery"
      why="Players show a frame under the finger while scrubbing and galleries show a cover picture. The frames come from the player itself, no extra download."
      [steps]="steps"
      expect="Four pictures appear in a row, taken at 1, 10, 30 and 60 seconds, each with its requested time under it."
    >
      <ActionButton
        testID="video-thumbs-generate"
        title="generateThumbnailsAsync"
        [color]="color()"
        (press)="generate()"
      />
      <ResultRow testID="video-thumbs-result" label="Result" [value]="line()" />
      <view class="vid-thumb-row">
        @for (thumbnail of thumbnails(); track thumbnail.requestedTime) {
          <view>
            <ExpoImage
              [testID]="'video-thumb-' + thumbnail.requestedTime"
              [source]="thumbnail"
              contentFit="cover"
              class="vid-thumb"
            />
            <text class="capability-label">{{
              timeText(thumbnail.requestedTime)
            }}</text>
          </view>
        }
      </view>
    </Scenario>
  `,
})
export class ThumbnailsScenario {
  readonly color = input.required<string>();

  readonly steps = ['Press Generate frames and wait a few seconds'];
  private readonly player = injectVideoPlayer(() => MP4_URI);
  readonly thumbnails = signal<VideoThumbnail[]>([]);
  readonly line = signal('not generated');

  timeText(seconds: number): string {
    return formatTime(seconds);
  }

  async generate(): Promise<void> {
    this.line.set('generating…');
    try {
      const result = await this.player().generateThumbnailsAsync(THUMB_TIMES, {
        maxWidth: THUMB_MAX_WIDTH,
      });
      this.thumbnails.set(result);
      this.line.set(
        `${result.length} frames, ${result[0]?.width ?? 0}x${result[0]?.height ?? 0}`,
      );
    } catch (error) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  }
}
