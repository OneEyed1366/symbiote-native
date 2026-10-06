<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue';
import {
  dismissScanner,
  isModernBarcodeScannerAvailable,
  launchScanner,
  onModernBarcodeScanned,
  scanFromURLAsync,
} from '@symbiote-native/camera/vue';
import type { ICameraBarcodeScanningResult } from '@symbiote-native/camera/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { SAMPLE_QR_URL, SCAN_TYPES, errorLine, scanLine } from './camera-shared';

const props = defineProps<{ scans: readonly ICameraBarcodeScanningResult[]; color: string }>();

const SCAN_LIST = SCAN_TYPES.join(', ');
const MODERN_AVAILABLE = String(isModernBarcodeScannerAvailable());

const modernLine = ref('not launched');
const urlLine = ref('not scanned');
const count = computed(() => String(props.scans.length));
const last = computed(() => scanLine(props.scans[0]));

const subscription = onModernBarcodeScanned(event => {
  modernLine.value = `${event.type}: ${event.data}`;
});
onScopeDispose(() => subscription.remove());

async function scanSample(): Promise<void> {
  urlLine.value = 'scanning…';
  try {
    const results = await scanFromURLAsync(SAMPLE_QR_URL, ['qr']);
    urlLine.value = results.length === 0 ? 'no code found' : results.map(item => item.data).join(', ');
  } catch (error) {
    urlLine.value = `failed: ${errorLine(error)}`;
  }
}

async function openScanner(): Promise<void> {
  try {
    await launchScanner({ barcodeTypes: SCAN_TYPES, isHighlightingEnabled: true });
  } catch (error) {
    modernLine.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Scenario
    testID="camera-scan-scenario"
    title="Scan a QR code or a product barcode"
    why="Ticket checks, Wi-Fi and payment links, pairing with a device and shop apps read codes. The live preview reports every code it sees, or the system scanner does the whole job."
    :steps="[
      'Point the camera at a QR code on another screen, or press Scan the sample image to test without a camera',
      'Press Open the system scanner (iOS 16+, Google scanner on Android) and scan a code',
    ]"
    expect="The live preview lists the codes it saw, newest first, with type and content. The sample image scan returns the text symbiote-camera-demo. The system scanner reports through the listener line."
  >
    <ResultRow
      testID="camera-scan-types"
      label="Looking for"
      :value="SCAN_LIST"
    />
    <ResultRow
      testID="camera-scan-count"
      label="Codes seen"
      :value="count"
    />
    <ResultRow
      testID="camera-scan-last"
      label="Last code"
      :value="last"
    />
    <ActionButton
      testID="camera-scan-url"
      title="Scan the sample image"
      :color="color"
      @press="scanSample"
    />
    <ResultRow
      testID="camera-scan-url-result"
      label="scanFromURLAsync"
      :value="urlLine"
    />
    <ResultRow
      testID="camera-modern-available"
      label="isModernBarcodeScannerAvailable()"
      :value="MODERN_AVAILABLE"
    />
    <view class="button-row">
      <ActionButton
        testID="camera-modern-launch"
        title="Open the system scanner"
        :color="color"
        @press="openScanner"
      />
      <ActionButton
        testID="camera-modern-dismiss"
        title="Close it"
        :color="color"
        @press="dismissScanner()"
      />
    </view>
    <ResultRow
      testID="camera-modern-result"
      label="onModernBarcodeScanned"
      :value="modernLine"
    />
  </Scenario>
</template>
