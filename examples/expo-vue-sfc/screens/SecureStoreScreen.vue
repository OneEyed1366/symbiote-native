<!--
  @symbiote-native/secure-store tour stop — a capabilities card (isAvailableAsync,
  canUseBiometricAuthentication), a stored-value card, and a write/read/delete card driving one
  demo key. Kill and relaunch the app to prove the value survives outside the JS heap. Vue SFC
  twin of ../../expo-react/screens/SecureStoreScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/vue';
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
    canUseBiometrics.value = available ? toCapabilityStatus(canUseBiometricAuthentication()) : 'no';
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
  <SafeAreaView class="screen">
    <ScrollView testID="secure-store-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Secure Store</Text>
          <Text class="hero-body"
            >@symbiote-native/secure-store — encrypted key/value storage in the iOS Keychain and
            the Android Keystore. Save a value, kill the app, relaunch, and read it back.</Text
          >
        </View>
      </View>

      <View testID="secure-store-capability-card" class="secure-store-card">
        <Text class="secure-store-card-title">Capabilities</Text>
        <View testID="secure-store-available" class="secure-store-row">
          <Text class="secure-store-row-label">Available</Text>
          <View :class="`secure-store-status-badge secure-store-status-badge-${isAvailable}`">
            <Text class="secure-store-status-text">{{ toBadgeText(isAvailable) }}</Text>
          </View>
        </View>
        <View testID="secure-store-biometrics" class="secure-store-row">
          <Text class="secure-store-row-label">Biometrics usable</Text>
          <View :class="`secure-store-status-badge secure-store-status-badge-${canUseBiometrics}`">
            <Text class="secure-store-status-text">{{ toBadgeText(canUseBiometrics) }}</Text>
          </View>
        </View>
      </View>

      <View testID="secure-store-value-card" class="secure-store-card">
        <Text class="secure-store-card-title">Stored value</Text>
        <View class="secure-store-row">
          <Text class="secure-store-row-label">{{ DEMO_KEY }}</Text>
          <Text testID="secure-store-value" class="secure-store-value-text">{{
            storedValue === null ? '(no entry)' : storedValue
          }}</Text>
        </View>
        <View class="secure-store-row">
          <Text class="secure-store-row-label">Last result</Text>
          <Text testID="secure-store-result" class="secure-store-value-text">{{ lastResult }}</Text>
        </View>
      </View>

      <View testID="secure-store-write-card" class="secure-store-card">
        <Text class="secure-store-card-title">Write, read, delete</Text>
        <TextInput
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
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
