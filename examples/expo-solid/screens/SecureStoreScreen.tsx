import { createSignal, onCleanup } from 'solid-js';
import { ScrollView, TextInput } from '@symbiote-native/solid';
import {
  canUseBiometricAuthentication,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
} from '@symbiote-native/secure-store';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_KEY = 'canary.secure-store.demo';

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
 * @symbiote-native/secure-store canary demo: a capability card (isAvailableAsync,
 * canUseBiometricAuthentication), a write/read/delete round-trip against one demo key, and the
 * same round-trip with `requireAuthentication` so the device's own biometric prompt is exercised.
 *
 * Kill and relaunch the app to prove the value really survives outside the JS heap. The
 * authenticated variant only prompts on a real device - simulators and emulators skip it.
 */
export function SecureStoreScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SecureStore];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] =
    createSignal<ICapabilityStatus>('checking');
  const [canUseBiometrics, setCanUseBiometrics] =
    createSignal<ICapabilityStatus>('checking');
  const [inputText, setInputText] = createSignal('');
  const [storedValue, setStoredValue] = createSignal<string | null>(null);
  const [lastResult, setLastResult] = createSignal('idle');

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  isAvailableAsync().then(available => {
    if (disposed) {
      return;
    }
    setIsAvailable(toCapabilityStatus(available));
    // canUseBiometricAuthentication throws when the native module is missing entirely, so it
    // only runs once availability has come back positive.
    setCanUseBiometrics(
      available ? toCapabilityStatus(canUseBiometricAuthentication()) : 'no',
    );
  });

  const readBack = async (label: string) => {
    const value = await getItemAsync(DEMO_KEY);
    setStoredValue(value);
    setLastResult(value === null ? `${label}: no entry` : `${label}: ok`);
  };

  const handleRead = () => {
    readBack('read').catch((error: Error) =>
      setLastResult(`read failed: ${error.message}`),
    );
  };

  const handleSave = () => {
    setItemAsync(DEMO_KEY, inputText())
      .then(() => readBack('saved'))
      .catch((error: Error) => setLastResult(`save failed: ${error.message}`));
  };

  // Android prompts on every operation, iOS only when reading or updating an entry that already
  // exists - so the write below may pass silently and the read after it raise the prompt.
  const handleSaveAuthenticated = () => {
    setItemAsync(DEMO_KEY, inputText(), {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock to store the demo value',
    })
      .then(() => readBack('saved (authenticated)'))
      .catch((error: Error) =>
        setLastResult(`authenticated save failed: ${error.message}`),
      );
  };

  const handleDelete = () => {
    deleteItemAsync(DEMO_KEY)
      .then(() => {
        setStoredValue(null);
        setLastResult('deleted');
      })
      .catch((error: Error) =>
        setLastResult(`delete failed: ${error.message}`),
      );
  };

  return (
    <safe-area-view class="screen">
      <ScrollView
        testID="secure-store-scroll"
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
            <text class="hero-title">Secure Store</text>
            <text class="hero-body">
              @symbiote-native/secure-store — encrypted key/value storage in the
              iOS Keychain and the Android Keystore. Save a value, kill the app,
              relaunch, and read it back.
            </text>
          </view>
        </view>

        <view testID="secure-store-capability-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Capabilities</text>
          </view>
          <CapabilityRow
            testID="secure-store-available"
            label="Available"
            status={isAvailable()}
          />
          <CapabilityRow
            testID="secure-store-biometrics"
            label="Biometrics usable"
            status={canUseBiometrics()}
          />
        </view>

        <view testID="secure-store-value-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Stored value</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">{DEMO_KEY}</text>
            <text testID="secure-store-value" class="value-text">
              {storedValue() === null ? '(no entry)' : storedValue()}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Last result</text>
            <text testID="secure-store-result" class="value-text">
              {lastResult()}
            </text>
          </view>
        </view>

        <view testID="secure-store-write-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Write, read, delete</text>
          </view>
          <TextInput
            testID="secure-store-input"
            value={inputText()}
            onValueChange={event => setInputText(event.text)}
            placeholder="Value to store"
            placeholderTextColor="#41506a"
            class="text-input"
          />
          <ActionButton
            testID="secure-store-save-button"
            title="Save"
            onPress={handleSave}
            color={lineColor}
          />
          <ActionButton
            testID="secure-store-save-auth-button"
            title="Save behind biometrics"
            onPress={handleSaveAuthenticated}
            color={lineColor}
          />
          <ActionButton
            testID="secure-store-read-button"
            title="Read"
            onPress={handleRead}
            color={lineColor}
          />
          <ActionButton
            testID="secure-store-delete-button"
            title="Delete"
            onPress={handleDelete}
            color={lineColor}
          />
        </view>
      </ScrollView>
    </safe-area-view>
  );
}
