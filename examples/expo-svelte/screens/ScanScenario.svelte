<script lang="ts">
  import {
    dismissScanner,
    isModernBarcodeScannerAvailable,
    launchScanner,
    onModernBarcodeScanned,
    scanFromURLAsync,
  } from '@symbiote-native/camera/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { SAMPLE_QR_URL, SCAN_TYPES, errorLine, scanLine } from './camera-shared';
  import type { ICameraDeck } from './camera-shared';

  const { deck, color }: { deck: ICameraDeck; color: string } = $props();

  let modernLine = $state('not launched');
  let urlLine = $state('not scanned');

  $effect(() => {
    const subscription = onModernBarcodeScanned(event => (modernLine = `${event.type}: ${event.data}`));
    return () => subscription.remove();
  });

  async function scanSample(): Promise<void> {
    urlLine = 'scanning…';
    try {
      const results = await scanFromURLAsync(SAMPLE_QR_URL, ['qr']);
      urlLine = results.length === 0 ? 'no code found' : results.map(item => item.data).join(', ');
    } catch (error) {
      urlLine = `failed: ${errorLine(error)}`;
    }
  }

  async function openScanner(): Promise<void> {
    try {
      await launchScanner({ barcodeTypes: SCAN_TYPES, isHighlightingEnabled: true });
    } catch (error) {
      modernLine = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="camera-scan-scenario"
  title="Scan a QR code or a product barcode"
  why="Ticket checks, Wi-Fi and payment links, pairing with a device and shop apps read codes. The live preview reports every code it sees, or the system scanner does the whole job."
  steps={[
    'Point the camera at a QR code on another screen, or press Scan the sample image to test without a camera',
    'Press Open the system scanner (iOS 16+, Google scanner on Android) and scan a code',
  ]}
  expect="The live preview lists the codes it saw, newest first, with type and content. The sample image scan returns the text symbiote-camera-demo. The system scanner reports through the listener line."
>
  <ResultRow testID="camera-scan-types" label="Looking for" value={SCAN_TYPES.join(', ')} />
  <ResultRow testID="camera-scan-count" label="Codes seen" value={String(deck.scans.length)} />
  <ResultRow testID="camera-scan-last" label="Last code" value={scanLine(deck.scans[0])} />
  <ActionButton testID="camera-scan-url" title="Scan the sample image" {color} onPress={scanSample} />
  <ResultRow testID="camera-scan-url-result" label="scanFromURLAsync" value={urlLine} />
  <ResultRow testID="camera-modern-available" label="isModernBarcodeScannerAvailable()" value={String(isModernBarcodeScannerAvailable())} />
  <view class="button-row">
    <ActionButton testID="camera-modern-launch" title="Open the system scanner" {color} onPress={openScanner} />
    <ActionButton testID="camera-modern-dismiss" title="Close it" {color} onPress={() => void dismissScanner()} />
  </view>
  <ResultRow testID="camera-modern-result" label="onModernBarcodeScanned" value={modernLine} />
</Scenario>
