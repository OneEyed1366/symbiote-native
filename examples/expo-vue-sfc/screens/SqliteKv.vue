<script setup lang="ts">
import { reactive } from 'vue';
import { AsyncStorage, SQLiteStorage, Storage } from '@symbiote-native/sqlite/kv-store';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { aliasCalls, asyncCalls, syncCalls } from './sqlite-kv-calls';
import type { IKvForm } from './sqlite-kv-calls';

const color = lineColorOf(ROUTE_NAME.Sqlite);
const CUSTOM_STORE_NAME = 'canary-custom-storage';
const custom = new SQLiteStorage(CUSTOM_STORE_NAME);

// The call lists read the form lazily, so one reactive object serves every console
const form = reactive<IKvForm>({ key: 'greeting', value: '{"hello":"world"}', index: '0' });

const storageCalls = [
  { label: 'Storage is AsyncStorage', run: async () => Storage === AsyncStorage },
  { label: 'Storage.getItemAsync', run: () => Storage.getItemAsync(form.key) },
];

const customCalls = [
  ...asyncCalls(custom, form).slice(0, 2),
  { label: 'closeAsync', run: () => custom.closeAsync() },
  { label: 'closeSync', run: async () => custom.closeSync() },
  { label: 'close', run: () => custom.close() },
];
</script>

<template>
  <Card testID="sqlite-kv-form-card" title="Key-value inputs">
    <Field
      testID="sqlite-kv-key-input"
      label="key"
      :value="form.key"
      :onChange="key => (form.key = key)"
    />
    <Field
      testID="sqlite-kv-value-input"
      label="value (JSON object for mergeItem)"
      :value="form.value"
      :onChange="value => (form.value = value)"
    />
    <Field
      testID="sqlite-kv-index-input"
      label="index for getKeyByIndex"
      :value="form.index"
      :onChange="index => (form.index = index)"
    />
  </Card>
  <CallConsole
    prefix="sqlite-kv-async"
    title="AsyncStorage, async"
    :color="color"
    :calls="asyncCalls(AsyncStorage, form)"
  />
  <CallConsole
    prefix="sqlite-kv-sync"
    title="AsyncStorage, sync"
    :color="color"
    :calls="syncCalls(AsyncStorage, form)"
  />
  <CallConsole
    prefix="sqlite-kv-alias"
    title="AsyncStorage-style aliases"
    :color="color"
    :calls="aliasCalls(AsyncStorage, form)"
  />
  <CallConsole
    prefix="sqlite-kv-storage"
    title="Storage (same instance as AsyncStorage)"
    :color="color"
    :calls="storageCalls"
  />
  <CallConsole
    prefix="sqlite-kv-custom"
    title="new SQLiteStorage(name)"
    :color="color"
    :calls="customCalls"
  />
</template>
