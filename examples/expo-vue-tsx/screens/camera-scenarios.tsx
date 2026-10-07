import { defineComponent, onScopeDispose, ref } from 'vue';
import type { Ref } from 'vue';
import {
  dismissScanner,
  isModernBarcodeScannerAvailable,
  launchScanner,
  onModernBarcodeScanned,
  scanFromURLAsync,
} from '@symbiote-native/camera/vue';
import type {
  ICameraBarcodeScanningResult,
  ICameraCapturedPicture,
  ICameraViewHandle,
} from '@symbiote-native/camera/vue';
import { VideoView, useVideoPlayer } from '@symbiote-native/video/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { MAX_RECORD_SECONDS, QUALITIES, SAMPLE_QR_URL, SCAN_TYPES, errorLine, scanLine } from './camera-shared';
import type { ICameraSettings } from './camera-shared';

export type ICameraDeck = {
  camera: Ref<ICameraViewHandle | null>;
  settings: Ref<ICameraSettings>;
  scans: Ref<readonly ICameraBarcodeScanningResult[]>;
};

type IScenarioProps = { deck: ICameraDeck };

const color = lineColorOf(ROUTE_NAME.Camera);

export const PhotoScenario = defineComponent<IScenarioProps>(
  props => {
    const picture = ref<ICameraCapturedPicture | null>(null);
    const quality = ref(0.7);
    const isSilent = ref(false);
    const isRaw = ref(false);
    const line = ref('no photo yet');
    const shoot = async () => {
      line.value = 'shooting…';
      try {
        const result = await props.deck.camera.value?.takePictureAsync({
          quality: quality.value,
          shutterSound: !isSilent.value,
          skipProcessing: isRaw.value,
          exif: true,
        });
        picture.value = result ?? null;
        line.value = result === undefined ? 'no picture returned' : `${result.width}x${result.height} ${result.format}`;
      } catch (error) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => (
      <Scenario
        testID="camera-photo-scenario"
        title="Take a photo for a profile, a receipt or a document"
        why="The core camera task. The app shows a live preview, takes a still on a button and gets a file it can upload or show. Quality trades size for sharpness."
        steps={['Allow the camera and wait for the preview', 'Press Take photo', 'Change the quality to 0.3 and shoot again']}
        expect="A thumbnail of the shot appears with its pixel size. Quality 0.3 gives the same pixel size as 1, only the file gets smaller and softer."
      >
        <ChoiceRow testID="camera-quality" label="quality" color={color} value={quality.value} options={QUALITIES} onChange={value => { quality.value = value; }} />
        <ToggleRow testID="camera-silent" label="shutter sound off (not allowed everywhere)" value={isSilent.value} onChange={value => { isSilent.value = value; }} color={color} />
        <ToggleRow testID="camera-raw" label="skipProcessing: the raw sensor image" value={isRaw.value} onChange={value => { isRaw.value = value; }} color={color} />
        <ActionButton testID="camera-take-photo" title="Take photo" color={color} onPress={() => void shoot()} />
        <ResultRow testID="camera-photo-result" label="takePictureAsync" value={line.value} />
        {picture.value !== null && <image testID="camera-photo" source={{ uri: picture.value.uri }} class="cam-photo" />}
        {picture.value?.exif !== undefined && <ResultRow testID="camera-photo-exif" label="EXIF tags" value={String(Object.keys(picture.value.exif).length)} />}
      </Scenario>
    );
  },
  { name: 'PhotoScenario', props: ['deck'] },
);

const RecordedClip = defineComponent<{ uri: string }>(
  props => {
    const player = useVideoPlayer(() => props.uri);
    return () => <VideoView testID="camera-recorded" player={player.value} nativeControls class="cam-photo" />;
  },
  { name: 'RecordedClip', props: ['uri'] },
);

export const VideoScenario = defineComponent<IScenarioProps>(
  props => {
    const uri = ref<string | null>(null);
    const line = ref('not recording');
    const record = async () => {
      line.value = 'recording…';
      try {
        const result = await props.deck.camera.value?.recordAsync({ maxDuration: MAX_RECORD_SECONDS });
        uri.value = result?.uri ?? null;
        line.value = result === undefined ? 'stopped with no file' : 'saved';
      } catch (error) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    const togglePause = async () => {
      try {
        await props.deck.camera.value?.toggleRecordingAsync();
      } catch (error) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => (
      <Scenario
        testID="camera-video-scenario"
        title="Record a short video message"
        why="Chats, support forms and social apps record a clip of a limited length and play it back before sending. The recording stops by itself at the limit."
        steps={['Switch the camera to the recording mode above', 'Press Record and wait, or press Stop after a few seconds', 'Play the clip below']}
        expect={`The recording ends on Stop or after ${MAX_RECORD_SECONDS} seconds, whichever is first, and the saved clip plays under the buttons with sound.`}
      >
        <ResultRow testID="camera-mode-line" label="Camera mode" value={props.deck.settings.value.mode} />
        <view class="button-row">
          <ActionButton testID="camera-record" title="Record" color={color} onPress={() => void record()} />
          <ActionButton testID="camera-stop" title="Stop" color={color} onPress={() => props.deck.camera.value?.stopRecording()} />
          <ActionButton testID="camera-pause-record" title="Pause or resume (iOS 18)" color={color} onPress={() => void togglePause()} />
        </view>
        <ResultRow testID="camera-record-result" label="recordAsync" value={line.value} />
        {uri.value !== null && <RecordedClip uri={uri.value} />}
      </Scenario>
    );
  },
  { name: 'VideoScenario', props: ['deck'] },
);

export const ScanScenario = defineComponent<IScenarioProps>(
  props => {
    const modernLine = ref('not launched');
    const urlLine = ref('not scanned');
    const subscription = onModernBarcodeScanned(event => {
      modernLine.value = `${event.type}: ${event.data}`;
    });
    onScopeDispose(() => subscription.remove());
    const scanSample = async () => {
      urlLine.value = 'scanning…';
      try {
        const results = await scanFromURLAsync(SAMPLE_QR_URL, ['qr']);
        urlLine.value = results.length === 0 ? 'no code found' : results.map(item => item.data).join(', ');
      } catch (error) {
        urlLine.value = `failed: ${errorLine(error)}`;
      }
    };
    const openScanner = async () => {
      try {
        await launchScanner({ barcodeTypes: SCAN_TYPES, isHighlightingEnabled: true });
      } catch (error) {
        modernLine.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => (
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
        <ResultRow testID="camera-scan-count" label="Codes seen" value={String(props.deck.scans.value.length)} />
        <ResultRow testID="camera-scan-last" label="Last code" value={scanLine(props.deck.scans.value[0])} />
        <ActionButton testID="camera-scan-url" title="Scan the sample image" color={color} onPress={() => void scanSample()} />
        <ResultRow testID="camera-scan-url-result" label="scanFromURLAsync" value={urlLine.value} />
        <ResultRow testID="camera-modern-available" label="isModernBarcodeScannerAvailable()" value={String(isModernBarcodeScannerAvailable())} />
        <view class="button-row">
          <ActionButton testID="camera-modern-launch" title="Open the system scanner" color={color} onPress={() => void openScanner()} />
          <ActionButton testID="camera-modern-dismiss" title="Close it" color={color} onPress={() => void dismissScanner()} />
        </view>
        <ResultRow testID="camera-modern-result" label="onModernBarcodeScanned" value={modernLine.value} />
      </Scenario>
    );
  },
  { name: 'ScanScenario', props: ['deck'] },
);
