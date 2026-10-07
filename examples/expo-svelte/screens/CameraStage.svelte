<script lang="ts">
  import { CameraView, useCameraPermissions } from '@symbiote-native/camera/svelte';
  import type { ICameraBarcodeScanningResult } from '@symbiote-native/camera/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { FACING_OPTIONS, FLASH_OPTIONS, MODE_OPTIONS, SCAN_TYPES, ZOOM_STEP } from './camera-shared';
  import type { ICameraDeck } from './camera-shared';

  let {
    deck = $bindable(),
    onScan,
    color,
  }: { deck: ICameraDeck; onScan: (result: ICameraBarcodeScanningResult) => void; color: string } = $props();

  const permission = useCameraPermissions();
  let status = $state('starting');
</script>

<Card testID="camera-stage" title="Live preview">
  {#if permission.status?.granted === true}
    <CameraView
      testID="camera-view"
      bind:this={deck.camera}
      class="cam-preview"
      facing={deck.settings.facing}
      flash={deck.settings.flash}
      mode={deck.settings.mode}
      zoom={deck.settings.zoom}
      mute={deck.settings.isMuted}
      enableTorch={deck.settings.isTorchOn}
      active={deck.settings.isActive}
      barcodeScannerSettings={{ barcodeTypes: SCAN_TYPES }}
      onBarcodeScanned={onScan}
      onCameraReady={() => {
        status = 'ready';
        deck.settings.isReady = true;
      }}
      onMountError={event => (status = `mount error: ${event.message}`)}
    />
  {:else}
    <view testID="camera-placeholder" class="cam-placeholder">
      <text class="hero-body">Allow the camera above to see the preview here.</text>
    </view>
  {/if}
  <ResultRow testID="camera-status" label="Session" value={status} />
  <ChoiceRow testID="camera-facing" label="facing" {color} value={deck.settings.facing} options={FACING_OPTIONS} onChange={value => (deck.settings.facing = value)} />
  <ChoiceRow testID="camera-flash" label="flash" {color} value={deck.settings.flash} options={FLASH_OPTIONS} onChange={value => (deck.settings.flash = value)} />
  <ChoiceRow testID="camera-mode" label="mode" {color} value={deck.settings.mode} options={MODE_OPTIONS} onChange={value => (deck.settings.mode = value)} />
  <ResultRow testID="camera-zoom" label="zoom (0 to 1)" value={deck.settings.zoom.toFixed(2)} />
  <view class="button-row">
    <ActionButton testID="camera-zoom-out" title="Zoom out" {color} onPress={() => (deck.settings.zoom = Math.max(0, deck.settings.zoom - ZOOM_STEP))} />
    <ActionButton testID="camera-zoom-in" title="Zoom in" {color} onPress={() => (deck.settings.zoom = Math.min(1, deck.settings.zoom + ZOOM_STEP))} />
  </view>
  <ToggleRow testID="camera-torch" label="torch (a lamp for the back camera)" value={deck.settings.isTorchOn} onChange={value => (deck.settings.isTorchOn = value)} {color} />
  <ToggleRow testID="camera-mute" label="record video without sound" value={deck.settings.isMuted} onChange={value => (deck.settings.isMuted = value)} {color} />
</Card>
