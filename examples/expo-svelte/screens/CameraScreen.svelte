<script lang="ts">
  import type { ICameraBarcodeScanningResult } from '@symbiote-native/camera/svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import CameraExplorerCard from './CameraExplorerCard.svelte';
  import CameraPermissionCard from './CameraPermissionCard.svelte';
  import CameraStage from './CameraStage.svelte';
  import PhotoScenario from './PhotoScenario.svelte';
  import ScanScenario from './ScanScenario.svelte';
  import VideoScenario from './VideoScenario.svelte';
  import { INITIAL_SETTINGS, pushScan } from './camera-shared';
  import type { ICameraDeck } from './camera-shared';

  const ROUTE = ROUTE_NAME.Camera;
  const color = lineColorOf(ROUTE);

  let deck = $state<ICameraDeck>({ camera: undefined, settings: { ...INITIAL_SETTINGS }, scans: [] });

  function onScan(result: ICameraBarcodeScanningResult): void {
    deck.scans = pushScan(deck.scans, result);
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="camera-scroll"
  title="Camera"
  body="A live camera view with photos, video recording and barcode scanning. It needs a real camera: use a device, the iOS simulator has none."
>
  <CameraPermissionCard {color} />
  <CameraStage bind:deck {onScan} {color} />
  <PhotoScenario {deck} {color} />
  <VideoScenario {deck} {color} />
  <ScanScenario {deck} {color} />
  <CameraExplorerCard bind:deck {color} />
</ScreenShell>
