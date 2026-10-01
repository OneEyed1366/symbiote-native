import { Component, input, signal } from '@angular/core';
import {
  getPendingResultAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
} from '@symbiote-native/image-picker/angular';
import type { IImagePickerAsset } from '@symbiote-native/image-picker/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { toPickerOptions } from './image-picker-form';
import type { IForm } from './image-picker-form';
import { ImagePickerAsset } from './ImagePickerAsset';

@Component({
  selector: 'ImagePickerLaunch',
  standalone: true,
  imports: [ActionButton, ImagePickerAsset, ResultRow, Scenario],
  template: `
    <Scenario
      testID="image-picker-result-card"
      title="Choose a profile photo or take a new one"
      why="Avatars, receipts and attachments start with a photo. The picker gives the app only what the user chooses, so it needs no broad access to the whole library."
      [steps]="steps"
      expect="The status says picked N and each photo shows its size and file URI with a preview. Cancelling says canceled."
    >
      <ActionButton
        testID="image-picker-library-button"
        title="launchImageLibraryAsync"
        [color]="color()"
        (press)="launch(libraryLauncher)"
      />
      <ActionButton
        testID="image-picker-camera-button"
        title="launchCameraAsync"
        [color]="color()"
        (press)="launch(cameraLauncher)"
      />
      <ActionButton
        testID="image-picker-pending-button"
        title="getPendingResultAsync (Android)"
        [color]="color()"
        (press)="showPending()"
      />
      <ResultRow
        testID="image-picker-status"
        label="canceled / assets"
        [value]="status()"
      />
      @for (asset of assets(); track asset.uri; let index = $index) {
        <ImagePickerAsset [asset]="asset" [index]="index" />
      }
    </Scenario>
  `,
})
export class ImagePickerLaunch {
  readonly form = input.required<IForm>();
  readonly color = input.required<string>();

  readonly libraryLauncher = launchImageLibraryAsync;
  readonly cameraLauncher = launchCameraAsync;
  readonly steps = [
    'Press launchImageLibraryAsync and pick a photo',
    'Press launchCameraAsync and take one (needs a real camera)',
    'Cancel once',
  ];

  readonly status = signal('idle');
  readonly assets = signal<IImagePickerAsset[]>([]);

  launch(launcher: typeof launchImageLibraryAsync): void {
    this.status.set('picker open…');
    launcher(toPickerOptions(this.form()))
      .then(result => {
        this.status.set(
          result.canceled ? 'canceled' : `picked ${result.assets.length}`,
        );
        this.assets.set(result.canceled ? [] : result.assets);
      })
      .catch((error: Error) => this.status.set(`failed: ${error.message}`));
  }

  showPending(): void {
    getPendingResultAsync()
      .then(pending =>
        this.status.set(
          pending === null ? 'no pending result' : JSON.stringify(pending),
        ),
      )
      .catch((error: Error) => this.status.set(`failed: ${error.message}`));
  }
}
