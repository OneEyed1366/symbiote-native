<!--
  @symbiote-native/secure-store tour stop — a capabilities card (isAvailableAsync,
  canUseBiometricAuthentication), a stored-value card, and a write/read/delete card driving one
  demo key. Kill and relaunch the app to prove the value survives outside the JS heap. Vue SFC
  twin of ../../expo-react/screens/SecureStoreScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  canUseBiometricAuthentication,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
} from '@symbiote-native/secure-store/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_KEY = 'canary.secure-store.demo';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function toBadgeText(status: ICapabilityStatus): string {
  return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SecureStore];
const lineColor = LINE_COLOR[lineInfo.line];

const isAvailable = ref<ICapabilityStatus>('checking');
const canUseBiometrics = ref<ICapabilityStatus>('checking');
const inputText = ref('');
const storedValue = ref<string | null>(null);
const lastResult = ref('idle');

onMounted(() => {
  void isAvailableAsync().then(available => {
    isAvailable.value = toCapabilityStatus(available);
    // canUseBiometricAuthentication throws when the native module is missing entirely, so it only
    // runs once availability has come back positive.
    canUseBiometrics.value = available
      ? toCapabilityStatus(canUseBiometricAuthentication())
      : 'no';
  });
});

async function readBack(label: string): Promise<void> {
  const value = await getItemAsync(DEMO_KEY);
  storedValue.value = value;
  lastResult.value = value === null ? `${label}: no entry` : `${label}: ok`;
}

function handleRead(): void {
  void readBack('read').catch((error: Error) => {
    lastResult.value = `read failed: ${error.message}`;
  });
}

function handleSave(): void {
  void setItemAsync(DEMO_KEY, inputText.value)
    .then(() => readBack('saved'))
    .catch((error: Error) => {
      lastResult.value = `save failed: ${error.message}`;
    });
}

// Android prompts on every operation, iOS only when reading or updating an entry that already
// exists — so the write below may pass silently and the read after it raise the prompt.
function handleSaveAuthenticated(): void {
  void setItemAsync(DEMO_KEY, inputText.value, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock to store the demo value',
  })
    .then(() => readBack('saved (authenticated)'))
    .catch((error: Error) => {
      lastResult.value = `authenticated save failed: ${error.message}`;
    });
}

function handleDelete(): void {
  void deleteItemAsync(DEMO_KEY)
    .then(() => {
      storedValue.value = null;
      lastResult.value = 'deleted';
    })
    .catch((error: Error) => {
      lastResult.value = `delete failed: ${error.message}`;
    });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="secure-store-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Secure Store</text>
          <text class="hero-body"
            >@symbiote-native/secure-store — encrypted key/value storage in the
            iOS Keychain and the Android Keystore. Save a value, kill the app,
            relaunch, and read it back.</text
          >
        </view>
      </view>

      <view testID="secure-store-capability-card" class="secure-store-card">
        <text class="secure-store-card-title">Capabilities</text>
        <view testID="secure-store-available" class="secure-store-row">
          <text class="secure-store-row-label">Available</text>
          <view
            :class="`secure-store-status-badge secure-store-status-badge-${isAvailable}`"
          >
            <text class="secure-store-status-text">{{
              toBadgeText(isAvailable)
            }}</text>
          </view>
        </view>
        <view testID="secure-store-biometrics" class="secure-store-row">
          <text class="secure-store-row-label">Biometrics usable</text>
          <view
            :class="`secure-store-status-badge secure-store-status-badge-${canUseBiometrics}`"
          >
            <text class="secure-store-status-text">{{
              toBadgeText(canUseBiometrics)
            }}</text>
          </view>
        </view>
      </view>

      <view testID="secure-store-value-card" class="secure-store-card">
        <text class="secure-store-card-title">Stored value</text>
        <view class="secure-store-row">
          <text class="secure-store-row-label">{{ DEMO_KEY }}</text>
          <text testID="secure-store-value" class="secure-store-value-text">{{
            storedValue === null ? '(no entry)' : storedValue
          }}</text>
        </view>
        <view class="secure-store-row">
          <text class="secure-store-row-label">Last result</text>
          <text testID="secure-store-result" class="secure-store-value-text">{{
            lastResult
          }}</text>
        </view>
      </view>

      <view testID="secure-store-write-card" class="secure-store-card">
        <text class="secure-store-card-title">Write, read, delete</text>
        <text-input
          testID="secure-store-input"
          v-model="inputText"
          placeholder="Value to store"
          placeholder-text-color="#41506a"
          class="text-input"
        />
        <ActionButton
          testID="secure-store-save-button"
          title="Save"
          :onPress="handleSave"
          :color="lineColor"
        />
        <ActionButton
          testID="secure-store-save-auth-button"
          title="Save behind biometrics"
          :onPress="handleSaveAuthenticated"
          :color="lineColor"
        />
        <ActionButton
          testID="secure-store-read-button"
          title="Read"
          :onPress="handleRead"
          :color="lineColor"
        />
        <ActionButton
          testID="secure-store-delete-button"
          title="Delete"
          :onPress="handleDelete"
          :color="lineColor"
        />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
