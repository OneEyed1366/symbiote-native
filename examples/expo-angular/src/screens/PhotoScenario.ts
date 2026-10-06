import { Component, computed, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type {
  CameraView,
  ICameraCapturedPicture,
} from '@symbiote-native/camera/angular';
import { ActionButton } from '../components/ActionButton';
import { ChoiceRow } from '../components/ChoiceRow';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ToggleRow } from '../components/ToggleRow';
import { QUALITIES, errorLine } from './camera-shared';

@Component({
  selector: 'PhotoScenario',
  standalone: true,
  imports: [
    ActionButton,
    ChoiceRow,
    ResultRow,
    Scenario,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <Scenario
      testID="camera-photo-scenario"
      title="Take a photo for a profile, a receipt or a document"
      why="The core camera task. The app shows a live preview, takes a still on a button and gets a file it can upload or show. Quality trades size for sharpness."
      [steps]="steps"
      expect="A thumbnail of the shot appears with its pixel size. Quality 0.3 gives the same pixel size as 1, only the file gets smaller and softer."
    >
      <ChoiceRow
        testID="camera-quality"
        label="quality"
        [color]="color()"
        [options]="qualities"
        [(value)]="quality"
      />
      <ToggleRow
        testID="camera-silent"
        label="shutter sound off (not allowed everywhere)"
        [color]="color()"
        [(value)]="isSilent"
      />
      <ToggleRow
        testID="camera-raw"
        label="skipProcessing: the raw sensor image"
        [color]="color()"
        [(value)]="isRaw"
      />
      <ActionButton
        testID="camera-take-photo"
        title="Take photo"
        [color]="color()"
        (press)="shoot()"
      />
      <ResultRow
        testID="camera-photo-result"
        label="takePictureAsync"
        [value]="line()"
      />
      @if (picture(); as shot) {
        <image
          testID="camera-photo"
          [source]="photoSource()"
          class="cam-photo"
        />
        @if (shot.exif !== undefined) {
          <ResultRow
            testID="camera-photo-exif"
            label="EXIF tags"
            [value]="exifCount()"
          />
        }
      }
    </Scenario>
  `,
})
export class PhotoScenario {
  readonly camera = input<CameraView | undefined>();
  readonly color = input.required<string>();

  readonly steps = [
    'Allow the camera and wait for the preview',
    'Press Take photo',
    'Change the quality to 0.3 and shoot again',
  ];
  readonly qualities = QUALITIES;
  readonly picture = signal<ICameraCapturedPicture | null>(null);
  readonly quality = signal(0.7);
  readonly isSilent = signal(false);
  readonly isRaw = signal(false);
  readonly line = signal('no photo yet');

  readonly photoSource = computed(() => ({ uri: this.picture()?.uri ?? '' }));
  readonly exifCount = computed(() =>
    String(Object.keys(this.picture()?.exif ?? {}).length),
  );

  async shoot(): Promise<void> {
    this.line.set('shooting…');
    try {
      const result = await this.camera()?.takePictureAsync({
        quality: this.quality(),
        shutterSound: !this.isSilent(),
        skipProcessing: this.isRaw(),
        exif: true,
      });
      this.picture.set(result ?? null);
      this.line.set(
        result === undefined
          ? 'no picture returned'
          : `${result.width}x${result.height} ${result.format}`,
      );
    } catch (error) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  }
}
