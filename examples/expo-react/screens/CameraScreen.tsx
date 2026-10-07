import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  CameraView,
  getAvailableVideoCodecsAsync,
  isCameraAvailableAsync,
  useCameraPermissions,
  useMicrophonePermissions,
} from '@symbiote-native/camera/react';
import type {
  ICameraBarcodeScanningResult,
  ICameraFlashMode,
  ICameraMode,
  ICameraType,
  ICameraViewHandle,
} from '@symbiote-native/camera/react';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { Explorer } from '../components/Scenario';
import { Card, ChoiceRow, ResultRow, ScreenShell, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { INITIAL_SETTINGS, SCAN_TYPES } from './camera-parts';
import type { ICameraSettings } from './camera-parts';
import { PhotoScenario, ScanScenario, VideoScenario } from './camera-scenarios';

const ROUTE = ROUTE_NAME.Camera;
const ZOOM_STEP = 0.25;
const MAX_SCANS = 5;

const FACINGS: readonly ICameraType[] = ['back', 'front'];
const FLASHES: readonly ICameraFlashMode[] = ['off', 'on', 'auto', 'screen'];
const MODES: readonly ICameraMode[] = ['picture', 'video'];

function PermissionCard({ color }: { color: string }) {
  const [camera, requestCamera] = useCameraPermissions();
  const [microphone, requestMicrophone] = useMicrophonePermissions();
  const [availability, setAvailability] = useState('not checked');
  return (
    <Card testID="camera-permission-card" title="Permissions and hardware">
      <ResultRow testID="camera-permission" label="Camera" value={camera === null ? 'checking…' : `${camera.status}, can ask again: ${String(camera.canAskAgain)}`} />
      <ResultRow testID="camera-mic-permission" label="Microphone (video sound)" value={microphone === null ? 'checking…' : microphone.status} />
      <view className="button-row">
        <ActionButton testID="camera-request" title="Allow the camera" color={color} onPress={() => void requestCamera()} />
        <ActionButton testID="camera-request-mic" title="Allow the microphone" color={color} onPress={() => void requestMicrophone()} />
      </view>
      <ActionButton
        testID="camera-available"
        title="isCameraAvailableAsync()"
        color={color}
        onPress={() => {
          isCameraAvailableAsync()
            .then(value => setAvailability(String(value)))
            .catch((error: Error) => setAvailability(`failed: ${error.message}`));
        }}
      />
      <ResultRow testID="camera-available-result" label="Has a camera" value={availability} />
      <text className="hero-body">The iOS simulator has no camera: the preview stays black, use a device. The Android emulator draws a virtual scene.</text>
    </Card>
  );
}

type IStageProps = {
  settings: ICameraSettings;
  setSettings: (patch: Partial<ICameraSettings>) => void;
  camera: RefObject<ICameraViewHandle | null>;
  onScan: (result: ICameraBarcodeScanningResult) => void;
  color: string;
};

function Stage({ settings, setSettings, camera, onScan, color }: IStageProps) {
  const [permission] = useCameraPermissions();
  const [status, setStatus] = useState('starting');
  return (
    <Card testID="camera-stage" title="Live preview">
      {permission?.granted === true ? (
        <CameraView
          testID="camera-view"
          ref={camera}
          className="cam-preview"
          facing={settings.facing}
          flash={settings.flash}
          mode={settings.mode}
          zoom={settings.zoom}
          mute={settings.isMuted}
          enableTorch={settings.isTorchOn}
          active={settings.isActive}
          barcodeScannerSettings={{ barcodeTypes: SCAN_TYPES }}
          onBarcodeScanned={onScan}
          onCameraReady={() => {
            setStatus('ready');
            setSettings({ isReady: true });
          }}
          onMountError={event => setStatus(`mount error: ${event.message}`)}
        />
      ) : (
        <view testID="camera-placeholder" className="cam-placeholder">
          <text className="hero-body">Allow the camera above to see the preview here.</text>
        </view>
      )}
      <ResultRow testID="camera-status" label="Session" value={status} />
      <ChoiceRow testID="camera-facing" label="facing" color={color} value={settings.facing} options={FACINGS.map(item => ({ label: item, value: item }))} onChange={facing => setSettings({ facing })} />
      <ChoiceRow testID="camera-flash" label="flash" color={color} value={settings.flash} options={FLASHES.map(item => ({ label: item, value: item }))} onChange={flash => setSettings({ flash })} />
      <ChoiceRow testID="camera-mode" label="mode" color={color} value={settings.mode} options={MODES.map(item => ({ label: item, value: item }))} onChange={mode => setSettings({ mode })} />
      <ResultRow testID="camera-zoom" label="zoom (0 to 1)" value={settings.zoom.toFixed(2)} />
      <view className="button-row">
        <ActionButton testID="camera-zoom-out" title="Zoom out" color={color} onPress={() => setSettings({ zoom: Math.max(0, settings.zoom - ZOOM_STEP) })} />
        <ActionButton testID="camera-zoom-in" title="Zoom in" color={color} onPress={() => setSettings({ zoom: Math.min(1, settings.zoom + ZOOM_STEP) })} />
      </view>
      <ToggleRow testID="camera-torch" label="torch (a lamp for the back camera)" value={settings.isTorchOn} onChange={isTorchOn => setSettings({ isTorchOn })} color={color} />
      <ToggleRow testID="camera-mute" label="record video without sound" value={settings.isMuted} onChange={isMuted => setSettings({ isMuted })} color={color} />
    </Card>
  );
}

function ExplorerCard({ camera, color, setSettings, settings }: Omit<IStageProps, 'onScan'>) {
  return (
    <Explorer testID="camera-explorer" color={color}>
      <ToggleRow testID="camera-active" label="active: the session runs (iOS)" value={settings.isActive} onChange={isActive => setSettings({ isActive })} color={color} />
      <CallConsole
        prefix="camera-calls"
        title="Handle calls"
        color={color}
        hint="Each call runs on the live preview above."
        calls={[
          { label: 'getAvailablePictureSizesAsync', run: async () => camera.current?.getAvailablePictureSizesAsync() },
          { label: 'getAvailableLensesAsync', run: async () => camera.current?.getAvailableLensesAsync() },
          { label: 'getSupportedFeatures', run: async () => camera.current?.getSupportedFeatures() },
          { label: 'getAvailableVideoCodecsAsync', run: getAvailableVideoCodecsAsync },
          { label: 'pausePreview', run: async () => camera.current?.pausePreview() },
          { label: 'resumePreview', run: async () => camera.current?.resumePreview() },
        ]}
      />
    </Explorer>
  );
}

export function CameraScreen() {
  const color = lineColorOf(ROUTE);
  const camera = useRef<ICameraViewHandle>(null);
  const [settings, setFullSettings] = useState<ICameraSettings>(INITIAL_SETTINGS);
  const [scans, setScans] = useState<readonly ICameraBarcodeScanningResult[]>([]);
  const setSettings = (patch: Partial<ICameraSettings>) => setFullSettings(previous => ({ ...previous, ...patch }));
  const onScan = (result: ICameraBarcodeScanningResult) =>
    setScans(previous => (previous[0]?.data === result.data ? previous : [result, ...previous].slice(0, MAX_SCANS)));
  const deck = { camera, settings, scans };
  return (
    <ScreenShell
      route={ROUTE}
      testID="camera-scroll"
      title="Camera"
      body="A live camera view with photos, video recording and barcode scanning. It needs a real camera: use a device, the iOS simulator has none."
    >
      <PermissionCard color={color} />
      <Stage settings={settings} setSettings={setSettings} camera={camera} onScan={onScan} color={color} />
      <PhotoScenario deck={deck} color={color} />
      <VideoScenario deck={deck} color={color} />
      <ScanScenario deck={deck} color={color} />
      <ExplorerCard settings={settings} setSettings={setSettings} camera={camera} color={color} />
    </ScreenShell>
  );
}
