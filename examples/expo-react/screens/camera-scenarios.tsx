import { useEffect, useState } from 'react';
import {
  dismissScanner,
  isModernBarcodeScannerAvailable,
  launchScanner,
  onModernBarcodeScanned,
  scanFromURLAsync,
} from '@symbiote-native/camera/react';
import type { ICameraCapturedPicture } from '@symbiote-native/camera/react';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/react';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow, ToggleRow } from '../components/ScreenShell';
import { MAX_RECORD_SECONDS, SAMPLE_QR_URL, SCAN_TYPES, errorLine } from './camera-parts';
import type { ICameraDeck } from './camera-parts';

const QUALITIES = [0.3, 0.7, 1].map(value => ({ label: String(value), value }));

export function PhotoScenario({ deck, color }: { deck: ICameraDeck; color: string }) {
  const [picture, setPicture] = useState<ICameraCapturedPicture | null>(null);
  const [quality, setQuality] = useState(0.7);
  const [isSilent, setIsSilent] = useState(false);
  const [isRaw, setIsRaw] = useState(false);
  const [line, setLine] = useState('no photo yet');
  const shoot = () => {
    setLine('shooting…');
    deck.camera.current
      ?.takePictureAsync({ quality, shutterSound: !isSilent, skipProcessing: isRaw, exif: true })
      .then(result => {
        setPicture(result ?? null);
        setLine(result === undefined ? 'no picture returned' : `${result.width}x${result.height} ${result.format}`);
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  };
  return (
    <Scenario
      testID="camera-photo-scenario"
      title="Take a photo for a profile, a receipt or a document"
      why="The core camera task. The app shows a live preview, takes a still on a button and gets a file it can upload or show. Quality trades size for sharpness."
      steps={['Allow the camera and wait for the preview', 'Press Take photo', 'Change the quality to 0.3 and shoot again']}
      expect="A thumbnail of the shot appears with its pixel size. Quality 0.3 gives the same pixel size as 1, only the file gets smaller and softer."
    >
      <ChoiceRow testID="camera-quality" label="quality" color={color} value={quality} options={QUALITIES} onChange={setQuality} />
      <ToggleRow testID="camera-silent" label="shutter sound off (not allowed everywhere)" value={isSilent} onChange={setIsSilent} color={color} />
      <ToggleRow testID="camera-raw" label="skipProcessing: the raw sensor image" value={isRaw} onChange={setIsRaw} color={color} />
      <ActionButton testID="camera-take-photo" title="Take photo" color={color} onPress={shoot} />
      <ResultRow testID="camera-photo-result" label="takePictureAsync" value={line} />
      {picture !== null && <image testID="camera-photo" source={{ uri: picture.uri }} className="cam-photo" />}
      {picture?.exif !== undefined && <ResultRow testID="camera-photo-exif" label="EXIF tags" value={String(Object.keys(picture.exif).length)} />}
    </Scenario>
  );
}

function RecordedClip({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView testID="camera-recorded" player={player} nativeControls className="cam-photo" />;
}

export function VideoScenario({ deck, color }: { deck: ICameraDeck; color: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [line, setLine] = useState('not recording');
  const record = () => {
    setLine('recording…');
    deck.camera.current
      ?.recordAsync({ maxDuration: MAX_RECORD_SECONDS })
      .then(result => {
        setUri(result?.uri ?? null);
        setLine(result === undefined ? 'stopped with no file' : 'saved');
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  };
  return (
    <Scenario
      testID="camera-video-scenario"
      title="Record a short video message"
      why="Chats, support forms and social apps record a clip of a limited length and play it back before sending. The recording stops by itself at the limit."
      steps={['Switch the camera to the recording mode above', 'Press Record and wait, or press Stop after a few seconds', 'Play the clip below']}
      expect={`The recording ends on Stop or after ${MAX_RECORD_SECONDS} seconds, whichever is first, and the saved clip plays under the buttons with sound.`}
    >
      <ResultRow testID="camera-mode-line" label="Camera mode" value={deck.settings.mode} />
      <view className="button-row">
        <ActionButton testID="camera-record" title="Record" color={color} onPress={record} />
        <ActionButton testID="camera-stop" title="Stop" color={color} onPress={() => deck.camera.current?.stopRecording()} />
        <ActionButton testID="camera-pause-record" title="Pause or resume (iOS 18)" color={color} onPress={() => void deck.camera.current?.toggleRecordingAsync().catch((error: unknown) => setLine(`failed: ${errorLine(error)}`))} />
      </view>
      <ResultRow testID="camera-record-result" label="recordAsync" value={line} />
      {uri !== null && <RecordedClip uri={uri} />}
    </Scenario>
  );
}

export function ScanScenario({ deck, color }: { deck: ICameraDeck; color: string }) {
  const [modernLine, setModernLine] = useState('not launched');
  const [urlLine, setUrlLine] = useState('not scanned');
  const last = deck.scans[0];
  useEffect(() => {
    const subscription = onModernBarcodeScanned(event => setModernLine(`${event.type}: ${event.data}`));
    return () => subscription.remove();
  }, []);
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
      <ResultRow testID="camera-scan-count" label="Codes seen" value={String(deck.scans.length)} />
      <ResultRow testID="camera-scan-last" label="Last code" value={last === undefined ? 'none yet' : `${last.type}: ${last.data}`} />
      <ActionButton
        testID="camera-scan-url"
        title="Scan the sample image"
        color={color}
        onPress={() => {
          setUrlLine('scanning…');
          scanFromURLAsync(SAMPLE_QR_URL, ['qr'])
            .then(results => setUrlLine(results.length === 0 ? 'no code found' : results.map(item => item.data).join(', ')))
            .catch((error: unknown) => setUrlLine(`failed: ${errorLine(error)}`));
        }}
      />
      <ResultRow testID="camera-scan-url-result" label="scanFromURLAsync" value={urlLine} />
      <ResultRow testID="camera-modern-available" label="isModernBarcodeScannerAvailable()" value={String(isModernBarcodeScannerAvailable())} />
      <view className="button-row">
        <ActionButton testID="camera-modern-launch" title="Open the system scanner" color={color} onPress={() => void launchScanner({ barcodeTypes: SCAN_TYPES, isHighlightingEnabled: true }).catch((error: unknown) => setModernLine(`failed: ${errorLine(error)}`))} />
        <ActionButton testID="camera-modern-dismiss" title="Close it" color={color} onPress={() => void dismissScanner()} />
      </view>
      <ResultRow testID="camera-modern-result" label="onModernBarcodeScanned" value={modernLine} />
    </Scenario>
  );
}
