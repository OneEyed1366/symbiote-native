<script lang="ts">
  import {
    canUseBiometricAuthentication,
    deleteItemAsync,
    getItemAsync,
    isAvailableAsync,
    setItemAsync,
  } from '@symbiote-native/secure-store';
  import type { ISecureStoreOptions } from '@symbiote-native/secure-store';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import Explorer from '../components/Explorer.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import SecureStoreExtras from './SecureStoreExtras.svelte';

  const ROUTE = ROUTE_NAME.SecureStore;
  const color = lineColorOf(ROUTE);
  const DEMO_KEY = 'canary.secure-store.demo';
  const AUTH_OPTIONS: ISecureStoreOptions = {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock to store the demo value',
  };

  type ICapabilityStatus = 'checking' | 'yes' | 'no';

  const CAPABILITY_LABEL: Record<ICapabilityStatus, string> = {
    checking: 'CHECKING…',
    yes: 'YES',
    no: 'NO',
  };

  function toCapabilityStatus(value: boolean): ICapabilityStatus {
    return value ? 'yes' : 'no';
  }

  let isAvailable = $state<ICapabilityStatus>('checking');
  let canUseBiometrics = $state<ICapabilityStatus>('checking');
  let inputText = $state('');
  let storedValue = $state<string | null>(null);
  let lastResult = $state('idle');

  $effect(() => {
    void isAvailableAsync().then(available => {
      isAvailable = toCapabilityStatus(available);
      // Throws when the native module is missing, so it only runs once availability is positive
      canUseBiometrics = available
        ? toCapabilityStatus(canUseBiometricAuthentication())
        : 'no';
    });
  });

  async function readBack(label: string): Promise<void> {
    const value = await getItemAsync(DEMO_KEY);
    storedValue = value;
    lastResult = value === null ? `${label}: no entry` : `${label}: ok`;
  }

  function run(label: string, action: () => Promise<void>): void {
    action().catch((error: Error) => {
      lastResult = `${label} failed: ${error.message}`;
    });
  }

  function read(): void {
    run('read', () => readBack('read'));
  }

  function save(
    text: string,
    options: ISecureStoreOptions = {},
    label = 'saved',
  ): void {
    run(label, async () => {
      await setItemAsync(DEMO_KEY, text, options);
      await readBack(label);
    });
  }

  function remove(): void {
    run('delete', async () => {
      await deleteItemAsync(DEMO_KEY);
      storedValue = null;
      lastResult = 'deleted';
    });
  }
</script>

{#snippet capabilityRow(testID: string, label: string, status: ICapabilityStatus)}
  <view {testID} class="capability-row">
    <text class="capability-label">{label}</text>
    <view class={`status-badge status-badge-${status}`}>
      <text class="status-badge-text">{CAPABILITY_LABEL[status]}</text>
    </view>
  </view>
{/snippet}

<ScreenShell
  route={ROUTE}
  testID="secure-store-scroll"
  title="Secure Store"
  body="Store small secrets, such as a sign-in token or a PIN, in the iOS Keychain and the Android Keystore. They survive app restarts, stay out of backups, and can require Face ID or a fingerprint to read."
>
  <Card testID="secure-store-capability-card" title="Capabilities">
    {@render capabilityRow('secure-store-available', 'Available', isAvailable)}
    {@render capabilityRow('secure-store-biometrics', 'Biometrics usable', canUseBiometrics)}
  </Card>

  <Scenario
    testID="secure-store-remember-scenario"
    title="Keep a sign-in token across restarts"
    why="A session token must survive closing the app but never be readable by other apps or by a backup. The Keychain and Keystore do that; AsyncStorage does not."
    steps={[
      'Type a fake token below and press Save',
      'Force-quit the app and open it again',
      'Press Read',
    ]}
    expect="The same token comes back after the relaunch. The value below shows it, and Last result says ok."
  >
    <text-input
      testID="secure-store-input"
      value={inputText}
      onValueChange={event => {
        inputText = event.text;
      }}
      placeholder="Fake token, e.g. eyJhbGciOi..."
      placeholderTextColor="#41506a"
      class="text-input"
    ></text-input>
    <ActionButton testID="secure-store-save-button" title="Save" onPress={() => save(inputText)} {color} />
    <ActionButton testID="secure-store-read-button" title="Read" onPress={read} {color} />
    <ResultRow testID="secure-store-value" label={DEMO_KEY} value={storedValue ?? '(no entry)'} />
    <ResultRow testID="secure-store-result" label="Last result" value={lastResult} />
  </Scenario>

  <Scenario
    testID="secure-store-biometrics-scenario"
    title="Lock a secret behind Face ID or a fingerprint"
    why="For something like a payment PIN, even an unlocked phone in someone else's hands should not reveal it."
    steps={[
      'Type a value and press Save behind biometrics',
      'Approve the system prompt',
      'Press Read above and approve again',
    ]}
    expect="Saving and reading both ask for biometrics. Cancelling the prompt shows a failure in Last result and the value stays hidden."
  >
    <ActionButton
      testID="secure-store-save-auth-button"
      title="Save behind biometrics"
      onPress={() => save(inputText, AUTH_OPTIONS, 'saved (authenticated)')}
      {color}
    />
  </Scenario>

  <Scenario
    testID="secure-store-signout-scenario"
    title="Wipe the secret on sign-out"
    why="After signing out, the token must be gone, not just forgotten by the UI."
    steps={['Press Delete', 'Press Read above']}
    expect="Read reports no entry, and the value shows (no entry)."
  >
    <ActionButton testID="secure-store-delete-button" title="Delete" onPress={remove} {color} />
  </Scenario>

  <Explorer testID="secure-store-explorer" {color}>
    <SecureStoreExtras />
  </Explorer>
</ScreenShell>
