<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  canUseBiometricAuthentication,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
} from '@symbiote-native/secure-store';
import type { ISecureStoreOptions } from '@symbiote-native/secure-store';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import Explorer from '../components/Explorer.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import CapabilityRow from './CapabilityRow.vue';
import SecureStoreExtras from './SecureStoreExtras.vue';

const ROUTE = ROUTE_NAME.SecureStore;
const color = lineColorOf(ROUTE);
const DEMO_KEY = 'canary.secure-store.demo';
const AUTH_OPTIONS: ISecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock to store the demo value',
};

const isAvailable = ref<ICapabilityStatus>('checking');
const canUseBiometrics = ref<ICapabilityStatus>('checking');
const inputText = ref('');
const storedValue = ref<string | null>(null);
const lastResult = ref('idle');

onMounted(() => {
  void isAvailableAsync().then(available => {
    isAvailable.value = toCapabilityStatus(available);
    // Throws when the native module is missing, so it only runs once availability is positive
    canUseBiometrics.value = available ? toCapabilityStatus(canUseBiometricAuthentication()) : 'no';
  });
});

async function readBack(label: string): Promise<void> {
  const value = await getItemAsync(DEMO_KEY);
  storedValue.value = value;
  lastResult.value = value === null ? `${label}: no entry` : `${label}: ok`;
}

function run(label: string, action: () => Promise<void>): void {
  action().catch((error: Error) => {
    lastResult.value = `${label} failed: ${error.message}`;
  });
}

function read(): void {
  run('read', () => readBack('read'));
}

function save(text: string, options: ISecureStoreOptions = {}, label = 'saved'): void {
  run(label, async () => {
    await setItemAsync(DEMO_KEY, text, options);
    await readBack(label);
  });
}

function remove(): void {
  run('delete', async () => {
    await deleteItemAsync(DEMO_KEY);
    storedValue.value = null;
    lastResult.value = 'deleted';
  });
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="secure-store-scroll"
    title="Secure Store"
    body="Store small secrets, such as a sign-in token or a PIN, in the iOS Keychain and the Android Keystore. They survive app restarts, stay out of backups, and can require Face ID or a fingerprint to read."
  >
    <Card testID="secure-store-capability-card" title="Capabilities">
      <CapabilityRow testID="secure-store-available" label="Available" :status="isAvailable" />
      <CapabilityRow
        testID="secure-store-biometrics"
        label="Biometrics usable"
        :status="canUseBiometrics"
      />
    </Card>

    <Scenario
      testID="secure-store-remember-scenario"
      title="Keep a sign-in token across restarts"
      why="A session token must survive closing the app but never be readable by other apps or by a backup. The Keychain and Keystore do that; AsyncStorage does not."
      :steps="[
        'Type a fake token below and press Save',
        'Force-quit the app and open it again',
        'Press Read',
      ]"
      expect="The same token comes back after the relaunch. The value below shows it, and Last result says ok."
    >
      <text-input
        testID="secure-store-input"
        :value="inputText"
        placeholder="Fake token, e.g. eyJhbGciOi..."
        placeholderTextColor="#41506a"
        class="text-input"
        @valueChange="event => (inputText = event.text)"
      ></text-input>
      <ActionButton
        testID="secure-store-save-button"
        title="Save"
        :onPress="() => save(inputText)"
        :color="color"
      />
      <ActionButton testID="secure-store-read-button" title="Read" :onPress="read" :color="color" />
      <ResultRow testID="secure-store-value" :label="DEMO_KEY" :value="storedValue ?? '(no entry)'" />
      <ResultRow testID="secure-store-result" label="Last result" :value="lastResult" />
    </Scenario>

    <Scenario
      testID="secure-store-biometrics-scenario"
      title="Lock a secret behind Face ID or a fingerprint"
      why="For something like a payment PIN, even an unlocked phone in someone else's hands should not reveal it."
      :steps="[
        'Type a value and press Save behind biometrics',
        'Approve the system prompt',
        'Press Read above and approve again',
      ]"
      expect="Saving and reading both ask for biometrics. Cancelling the prompt shows a failure in Last result and the value stays hidden."
    >
      <ActionButton
        testID="secure-store-save-auth-button"
        title="Save behind biometrics"
        :onPress="() => save(inputText, AUTH_OPTIONS, 'saved (authenticated)')"
        :color="color"
      />
    </Scenario>

    <Scenario
      testID="secure-store-signout-scenario"
      title="Wipe the secret on sign-out"
      why="After signing out, the token must be gone, not just forgotten by the UI."
      :steps="['Press Delete', 'Press Read above']"
      expect="Read reports no entry, and the value shows (no entry)."
    >
      <ActionButton
        testID="secure-store-delete-button"
        title="Delete"
        :onPress="remove"
        :color="color"
      />
    </Scenario>

    <Explorer testID="secure-store-explorer" :color="color">
      <SecureStoreExtras />
    </Explorer>
  </ScreenShell>
</template>
