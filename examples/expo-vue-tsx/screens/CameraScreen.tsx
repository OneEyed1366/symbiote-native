import { defineComponent, ref } from 'vue';
import {
  CameraView,
  getAvailableVideoCodecsAsync,
  isCameraAvailableAsync,
  useCameraPermissions,
  useMicrophonePermissions,
} from '@symbiote-native/camera/vue';
import type { ICameraBarcodeScanningResult, ICameraViewHandle } from '@symbiote-native/camera/vue';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { PhotoScenario, ScanScenario, VideoScenario } from './camera-scenarios';
import type { ICameraDeck } from './camera-scenarios';
import {
  FACING_OPTIONS,
  FLASH_OPTIONS,
  INITIAL_SETTINGS,
  MODE_OPTIONS,
  SCAN_TYPES,
  ZOOM_STEP,
  errorLine,
  pushScan,
} from './camera-shared';
import type { ICameraSettings } from './camera-shared';

const ROUTE = ROUTE_NAME.Camera;
const color = lineColorOf(ROUTE);

type ISettingsProps = {
  deck: ICameraDeck;
};

const PermissionCard = defineComponent(
  () => {
    const [camera, requestCamera] = useCameraPermissions();
    const [microphone, requestMicrophone] = useMicrophonePermissions();
    const availability = ref('not checked');
    const checkAvailable = async () => {
      try {
        availability.value = String(await isCameraAvailableAsync());
      } catch (error) {
        availability.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => (
      <Card testID="camera-permission-card" title="Permissions and hardware">
        <ResultRow
          testID="camera-permission"
          label="Camera"
          value={camera.value === null ? 'checking…' : `${camera.value.status}, can ask again: ${String(camera.value.canAskAgain)}`}
        />
        <ResultRow testID="camera-mic-permission" label="Microphone (video sound)" value={microphone.value === null ? 'checking…' : microphone.value.status} />
        <view class="button-row">
          <ActionButton testID="camera-request" title="Allow the camera" color={color} onPress={() => void requestCamera()} />
          <ActionButton testID="camera-request-mic" title="Allow the microphone" color={color} onPress={() => void requestMicrophone()} />
        </view>
        <ActionButton testID="camera-available" title="isCameraAvailableAsync()" color={color} onPress={() => void checkAvailable()} />
        <ResultRow testID="camera-available-result" label="Has a camera" value={availability.value} />
        <text class="hero-body">The iOS simulator has no camera: the preview stays black, use a device. The Android emulator draws a virtual scene.</text>
      </Card>
    );
  },
  { name: 'PermissionCard' },
);

type IStageProps = ISettingsProps & {
  setSettings: (patch: Partial<ICameraSettings>) => void;
  onScan: (result: ICameraBarcodeScanningResult) => void;
};

const Stage = defineComponent<IStageProps>(
  props => {
    const [permission] = useCameraPermissions();
    const status = ref('starting');
    return () => {
      const settings = props.deck.settings.value;
      return (
        <Card testID="camera-stage" title="Live preview">
          {permission.value?.granted === true ? (
            <CameraView
              testID="camera-view"
              ref={props.deck.camera}
              class="cam-preview"
              facing={settings.facing}
              flash={settings.flash}
              mode={settings.mode}
              zoom={settings.zoom}
              mute={settings.isMuted}
              enableTorch={settings.isTorchOn}
              active={settings.isActive}
              barcodeScannerSettings={{ barcodeTypes: SCAN_TYPES }}
              onBarcodeScanned={props.onScan}
              onCameraReady={() => {
                status.value = 'ready';
                props.setSettings({ isReady: true });
              }}
              onMountError={event => { status.value = `mount error: ${event.message}`; }}
            />
          ) : (
            <view testID="camera-placeholder" class="cam-placeholder">
              <text class="hero-body">Allow the camera above to see the preview here.</text>
            </view>
          )}
          <ResultRow testID="camera-status" label="Session" value={status.value} />
          <ChoiceRow testID="camera-facing" label="facing" color={color} value={settings.facing} options={FACING_OPTIONS} onChange={facing => props.setSettings({ facing })} />
          <ChoiceRow testID="camera-flash" label="flash" color={color} value={settings.flash} options={FLASH_OPTIONS} onChange={flash => props.setSettings({ flash })} />
          <ChoiceRow testID="camera-mode" label="mode" color={color} value={settings.mode} options={MODE_OPTIONS} onChange={mode => props.setSettings({ mode })} />
          <ResultRow testID="camera-zoom" label="zoom (0 to 1)" value={settings.zoom.toFixed(2)} />
          <view class="button-row">
            <ActionButton testID="camera-zoom-out" title="Zoom out" color={color} onPress={() => props.setSettings({ zoom: Math.max(0, settings.zoom - ZOOM_STEP) })} />
            <ActionButton testID="camera-zoom-in" title="Zoom in" color={color} onPress={() => props.setSettings({ zoom: Math.min(1, settings.zoom + ZOOM_STEP) })} />
          </view>
          <ToggleRow testID="camera-torch" label="torch (a lamp for the back camera)" value={settings.isTorchOn} onChange={isTorchOn => props.setSettings({ isTorchOn })} color={color} />
          <ToggleRow testID="camera-mute" label="record video without sound" value={settings.isMuted} onChange={isMuted => props.setSettings({ isMuted })} color={color} />
        </Card>
      );
    };
  },
  { name: 'Stage', props: ['deck', 'setSettings', 'onScan'] },
);

const ExplorerCard = defineComponent<ISettingsProps & { setSettings: IStageProps['setSettings'] }>(
  props => () => (
    <Explorer testID="camera-explorer" color={color}>
      <ToggleRow testID="camera-active" label="active: the session runs (iOS)" value={props.deck.settings.value.isActive} onChange={isActive => props.setSettings({ isActive })} color={color} />
      <CallConsole
        prefix="camera-calls"
        title="Handle calls"
        color={color}
        hint="Each call runs on the live preview above."
        calls={[
          { label: 'getAvailablePictureSizesAsync', run: async () => props.deck.camera.value?.getAvailablePictureSizesAsync() },
          { label: 'getAvailableLensesAsync', run: async () => props.deck.camera.value?.getAvailableLensesAsync() },
          { label: 'getSupportedFeatures', run: async () => props.deck.camera.value?.getSupportedFeatures() },
          { label: 'getAvailableVideoCodecsAsync', run: getAvailableVideoCodecsAsync },
          { label: 'pausePreview', run: async () => props.deck.camera.value?.pausePreview() },
          { label: 'resumePreview', run: async () => props.deck.camera.value?.resumePreview() },
        ]}
      />
    </Explorer>
  ),
  { name: 'ExplorerCard', props: ['deck', 'setSettings'] },
);

export const CameraScreen = defineComponent(
  () => {
    const deck: ICameraDeck = {
      camera: ref<ICameraViewHandle | null>(null),
      settings: ref<ICameraSettings>(INITIAL_SETTINGS),
      scans: ref<readonly ICameraBarcodeScanningResult[]>([]),
    };
    const setSettings = (patch: Partial<ICameraSettings>) => {
      deck.settings.value = { ...deck.settings.value, ...patch };
    };
    const onScan = (result: ICameraBarcodeScanningResult) => {
      deck.scans.value = pushScan(deck.scans.value, result);
    };
    return () => (
      <ScreenShell
        route={ROUTE}
        testID="camera-scroll"
        title="Camera"
        body="A live camera view with photos, video recording and barcode scanning. It needs a real camera: use a device, the iOS simulator has none."
      >
        <PermissionCard />
        <Stage deck={deck} setSettings={setSettings} onScan={onScan} />
        <PhotoScenario deck={deck} />
        <VideoScenario deck={deck} />
        <ScanScenario deck={deck} />
        <ExplorerCard deck={deck} setSettings={setSettings} />
      </ScreenShell>
    );
  },
  { name: 'CameraScreen' },
);
