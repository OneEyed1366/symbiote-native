import { Component, computed, inject, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  CameraPermissionsService,
  MicrophonePermissionsService,
  isCameraAvailableAsync,
} from '@symbiote-native/camera/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { errorLine } from './camera-shared';

@Component({
  selector: 'CameraPermissionCard',
  standalone: true,
  imports: [ActionButton, Card, ResultRow, SYMBIOTE_ELEMENTS],
  template: `
    <Card testID="camera-permission-card" title="Permissions and hardware">
      <ResultRow
        testID="camera-permission"
        label="Camera"
        [value]="cameraText()"
      />
      <ResultRow
        testID="camera-mic-permission"
        label="Microphone (video sound)"
        [value]="microphoneText()"
      />
      <view class="button-row">
        <ActionButton
          testID="camera-request"
          title="Allow the camera"
          [color]="color()"
          (press)="requestCamera()"
        />
        <ActionButton
          testID="camera-request-mic"
          title="Allow the microphone"
          [color]="color()"
          (press)="requestMicrophone()"
        />
      </view>
      <ActionButton
        testID="camera-available"
        title="isCameraAvailableAsync()"
        [color]="color()"
        (press)="checkAvailable()"
      />
      <ResultRow
        testID="camera-available-result"
        label="Has a camera"
        [value]="availability()"
      />
      <text class="hero-body"
        >The iOS simulator has no camera: the preview stays black, use a device.
        The Android emulator draws a virtual scene.</text
      >
    </Card>
  `,
})
export class CameraPermissionCard {
  readonly color = input.required<string>();

  private readonly cameraService = inject(CameraPermissionsService);
  private readonly microphoneService = inject(MicrophonePermissionsService);
  private readonly camera = this.cameraService.connect();
  private readonly microphone = this.microphoneService.connect();
  readonly availability = signal('not checked');

  readonly cameraText = computed(() => {
    const response = this.camera();
    return response === null
      ? 'checking…'
      : `${response.status}, can ask again: ${String(response.canAskAgain)}`;
  });
  readonly microphoneText = computed(
    () => this.microphone()?.status ?? 'checking…',
  );

  requestCamera(): void {
    void this.cameraService.request();
  }

  requestMicrophone(): void {
    void this.microphoneService.request();
  }

  async checkAvailable(): Promise<void> {
    try {
      this.availability.set(String(await isCameraAvailableAsync()));
    } catch (error) {
      this.availability.set(`failed: ${errorLine(error)}`);
    }
  }
}
