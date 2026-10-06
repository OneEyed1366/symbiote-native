import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  dismissScanner,
  isModernBarcodeScannerAvailable,
  launchScanner,
  onModernBarcodeScanned,
  scanFromURLAsync,
} from '@symbiote-native/camera/angular';
import type { ICameraBarcodeScanningResult } from '@symbiote-native/camera/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import {
  SAMPLE_QR_URL,
  SCAN_TYPES,
  errorLine,
  scanLine,
} from './camera-shared';

@Component({
  selector: 'ScanScenario',
  standalone: true,
  imports: [ActionButton, ResultRow, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <Scenario
      testID="camera-scan-scenario"
      title="Scan a QR code or a product barcode"
      why="Ticket checks, Wi-Fi and payment links, pairing with a device and shop apps read codes. The live preview reports every code it sees, or the system scanner does the whole job."
      [steps]="steps"
      expect="The live preview lists the codes it saw, newest first, with type and content. The sample image scan returns the text symbiote-camera-demo. The system scanner reports through the listener line."
    >
      <ResultRow
        testID="camera-scan-types"
        label="Looking for"
        [value]="scanList"
      />
      <ResultRow
        testID="camera-scan-count"
        label="Codes seen"
        [value]="count()"
      />
      <ResultRow testID="camera-scan-last" label="Last code" [value]="last()" />
      <ActionButton
        testID="camera-scan-url"
        title="Scan the sample image"
        [color]="color()"
        (press)="scanSample()"
      />
      <ResultRow
        testID="camera-scan-url-result"
        label="scanFromURLAsync"
        [value]="urlLine()"
      />
      <ResultRow
        testID="camera-modern-available"
        label="isModernBarcodeScannerAvailable()"
        [value]="modernAvailable"
      />
      <view class="button-row">
        <ActionButton
          testID="camera-modern-launch"
          title="Open the system scanner"
          [color]="color()"
          (press)="openScanner()"
        />
        <ActionButton
          testID="camera-modern-dismiss"
          title="Close it"
          [color]="color()"
          (press)="close()"
        />
      </view>
      <ResultRow
        testID="camera-modern-result"
        label="onModernBarcodeScanned"
        [value]="modernLine()"
      />
    </Scenario>
  `,
})
export class ScanScenario {
  readonly scans = input.required<readonly ICameraBarcodeScanningResult[]>();
  readonly color = input.required<string>();

  readonly steps = [
    'Point the camera at a QR code on another screen, or press Scan the sample image to test without a camera',
    'Press Open the system scanner (iOS 16+, Google scanner on Android) and scan a code',
  ];
  readonly scanList = SCAN_TYPES.join(', ');
  readonly modernAvailable = String(isModernBarcodeScannerAvailable());
  readonly modernLine = signal('not launched');
  readonly urlLine = signal('not scanned');
  readonly count = computed(() => String(this.scans().length));
  readonly last = computed(() => scanLine(this.scans()[0]));

  constructor() {
    const subscription = onModernBarcodeScanned(event =>
      this.modernLine.set(`${event.type}: ${event.data}`),
    );
    inject(DestroyRef).onDestroy(() => subscription.remove());
  }

  async scanSample(): Promise<void> {
    this.urlLine.set('scanning…');
    try {
      const results = await scanFromURLAsync(SAMPLE_QR_URL, ['qr']);
      this.urlLine.set(
        results.length === 0
          ? 'no code found'
          : results.map(item => item.data).join(', '),
      );
    } catch (error) {
      this.urlLine.set(`failed: ${errorLine(error)}`);
    }
  }

  async openScanner(): Promise<void> {
    try {
      await launchScanner({
        barcodeTypes: SCAN_TYPES,
        isHighlightingEnabled: true,
      });
    } catch (error) {
      this.modernLine.set(`failed: ${errorLine(error)}`);
    }
  }

  close(): void {
    void dismissScanner();
  }
}
