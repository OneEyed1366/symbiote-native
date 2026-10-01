<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import {
  addContactsChangeListener,
  getPermissionsAsync,
  removeAllContactsChangeListeners,
  requestPermissionsAsync,
} from '@symbiote-native/contacts/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Contacts);

const count = ref(0);
const isListening = ref(false);

onUnmounted(() => {
  if (isListening.value) {
    removeAllContactsChangeListeners();
  }
});

function toggle(next: boolean): void {
  isListening.value = next;
  if (next) {
    addContactsChangeListener(() => {
      count.value += 1;
    });
  } else {
    removeAllContactsChangeListeners();
  }
}

const calls = [
  { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
  { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync() },
];
</script>

<template>
  <CallConsole prefix="contacts-permissions" title="Permissions" :color="color" :calls="calls" />
  <Card testID="contacts-listener-card" title="Change listener">
    <ToggleRow
      testID="contacts-listener-switch"
      label="addContactsChangeListener / removeAllContactsChangeListeners"
      :value="isListening"
      :onChange="toggle"
      :color="color"
    />
    <ResultRow testID="contacts-listener-count" label="change events" :value="String(count)" />
    <text class="info-text">Edit a contact in the system Contacts app, then come back.</text>
  </Card>
</template>
