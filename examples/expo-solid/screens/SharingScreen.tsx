import { createSignal, onCleanup } from 'solid-js';
import { isAvailableAsync, shareAsync } from '@symbiote-native/sharing';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityRow(props: {
  testID: string;
  label: string;
  status: ICapabilityStatus;
}) {
  const text = () =>
    props.status === 'checking'
      ? 'CHECKING…'
      : props.status === 'yes'
        ? 'YES'
        : 'NO';
  return (
    <view testID={props.testID} class="capability-row">
      <text class="capability-label">{props.label}</text>
      <view class={`status-badge status-badge-${props.status}`}>
        <text class="status-badge-text">{text()}</text>
      </view>
    </view>
  );
}

/**
 * @symbiote-native/sharing canary demo: an isAvailableAsync capability row, plus one shareAsync
 * round-trip against a file URI the user types in.
 *
 * The path is an input rather than a constant because shareAsync needs a real readable local
 * file and this app ships no file-system package to produce one. A wrong path surfaces as the
 * thrown message in the last-result row, which is itself the interesting half of the demo.
 */
export function SharingScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sharing];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] =
    createSignal<ICapabilityStatus>('checking');
  const [fileUri, setFileUri] = createSignal('');
  const [lastResult, setLastResult] = createSignal('idle');

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  isAvailableAsync().then(available => {
    if (!disposed) {
      setIsAvailable(toCapabilityStatus(available));
    }
  });

  const handleShare = () => {
    setLastResult('sheet open…');
    // A resolved promise only means the sheet closed - neither platform reports which app the
    // user picked, or whether they picked one at all.
    shareAsync(fileUri(), { dialogTitle: 'Share from the Symbiote canary' })
      .then(() => setLastResult('sheet dismissed'))
      .catch((error: Error) => setLastResult(`share failed: ${error.message}`));
  };

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="sharing-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: lineColor }}>
            <text class="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Sharing</text>
            <text class="hero-body">
              @symbiote-native/sharing — hands a local file to the platform
              share sheet (UIActivityViewController on iOS, the Android
              chooser).
            </text>
          </view>
        </view>

        <view testID="sharing-capability-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Capabilities</text>
          </view>
          <CapabilityRow
            testID="sharing-available"
            label="Available"
            status={isAvailable()}
          />
        </view>

        <view testID="sharing-share-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Share a file</text>
          </view>
          <text class="info-text">
            A real, readable local file URI is required — a file:// path, not a
            http(s) URL, which is not downloaded first. This app has no
            file-system package, so supply a path that already exists on the
            device.
          </text>
          <text-input
            testID="sharing-uri-input"
            value={fileUri()}
            onValueChange={event => setFileUri(event.text)}
            placeholder="file:///path/to/file.pdf"
            placeholderTextColor="#41506a"
            autoCapitalize="none"
            class="text-input"
          />
          <ActionButton
            testID="sharing-share-button"
            title="Share"
            onPress={handleShare}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Last result</text>
            <text testID="sharing-result" class="value-text">
              {lastResult()}
            </text>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
