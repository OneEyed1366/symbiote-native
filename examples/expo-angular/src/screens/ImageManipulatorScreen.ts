import { Component, signal } from '@angular/core';
import {
  manipulate,
  manipulateAsync,
} from '@symbiote-native/image-manipulator/angular';
import type {
  IImageManipulatorContext,
  IImageResult,
} from '@symbiote-native/image-manipulator/angular';
import { launchImageLibraryAsync } from '@symbiote-native/image-picker/angular';
import { ActionButton } from '../components/ActionButton';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import {
  INITIAL_OPS,
  applyActions,
  toActions,
  toSaveOptions,
} from './image-manipulator-ops';
import type { IOps } from './image-manipulator-ops';
import { ImageManipulatorHookRunner } from './ImageManipulatorHookRunner';
import { ImageManipulatorOps } from './ImageManipulatorOps';
import { ImageManipulatorResult } from './ImageManipulatorResult';

@Component({
  selector: 'ImageManipulatorScreen',
  standalone: true,
  imports: [
    ActionButton,
    Explorer,
    Field,
    ImageManipulatorHookRunner,
    ImageManipulatorOps,
    ImageManipulatorResult,
    ResultRow,
    Scenario,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="image-manipulator-scroll"
      title="Image Manipulator"
      body="Edit a photo on the device before it goes anywhere: resize, rotate, flip, crop and re-compress as JPEG, PNG or WEBP. Smaller uploads, no server round trip."
    >
      <Scenario
        testID="image-manipulator-source-card"
        title="Shrink and straighten a photo before upload"
        why="Phone photos are huge. Resize to 300 px wide and rotate a quarter turn on the device, so the upload is small and upright."
        [steps]="steps"
        expect="The result below is 300 px wide and rotated 90 degrees, with its new file URI. The deprecated manipulateAsync gives the same picture."
      >
        <ActionButton
          testID="image-manipulator-pick-button"
          title="Pick image (image-picker)"
          [color]="color"
          (press)="pickSource()"
        />
        <Field
          testID="image-manipulator-source-input"
          label="source uri"
          [(value)]="source"
          placeholder="file:///…"
        />
        <ActionButton
          testID="image-manipulator-chain-button"
          title="manipulate() chain"
          [color]="color"
          (press)="runChain()"
        />
        <ActionButton
          testID="image-manipulator-legacy-button"
          title="manipulateAsync() (deprecated)"
          [color]="color"
          (press)="runLegacy()"
        />
        @if (source() !== '') {
          <ImageManipulatorHookRunner
            [source]="source()"
            [color]="color"
            [run]="runHook"
          />
        }
        <ResultRow
          testID="image-manipulator-status"
          label="Status"
          [value]="status()"
        />
        @if (result(); as saved) {
          <ImageManipulatorResult [result]="saved" />
        }
      </Scenario>
      <Explorer testID="image-manipulator-explorer" [color]="color">
        <ng-template>
          <ImageManipulatorOps [(ops)]="ops" [color]="color" />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class ImageManipulatorScreen {
  readonly route = ROUTE_NAME.ImageManipulator;
  readonly color = lineColorOf(ROUTE_NAME.ImageManipulator);
  readonly steps = [
    'Press Pick image and choose a photo',
    'Press manipulate() chain',
    'Compare the result size with the original',
  ];

  readonly source = signal('');
  readonly ops = signal<IOps>({ ...INITIAL_OPS });
  readonly status = signal('pick a source image first');
  readonly result = signal<IImageResult | null>(null);

  private readonly fail = (error: Error): void => {
    this.status.set(`failed: ${error.message}`);
  };

  private done(label: string) {
    return (saved: IImageResult): void => {
      this.result.set(saved);
      this.status.set(label);
    };
  }

  pickSource(): void {
    launchImageLibraryAsync({ mediaTypes: ['images'] })
      .then(picked => {
        if (!picked.canceled) {
          this.source.set(picked.assets[0].uri);
          this.status.set('source ready');
        }
      })
      .catch(this.fail);
  }

  runChain(): void {
    this.status.set('manipulate()…');
    applyActions(manipulate(this.source()), toActions(this.ops()))
      .renderAsync()
      .then(image => image.saveAsync(toSaveOptions(this.ops())))
      .then(this.done('manipulate().renderAsync().saveAsync()'))
      .catch(this.fail);
  }

  runLegacy(): void {
    this.status.set('manipulateAsync()…');
    manipulateAsync(
      this.source(),
      toActions(this.ops()),
      toSaveOptions(this.ops()),
    )
      .then(this.done('manipulateAsync()'))
      .catch(this.fail);
  }

  readonly runHook = (context: IImageManipulatorContext): void => {
    this.status.set('hook context…');
    applyActions(context, toActions(this.ops()))
      .renderAsync()
      .then(image => image.saveAsync(toSaveOptions(this.ops())))
      .then(this.done('useImageManipulator().renderAsync().saveAsync()'))
      .catch(this.fail);
  };
}
