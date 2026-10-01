<script setup lang="ts">
import { ref } from 'vue';
import {
  AFTER_FIRST_UNLOCK,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  ALWAYS,
  ALWAYS_THIS_DEVICE_ONLY,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  WHEN_UNLOCKED,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  deleteItemAsync,
  getItem,
  getItemAsync,
  setItem,
  setItemAsync,
} from '@symbiote-native/secure-store';
import type { ISecureStoreOptions } from '@symbiote-native/secure-store';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.SecureStore);
const NONE = 'default';

const ACCESSIBLE: Record<string, number | undefined> = {
  [NONE]: undefined,
  AFTER_FIRST_UNLOCK,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  ALWAYS,
  ALWAYS_THIS_DEVICE_ONLY,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  WHEN_UNLOCKED,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const ACCESSIBLE_CHOICES = Object.keys(ACCESSIBLE).map(label => ({
  label,
  value: label,
}));

const key = ref('canary.secure-store.options');
const value = ref('options demo value');
const service = ref('');
const accessGroup = ref('');
const accessible = ref(NONE);
const isAuthRequired = ref(false);
const prompt = ref('Unlock to use the demo value');

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

function options(): ISecureStoreOptions {
  return {
    keychainService: optional(service.value),
    accessGroup: optional(accessGroup.value),
    keychainAccessible: ACCESSIBLE[accessible.value],
    requireAuthentication: isAuthRequired.value,
    authenticationPrompt: optional(prompt.value),
  };
}

const calls = [
  { label: 'setItemAsync', run: async () => setItemAsync(key.value, value.value, options()) },
  { label: 'getItemAsync', run: () => getItemAsync(key.value, options()) },
  { label: 'setItem (sync)', run: async () => setItem(key.value, value.value, options()) },
  { label: 'getItem (sync)', run: async () => getItem(key.value, options()) },
  { label: 'deleteItemAsync', run: async () => deleteItemAsync(key.value, options()) },
];
</script>

<template>
  <Card testID="secure-store-options-card" title="Options for every call below">
    <Field
      testID="secure-store-options-key-input"
      label="key"
      :value="key"
      :onChange="next => (key = next)"
    />
    <Field
      testID="secure-store-options-value-input"
      label="value"
      :value="value"
      :onChange="next => (value = next)"
    />
    <Field
      testID="secure-store-service-input"
      label="keychainService"
      :value="service"
      :onChange="next => (service = next)"
    />
    <Field
      testID="secure-store-group-input"
      label="accessGroup (iOS)"
      :value="accessGroup"
      :onChange="next => (accessGroup = next)"
    />
    <ChoiceRow
      testID="secure-store-accessible"
      label="keychainAccessible (iOS constants, undefined on Android)"
      :options="ACCESSIBLE_CHOICES"
      :value="accessible"
      :onChange="next => (accessible = next)"
      :color="color"
    />
    <ToggleRow
      testID="secure-store-auth-switch"
      label="requireAuthentication"
      :value="isAuthRequired"
      :onChange="next => (isAuthRequired = next)"
      :color="color"
    />
    <Field
      testID="secure-store-prompt-input"
      label="authenticationPrompt"
      :value="prompt"
      :onChange="next => (prompt = next)"
    />
  </Card>
  <CallConsole
    prefix="secure-store-options-calls"
    title="Calls with options"
    :color="color"
    hint="getItem and setItem block the JS thread, with requireAuthentication the app stays frozen until the user authenticates."
    :calls="calls"
  />
</template>
