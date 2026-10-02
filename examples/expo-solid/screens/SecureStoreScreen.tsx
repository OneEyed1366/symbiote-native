import { createSignal, onCleanup } from 'solid-js';
import {
  canUseBiometricAuthentication,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
} from '@symbiote-native/secure-store';
import type { ISecureStoreOptions } from '@symbiote-native/secure-store';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  ResultRow,
  ScreenShell,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { SecureStoreExtras } from './secure-store-extras';

const ROUTE = ROUTE_NAME.SecureStore;
const DEMO_KEY = 'canary.secure-store.demo';
const AUTH_OPTIONS: ISecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock to store the demo value',
};

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function CapabilityRow(props: { testID: string; label: string; status: ICapabilityStatus }) {
  const text = () =>
    props.status === 'checking' ? 'CHECKING…' : props.status === 'yes' ? 'YES' : 'NO';
  return (
    <view testID={props.testID} class="capability-row">
      <text class="capability-label">{props.label}</text>
      <view class={`status-badge status-badge-${props.status}`}>
        <text class="status-badge-text">{text()}</text>
      </view>
    </view>
  );
}

function CapabilityCard() {
  const [isAvailable, setIsAvailable] = createSignal<ICapabilityStatus>('checking');
  const [canUseBiometrics, setCanUseBiometrics] = createSignal<ICapabilityStatus>('checking');

  let isMounted = true;
  onCleanup(() => {
    isMounted = false;
  });
  isAvailableAsync().then(available => {
    if (!isMounted) {
      return;
    }
    setIsAvailable(toCapabilityStatus(available));
    // throws when the native module is missing, so it only runs once availability is positive
    setCanUseBiometrics(available ? toCapabilityStatus(canUseBiometricAuthentication()) : 'no');
  });

  return (
    <Card testID="secure-store-capability-card" title="Capabilities">
      <CapabilityRow testID="secure-store-available" label="Available" status={isAvailable()} />
      <CapabilityRow testID="secure-store-biometrics" label="Biometrics usable" status={canUseBiometrics()} />
    </Card>
  );
}

function createDemoEntry() {
  const [storedValue, setStoredValue] = createSignal<string | null>(null);
  const [lastResult, setLastResult] = createSignal('idle');

  const readBack = async (label: string) => {
    const value = await getItemAsync(DEMO_KEY);
    setStoredValue(value);
    setLastResult(value === null ? `${label}: no entry` : `${label}: ok`);
  };

  const run = (label: string, action: () => Promise<void>) => {
    action().catch((error: Error) => setLastResult(`${label} failed: ${error.message}`));
  };

  const read = () => run('read', () => readBack('read'));
  const save = (text: string, options: ISecureStoreOptions = {}, label = 'saved') =>
    run(label, async () => {
      await setItemAsync(DEMO_KEY, text, options);
      await readBack(label);
    });
  const remove = () =>
    run('delete', async () => {
      await deleteItemAsync(DEMO_KEY);
      setStoredValue(null);
      setLastResult('deleted');
    });

  return { storedValue, lastResult, read, save, remove };
}

function EntryCards() {
  const color = lineColorOf(ROUTE);
  const [inputText, setInputText] = createSignal('');
  const entry = createDemoEntry();

  return (
    <>
      <Scenario
        testID="secure-store-remember-scenario"
        title="Keep a sign-in token across restarts"
        why="A session token must survive closing the app but never be readable by other apps or by a backup. The Keychain and Keystore do that; AsyncStorage does not."
        steps={['Type a fake token below and press Save', 'Force-quit the app and open it again', 'Press Read']}
        expect="The same token comes back after the relaunch. The value below shows it, and Last result says ok."
      >
        <text-input
          testID="secure-store-input"
          value={inputText()}
          onValueChange={event => setInputText(event.text)}
          placeholder="Fake token, e.g. eyJhbGciOi..."
          placeholderTextColor="#41506a"
          class="text-input"
        />
        <ActionButton testID="secure-store-save-button" title="Save" onPress={() => entry.save(inputText())} color={color} />
        <ActionButton testID="secure-store-read-button" title="Read" onPress={entry.read} color={color} />
        <ResultRow testID="secure-store-value" label={DEMO_KEY} value={entry.storedValue() ?? '(no entry)'} />
        <ResultRow testID="secure-store-result" label="Last result" value={entry.lastResult()} />
      </Scenario>
      <Scenario
        testID="secure-store-biometrics-scenario"
        title="Lock a secret behind Face ID or a fingerprint"
        why="For something like a payment PIN, even an unlocked phone in someone else's hands should not reveal it."
        steps={['Type a value and press Save behind biometrics', 'Approve the system prompt', 'Press Read above and approve again']}
        expect="Saving and reading both ask for biometrics. Cancelling the prompt shows a failure in Last result and the value stays hidden."
      >
        <ActionButton
          testID="secure-store-save-auth-button"
          title="Save behind biometrics"
          onPress={() => entry.save(inputText(), AUTH_OPTIONS, 'saved (authenticated)')}
          color={color}
        />
      </Scenario>
      <Scenario
        testID="secure-store-signout-scenario"
        title="Wipe the secret on sign-out"
        why="After signing out, the token must be gone, not just forgotten by the UI."
        steps={['Press Delete', 'Press Read above']}
        expect="Read reports no entry, and the value shows (no entry)."
      >
        <ActionButton testID="secure-store-delete-button" title="Delete" onPress={entry.remove} color={color} />
      </Scenario>
    </>
  );
}

export function SecureStoreScreen() {
  return (
    <ScreenShell
      route={ROUTE}
      testID="secure-store-scroll"
      title="Secure Store"
      body="Store small secrets, such as a sign-in token or a PIN, in the iOS Keychain and the Android Keystore. They survive app restarts, stay out of backups, and can require Face ID or a fingerprint to read."
    >
      <CapabilityCard />
      <EntryCards />
      <Explorer testID="secure-store-explorer" color={lineColorOf(ROUTE)}>
        <SecureStoreExtras />
      </Explorer>
    </ScreenShell>
  );
}
