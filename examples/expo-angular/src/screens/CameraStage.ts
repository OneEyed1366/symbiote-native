import {
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  CameraPermissionsService,
  CameraView,
} from '@symbiote-native/camera/angular';
import type { ICameraBarcodeScanningResult } from '@symbiote-native/camera/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { ResultRow } from '../components/ResultRow';
import { ToggleRow } from '../components/ToggleRow';
import {
  FACING_OPTIONS,
  FLASH_OPTIONS,
  MODE_OPTIONS,
  SCAN_TYPES,
  ZOOM_STEP,
} from './camera-shared';
import type { ICameraSettings } from './camera-shared';

@Component({
  selector: 'CameraStage',
  standalone: true,
  imports: [
    ActionButton,
    CameraView,
    Card,
    ChoiceRow,
    ResultRow,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <Card testID="camera-stage" title="Live preview">
      @if (permission()?.granted === true) {
        <CameraView
          #cameraView
          testID="camera-view"
          class="cam-preview"
          [facing]="settings().facing"
          [flash]="settings().flash"
          [mode]="settings().mode"
          [zoom]="settings().zoom"
          [mute]="settings().isMuted"
          [enableTorch]="settings().isTorchOn"
          [active]="settings().isActive"
          [barcodeScannerSettings]="scannerSettings"
          [onBarcodeScanned]="onBarcode"
          [onCameraReady]="onReady"
          [onMountError]="onMountError"
        />
      } @else {
        <view testID="camera-placeholder" class="cam-placeholder">
          <text class="hero-body"
            >Allow the camera above to see the preview here.</text
          >
        </view>
      }
      <ResultRow testID="camera-status" label="Session" [value]="status()" />
      <ChoiceRow
        testID="camera-facing"
        label="facing"
        [color]="color()"
        [value]="settings().facing"
        [options]="facingOptions"
        (valueChange)="patch.emit({ facing: $event })"
      />
      <ChoiceRow
        testID="camera-flash"
        label="flash"
        [color]="color()"
        [value]="settings().flash"
        [options]="flashOptions"
        (valueChange)="patch.emit({ flash: $event })"
      />
      <ChoiceRow
        testID="camera-mode"
        label="mode"
        [color]="color()"
        [value]="settings().mode"
        [options]="modeOptions"
        (valueChange)="patch.emit({ mode: $event })"
      />
      <ResultRow
        testID="camera-zoom"
        label="zoom (0 to 1)"
        [value]="settings().zoom.toFixed(2)"
      />
      <view class="button-row">
        <ActionButton
          testID="camera-zoom-out"
          title="Zoom out"
          [color]="color()"
          (press)="zoomBy(-zoomStep)"
        />
        <ActionButton
          testID="camera-zoom-in"
          title="Zoom in"
          [color]="color()"
          (press)="zoomBy(zoomStep)"
        />
      </view>
      <ToggleRow
        testID="camera-torch"
        label="torch (a lamp for the back camera)"
        [value]="settings().isTorchOn"
        [color]="color()"
        (valueChange)="patch.emit({ isTorchOn: $event })"
      />
      <ToggleRow
        testID="camera-mute"
        label="record video without sound"
        [value]="settings().isMuted"
        [color]="color()"
        (valueChange)="patch.emit({ isMuted: $event })"
      />
    </Card>
  `,
})
export class CameraStage {
  readonly settings = input.required<ICameraSettings>();
  readonly color = input.required<string>();
  readonly patch = output<Partial<ICameraSettings>>();
  readonly scan = output<ICameraBarcodeScanningResult>();

  readonly facingOptions = FACING_OPTIONS;
  readonly flashOptions = FLASH_OPTIONS;
  readonly modeOptions = MODE_OPTIONS;
  readonly zoomStep = ZOOM_STEP;
  readonly scannerSettings = { barcodeTypes: SCAN_TYPES };

  readonly camera = viewChild<CameraView>('cameraView');
  readonly permission = inject(CameraPermissionsService).connect();
  readonly status = signal('starting');

  readonly onBarcode = (result: ICameraBarcodeScanningResult): void =>
    this.scan.emit(result);
  readonly onReady = (): void => {
    this.status.set('ready');
    this.patch.emit({ isReady: true });
  };
  readonly onMountError = (event: { message: string }): void =>
    this.status.set(`mount error: ${event.message}`);

  zoomBy(step: number): void {
    this.patch.emit({
      zoom: Math.min(1, Math.max(0, this.settings().zoom + step)),
    });
  }
}
