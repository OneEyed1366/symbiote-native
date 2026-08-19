import { createSignal, onCleanup } from 'solid-js';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@symbiote-native/solid';
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
    props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO';
  return (
    <View testID={props.testID} class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <View class={`status-badge status-badge-${props.status}`}>
        <Text class="status-badge-text">{text()}</Text>
      </View>
    </View>
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

  const [isAvailable, setIsAvailable] = createSignal<ICapabilityStatus>('checking');
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
    <SafeAreaView class="screen">
      <ScrollView
        testID="sharing-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text class="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Sharing</Text>
            <Text class="hero-body">
              @symbiote-native/sharing — hands a local file to the platform
              share sheet (UIActivityViewController on iOS, the Android
              chooser).
            </Text>
          </View>
        </View>

        <View testID="sharing-capability-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Capabilities</Text>
          </View>
          <CapabilityRow
            testID="sharing-available"
            label="Available"
            status={isAvailable()}
          />
        </View>

        <View testID="sharing-share-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Share a file</Text>
          </View>
          <Text class="info-text">
            A real, readable local file URI is required — a file:// path, not a
            http(s) URL, which is not downloaded first. This app has no
            file-system package, so supply a path that already exists on the
            device.
          </Text>
          <TextInput
            testID="sharing-uri-input"
            value={fileUri()}
            onValueChange={setFileUri}
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
          <View class="capability-row">
            <Text class="capability-label">Last result</Text>
            <Text testID="sharing-result" class="value-text">
              {lastResult()}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
