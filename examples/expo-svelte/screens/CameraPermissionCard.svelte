<script lang="ts">
  import { isCameraAvailableAsync, useCameraPermissions, useMicrophonePermissions } from '@symbiote-native/camera/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { errorLine } from './camera-shared';

  const { color }: { color: string } = $props();

  const camera = useCameraPermissions();
  const microphone = useMicrophonePermissions();
  let availability = $state('not checked');

  const cameraText = $derived(
    camera.status === null ? 'checking…' : `${camera.status.status}, can ask again: ${String(camera.status.canAskAgain)}`,
  );

  async function checkAvailable(): Promise<void> {
    try {
      availability = String(await isCameraAvailableAsync());
    } catch (error) {
      availability = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Card testID="camera-permission-card" title="Permissions and hardware">
  <ResultRow testID="camera-permission" label="Camera" value={cameraText} />
  <ResultRow testID="camera-mic-permission" label="Microphone (video sound)" value={microphone.status === null ? 'checking…' : microphone.status.status} />
  <view class="button-row">
    <ActionButton testID="camera-request" title="Allow the camera" {color} onPress={() => void camera.requestPermission()} />
    <ActionButton testID="camera-request-mic" title="Allow the microphone" {color} onPress={() => void microphone.requestPermission()} />
  </view>
  <ActionButton testID="camera-available" title="isCameraAvailableAsync()" {color} onPress={checkAvailable} />
  <ResultRow testID="camera-available-result" label="Has a camera" value={availability} />
  <text class="hero-body">The iOS simulator has no camera: the preview stays black, use a device. The Android emulator draws a virtual scene.</text>
</Card>
