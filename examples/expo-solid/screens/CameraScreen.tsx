import { Show, createSignal } from 'solid-js';
import {
  CameraView,
  getAvailableVideoCodecsAsync,
  isCameraAvailableAsync,
  useCameraPermissions,
  useMicrophonePermissions,
} from '@symbiote-native/camera/solid';
import type { ICameraBarcodeScanningResult, ICameraViewHandle } from '@symbiote-native/camera/solid';
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

type ISettingsProps = {
  settings: () => ICameraSettings;
  setSettings: (patch: Partial<ICameraSettings>) => void;
  color: string;
};

function PermissionCard(props: { color: string }) {
  const [camera, requestCamera] = useCameraPermissions();
  const [microphone, requestMicrophone] = useMicrophonePermissions();
  const [availability, setAvailability] = createSignal('not checked');
  const checkAvailable = async () => {
    try {
      setAvailability(String(await isCameraAvailableAsync()));
    } catch (error) {
      setAvailability(`failed: ${errorLine(error)}`);
    }
  };
  const cameraText = () => {
    const response = camera();
    return response === null ? 'checking…' : `${response.status}, can ask again: ${String(response.canAskAgain)}`;
  };
  return (
    <Card testID="camera-permission-card" title="Permissions and hardware">
      <ResultRow testID="camera-permission" label="Camera" value={cameraText()} />
      <ResultRow testID="camera-mic-permission" label="Microphone (video sound)" value={microphone()?.status ?? 'checking…'} />
      <view class="button-row">
        <ActionButton testID="camera-request" title="Allow the camera" color={props.color} onPress={() => void requestCamera()} />
        <ActionButton testID="camera-request-mic" title="Allow the microphone" color={props.color} onPress={() => void requestMicrophone()} />
      </view>
      <ActionButton testID="camera-available" title="isCameraAvailableAsync()" color={props.color} onPress={() => void checkAvailable()} />
      <ResultRow testID="camera-available-result" label="Has a camera" value={availability()} />
      <text class="hero-body">The iOS simulator has no camera: the preview stays black, use a device. The Android emulator draws a virtual scene.</text>
    </Card>
  );
}

type IStageProps = ISettingsProps & {
  setCamera: (handle: ICameraViewHandle) => void;
  onScan: (result: ICameraBarcodeScanningResult) => void;
};

function Stage(props: IStageProps) {
  const [permission] = useCameraPermissions();
  const [status, setStatus] = createSignal('starting');
  return (
    <Card testID="camera-stage" title="Live preview">
      <Show
        when={permission()?.granted === true}
        fallback={
          <view testID="camera-placeholder" class="cam-placeholder">
            <text class="hero-body">Allow the camera above to see the preview here.</text>
          </view>
        }
      >
        <CameraView
          testID="camera-view"
          ref={props.setCamera}
          class="cam-preview"
          facing={props.settings().facing}
          flash={props.settings().flash}
          mode={props.settings().mode}
          zoom={props.settings().zoom}
          mute={props.settings().isMuted}
          enableTorch={props.settings().isTorchOn}
          active={props.settings().isActive}
          barcodeScannerSettings={{ barcodeTypes: SCAN_TYPES }}
          onBarcodeScanned={props.onScan}
          onCameraReady={() => {
            setStatus('ready');
            props.setSettings({ isReady: true });
          }}
          onMountError={event => setStatus(`mount error: ${event.message}`)}
        />
      </Show>
      <ResultRow testID="camera-status" label="Session" value={status()} />
      <ChoiceRow testID="camera-facing" label="facing" color={props.color} value={props.settings().facing} options={FACING_OPTIONS} onChange={facing => props.setSettings({ facing })} />
      <ChoiceRow testID="camera-flash" label="flash" color={props.color} value={props.settings().flash} options={FLASH_OPTIONS} onChange={flash => props.setSettings({ flash })} />
      <ChoiceRow testID="camera-mode" label="mode" color={props.color} value={props.settings().mode} options={MODE_OPTIONS} onChange={mode => props.setSettings({ mode })} />
      <ResultRow testID="camera-zoom" label="zoom (0 to 1)" value={props.settings().zoom.toFixed(2)} />
      <view class="button-row">
        <ActionButton testID="camera-zoom-out" title="Zoom out" color={props.color} onPress={() => props.setSettings({ zoom: Math.max(0, props.settings().zoom - ZOOM_STEP) })} />
        <ActionButton testID="camera-zoom-in" title="Zoom in" color={props.color} onPress={() => props.setSettings({ zoom: Math.min(1, props.settings().zoom + ZOOM_STEP) })} />
      </view>
      <ToggleRow testID="camera-torch" label="torch (a lamp for the back camera)" value={props.settings().isTorchOn} onChange={isTorchOn => props.setSettings({ isTorchOn })} color={props.color} />
      <ToggleRow testID="camera-mute" label="record video without sound" value={props.settings().isMuted} onChange={isMuted => props.setSettings({ isMuted })} color={props.color} />
    </Card>
  );
}

function ExplorerCard(props: ISettingsProps & { camera: ICameraDeck['camera'] }) {
  return (
    <Explorer testID="camera-explorer" color={props.color}>
      <ToggleRow testID="camera-active" label="active: the session runs (iOS)" value={props.settings().isActive} onChange={isActive => props.setSettings({ isActive })} color={props.color} />
      <CallConsole
        prefix="camera-calls"
        title="Handle calls"
        color={props.color}
        hint="Each call runs on the live preview above."
        calls={[
          { label: 'getAvailablePictureSizesAsync', run: async () => props.camera()?.getAvailablePictureSizesAsync() },
          { label: 'getAvailableLensesAsync', run: async () => props.camera()?.getAvailableLensesAsync() },
          { label: 'getSupportedFeatures', run: async () => props.camera()?.getSupportedFeatures() },
          { label: 'getAvailableVideoCodecsAsync', run: getAvailableVideoCodecsAsync },
          { label: 'pausePreview', run: async () => props.camera()?.pausePreview() },
          { label: 'resumePreview', run: async () => props.camera()?.resumePreview() },
        ]}
      />
    </Explorer>
  );
}

export function CameraScreen() {
  const color = lineColorOf(ROUTE);
  const [camera, setCamera] = createSignal<ICameraViewHandle>();
  const [settings, setFullSettings] = createSignal<ICameraSettings>(INITIAL_SETTINGS);
  const [scans, setScans] = createSignal<readonly ICameraBarcodeScanningResult[]>([]);
  const setSettings = (patch: Partial<ICameraSettings>) => setFullSettings(previous => ({ ...previous, ...patch }));
  const onScan = (result: ICameraBarcodeScanningResult) => setScans(previous => pushScan(previous, result));
  const deck: ICameraDeck = { camera, settings, scans };
  return (
    <ScreenShell
      route={ROUTE}
      testID="camera-scroll"
      title="Camera"
      body="A live camera view with photos, video recording and barcode scanning. It needs a real camera: use a device, the iOS simulator has none."
    >
      <PermissionCard color={color} />
      <Stage settings={settings} setSettings={setSettings} setCamera={setCamera} onScan={onScan} color={color} />
      <PhotoScenario deck={deck} color={color} />
      <VideoScenario deck={deck} color={color} />
      <ScanScenario deck={deck} color={color} />
      <ExplorerCard settings={settings} setSettings={setSettings} camera={camera} color={color} />
    </ScreenShell>
  );
}
