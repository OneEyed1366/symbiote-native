import { Component, computed, signal, viewChild } from '@angular/core';
import type { ICameraBarcodeScanningResult } from '@symbiote-native/camera/angular';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { CameraExplorerCard } from './CameraExplorerCard';
import { CameraPermissionCard } from './CameraPermissionCard';
import { CameraStage } from './CameraStage';
import { PhotoScenario } from './PhotoScenario';
import { ScanScenario } from './ScanScenario';
import { VideoScenario } from './VideoScenario';
import { INITIAL_SETTINGS, pushScan } from './camera-shared';
import type { ICameraSettings } from './camera-shared';

const ROUTE = ROUTE_NAME.Camera;

@Component({
  selector: 'CameraScreen',
  standalone: true,
  imports: [
    CameraExplorerCard,
    CameraPermissionCard,
    CameraStage,
    PhotoScenario,
    ScanScenario,
    ScreenShell,
    VideoScenario,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="camera-scroll"
      title="Camera"
      body="A live camera view with photos, video recording and barcode scanning. It needs a real camera: use a device, the iOS simulator has none."
    >
      <CameraPermissionCard [color]="color" />
      <CameraStage
        [settings]="settings()"
        [color]="color"
        (patch)="patch($event)"
        (scan)="onScan($event)"
      />
      <PhotoScenario [camera]="camera()" [color]="color" />
      <VideoScenario
        [camera]="camera()"
        [mode]="settings().mode"
        [color]="color"
      />
      <ScanScenario [scans]="scans()" [color]="color" />
      <CameraExplorerCard
        [camera]="camera()"
        [isActive]="settings().isActive"
        [color]="color"
        (patch)="patch($event)"
      />
    </ScreenShell>
  `,
})
export class CameraScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);

  private readonly stage = viewChild(CameraStage);
  readonly camera = computed(() => this.stage()?.camera());
  readonly settings = signal<ICameraSettings>(INITIAL_SETTINGS);
  readonly scans = signal<readonly ICameraBarcodeScanningResult[]>([]);

  patch(change: Partial<ICameraSettings>): void {
    this.settings.update(previous => ({ ...previous, ...change }));
  }

  onScan(result: ICameraBarcodeScanningResult): void {
    this.scans.update(previous => pushScan(previous, result));
  }
}
