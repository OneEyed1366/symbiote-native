import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { getThumbnailAsync } from '@symbiote-native/video-thumbnails';
import type { IVideoThumbnailsResult } from '@symbiote-native/video-thumbnails';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const SAMPLE_VIDEO =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const PRESET_TIMES_MS = [0, 1000, 3000, 5000];
const THUMBNAIL_STYLE = { width: '100%', height: 200 };

function parseHeaders(text: string): Record<string, string> | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('headers must be a JSON object');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)]),
  );
}

@Component({
  selector: 'VideoThumbnailsScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="video-thumbnails-scroll"
      title="Video Thumbnails"
      body="Grab a still frame from a video, local or remote, at any moment and quality. Use it for covers, previews and scrubbing bars."
    >
      <Scenario
        testID="video-thumbnails-result-card"
        title="Show a preview image for a video"
        why="Video lists and feeds need a cover picture. Grab a still frame from a local file or a remote URL instead of shipping separate preview images."
        [steps]="resultSteps"
        expect="A frame from the clip appears below with its size and file URI. A later time gives a different frame."
      >
        <ActionButton
          testID="video-thumbnails-generate-button"
          title="getThumbnailAsync"
          [color]="color"
          (press)="generate()"
        />
        <ResultRow
          testID="video-thumbnails-status"
          label="Status"
          [value]="status()"
        />
        @if (thumbnail(); as result) {
          <ResultRow
            testID="video-thumbnails-size"
            label="width × height"
            [value]="result.width + ' × ' + result.height"
          />
          <ResultRow
            testID="video-thumbnails-uri"
            label="uri"
            [value]="result.uri"
          />
          <image
            testID="video-thumbnails-image"
            [source]="{ uri: result.uri }"
            [style]="thumbnailStyle"
            resizeMode="contain"
          ></image>
        }
      </Scenario>
      <Explorer testID="video-thumbnails-explorer" [color]="color">
        <ng-template>
          <Card testID="video-thumbnails-params-card" title="Source">
            <Field
              testID="video-thumbnails-source-input"
              label="video uri (local file:// or remote URL)"
              [(value)]="source"
            />
            <Field
              testID="video-thumbnails-time-input"
              label="time (ms)"
              [(value)]="time"
            />
            <view class="button-row">
              @for (ms of presetTimes; track ms) {
                <ActionButton
                  [testID]="'video-thumbnails-time-' + ms"
                  [title]="ms + ' ms'"
                  [color]="color"
                  (press)="time.set(String(ms))"
                />
              }
            </view>
            <Field
              testID="video-thumbnails-quality-input"
              label="quality (0.0 - 1.0)"
              [(value)]="quality"
            />
            <Field
              testID="video-thumbnails-headers-input"
              label="headers (JSON object, remote videos only)"
              [(value)]="headers"
              placeholder='{"Authorization": "Bearer …"}'
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class VideoThumbnailsScreen {
  readonly route = ROUTE_NAME.VideoThumbnails;
  readonly color = lineColorOf(ROUTE_NAME.VideoThumbnails);
  readonly presetTimes = PRESET_TIMES_MS;
  readonly thumbnailStyle = THUMBNAIL_STYLE;
  readonly String = String;
  readonly resultSteps = [
    'Press getThumbnailAsync (the sample clip is already set)',
    'Change the time or quality in the explorer and press again',
  ];

  readonly source = signal(SAMPLE_VIDEO);
  readonly time = signal('1000');
  readonly quality = signal('0.8');
  readonly headers = signal('');
  readonly thumbnail = signal<IVideoThumbnailsResult | null>(null);
  readonly status = signal('idle');

  generate(): void {
    this.status.set('generating…');
    Promise.resolve()
      .then(() =>
        getThumbnailAsync(this.source(), {
          time: Number(this.time()),
          quality: Number(this.quality()),
          headers: parseHeaders(this.headers()),
        }),
      )
      .then(result => {
        this.thumbnail.set(result);
        this.status.set('done');
      })
      .catch((error: Error) => this.status.set(`failed: ${error.message}`));
  }
}
