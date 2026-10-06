import { Show, createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import {
  dismissScanner,
  isModernBarcodeScannerAvailable,
  launchScanner,
  onModernBarcodeScanned,
  scanFromURLAsync,
} from '@symbiote-native/camera/solid';
import type {
  ICameraBarcodeScanningResult,
  ICameraCapturedPicture,
  ICameraViewHandle,
} from '@symbiote-native/camera/solid';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/solid';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow, ToggleRow } from '../components/ScreenShell';
import { MAX_RECORD_SECONDS, QUALITIES, SAMPLE_QR_URL, SCAN_TYPES, errorLine, scanLine } from './camera-shared';
import type { ICameraSettings } from './camera-shared';

export type ICameraDeck = {
  camera: Accessor<ICameraViewHandle | undefined>;
  settings: Accessor<ICameraSettings>;
  scans: Accessor<readonly ICameraBarcodeScanningResult[]>;
};

export function PhotoScenario(props: { deck: ICameraDeck; color: string }) {
  const [picture, setPicture] = createSignal<ICameraCapturedPicture | null>(null);
  const [quality, setQuality] = createSignal(0.7);
  const [isSilent, setIsSilent] = createSignal(false);
  const [isRaw, setIsRaw] = createSignal(false);
  const [line, setLine] = createSignal('no photo yet');
  const shoot = async () => {
    setLine('shooting…');
    try {
      const result = await props.deck
        .camera()
        ?.takePictureAsync({ quality: quality(), shutterSound: !isSilent(), skipProcessing: isRaw(), exif: true });
      setPicture(result ?? null);
      setLine(result === undefined ? 'no picture returned' : `${result.width}x${result.height} ${result.format}`);
    } catch (error) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Scenario
      testID="camera-photo-scenario"
      title="Take a photo for a profile, a receipt or a document"
      why="The core camera task. The app shows a live preview, takes a still on a button and gets a file it can upload or show. Quality trades size for sharpness."
      steps={['Allow the camera and wait for the preview', 'Press Take photo', 'Change the quality to 0.3 and shoot again']}
      expect="A thumbnail of the shot appears with its pixel size. Quality 0.3 gives the same pixel size as 1, only the file gets smaller and softer."
    >
      <ChoiceRow testID="camera-quality" label="quality" color={props.color} value={quality()} options={QUALITIES} onChange={setQuality} />
      <ToggleRow testID="camera-silent" label="shutter sound off (not allowed everywhere)" value={isSilent()} onChange={setIsSilent} color={props.color} />
      <ToggleRow testID="camera-raw" label="skipProcessing: the raw sensor image" value={isRaw()} onChange={setIsRaw} color={props.color} />
      <ActionButton testID="camera-take-photo" title="Take photo" color={props.color} onPress={() => void shoot()} />
      <ResultRow testID="camera-photo-result" label="takePictureAsync" value={line()} />
      <Show when={picture()}>
        {shot => <image testID="camera-photo" source={{ uri: shot().uri }} class="cam-photo" />}
      </Show>
      <Show when={picture()?.exif}>
        {exif => <ResultRow testID="camera-photo-exif" label="EXIF tags" value={String(Object.keys(exif()).length)} />}
      </Show>
    </Scenario>
  );
}

function RecordedClip(props: { uri: string }) {
  const player = useVideoPlayer(() => props.uri);
  return <VideoView testID="camera-recorded" player={player()} nativeControls class="cam-photo" />;
}

export function VideoScenario(props: { deck: ICameraDeck; color: string }) {
  const [uri, setUri] = createSignal<string | null>(null);
  const [line, setLine] = createSignal('not recording');
  const record = async () => {
    setLine('recording…');
    try {
      const result = await props.deck.camera()?.recordAsync({ maxDuration: MAX_RECORD_SECONDS });
      setUri(result?.uri ?? null);
      setLine(result === undefined ? 'stopped with no file' : 'saved');
    } catch (error) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  const togglePause = async () => {
    try {
      await props.deck.camera()?.toggleRecordingAsync();
    } catch (error) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Scenario
      testID="camera-video-scenario"
      title="Record a short video message"
      why="Chats, support forms and social apps record a clip of a limited length and play it back before sending. The recording stops by itself at the limit."
      steps={['Switch the camera to the recording mode above', 'Press Record and wait, or press Stop after a few seconds', 'Play the clip below']}
      expect={`The recording ends on Stop or after ${MAX_RECORD_SECONDS} seconds, whichever is first, and the saved clip plays under the buttons with sound.`}
    >
      <ResultRow testID="camera-mode-line" label="Camera mode" value={props.deck.settings().mode} />
      <view class="button-row">
        <ActionButton testID="camera-record" title="Record" color={props.color} onPress={() => void record()} />
        <ActionButton testID="camera-stop" title="Stop" color={props.color} onPress={() => props.deck.camera()?.stopRecording()} />
        <ActionButton testID="camera-pause-record" title="Pause or resume (iOS 18)" color={props.color} onPress={() => void togglePause()} />
      </view>
      <ResultRow testID="camera-record-result" label="recordAsync" value={line()} />
      <Show when={uri()}>{clip => <RecordedClip uri={clip()} />}</Show>
    </Scenario>
  );
}

export function ScanScenario(props: { deck: ICameraDeck; color: string }) {
  const [modernLine, setModernLine] = createSignal('not launched');
  const [urlLine, setUrlLine] = createSignal('not scanned');
  const subscription = onModernBarcodeScanned(event => setModernLine(`${event.type}: ${event.data}`));
  onCleanup(() => subscription.remove());
  const scanSample = async () => {
    setUrlLine('scanning…');
    try {
      const results = await scanFromURLAsync(SAMPLE_QR_URL, ['qr']);
      setUrlLine(results.length === 0 ? 'no code found' : results.map(item => item.data).join(', '));
    } catch (error) {
      setUrlLine(`failed: ${errorLine(error)}`);
    }
  };
  const openScanner = async () => {
    try {
      await launchScanner({ barcodeTypes: SCAN_TYPES, isHighlightingEnabled: true });
    } catch (error) {
      setModernLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
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
      <ResultRow testID="camera-scan-count" label="Codes seen" value={String(props.deck.scans().length)} />
      <ResultRow testID="camera-scan-last" label="Last code" value={scanLine(props.deck.scans()[0])} />
      <ActionButton testID="camera-scan-url" title="Scan the sample image" color={props.color} onPress={() => void scanSample()} />
      <ResultRow testID="camera-scan-url-result" label="scanFromURLAsync" value={urlLine()} />
      <ResultRow testID="camera-modern-available" label="isModernBarcodeScannerAvailable()" value={String(isModernBarcodeScannerAvailable())} />
      <view class="button-row">
        <ActionButton testID="camera-modern-launch" title="Open the system scanner" color={props.color} onPress={() => void openScanner()} />
        <ActionButton testID="camera-modern-dismiss" title="Close it" color={props.color} onPress={() => void dismissScanner()} />
      </view>
      <ResultRow testID="camera-modern-result" label="onModernBarcodeScanned" value={modernLine()} />
    </Scenario>
  );
}
