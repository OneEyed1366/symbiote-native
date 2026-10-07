import { Component, input, output } from '@angular/core';
import {
  CameraView,
  getAvailableVideoCodecsAsync,
} from '@symbiote-native/camera/angular';
import { CallConsole } from '../components/CallConsole';
import { Explorer } from '../components/Explorer';
import { ToggleRow } from '../components/ToggleRow';
import type { ICameraSettings } from './camera-shared';

@Component({
  selector: 'CameraExplorerCard',
  standalone: true,
  imports: [CallConsole, Explorer, ToggleRow],
  template: `
    <Explorer testID="camera-explorer" [color]="color()">
      <ng-template>
        <ToggleRow
          testID="camera-active"
          label="active: the session runs (iOS)"
          [value]="isActive()"
          [color]="color()"
          (valueChange)="patch.emit({ isActive: $event })"
        />
        <CallConsole
          prefix="camera-calls"
          title="Handle calls"
          [color]="color()"
          hint="Each call runs on the live preview above."
          [calls]="calls"
        />
      </ng-template>
    </Explorer>
  `,
})
export class CameraExplorerCard {
  readonly camera = input<CameraView | undefined>();
  readonly isActive = input.required<boolean>();
  readonly color = input.required<string>();
  readonly patch = output<Partial<ICameraSettings>>();

  readonly calls = [
    {
      label: 'getAvailablePictureSizesAsync',
      run: async () => this.camera()?.getAvailablePictureSizesAsync(),
    },
    {
      label: 'getAvailableLensesAsync',
      run: async () => this.camera()?.getAvailableLensesAsync(),
    },
    {
      label: 'getSupportedFeatures',
      run: async () => this.camera()?.getSupportedFeatures(),
    },
    {
      label: 'getAvailableVideoCodecsAsync',
      run: getAvailableVideoCodecsAsync,
    },
    { label: 'pausePreview', run: async () => this.camera()?.pausePreview() },
    { label: 'resumePreview', run: async () => this.camera()?.resumePreview() },
  ];
}
