<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { addExpirationListener } from '@symbiote-native/background-task';
import Card from '../components/Card.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.BackgroundTasks);
const MAX_LOGGED_EVENTS = 6;

const isOn = ref(false);
const lines = ref<string[]>([]);
let subscription: ReturnType<typeof addExpirationListener> | null = null;

onUnmounted(() => {
  subscription?.remove();
  subscription = null;
});

function toggle(next: boolean): void {
  isOn.value = next;
  if (next) {
    subscription = addExpirationListener(() => {
      lines.value = [`expired at ${new Date().toISOString()}`, ...lines.value].slice(
        0,
        MAX_LOGGED_EVENTS,
      );
    });
  } else {
    subscription?.remove();
    subscription = null;
  }
}
</script>

<template>
  <Card testID="background-tasks-expiration-card" title="addExpirationListener (background-task)">
    <ToggleRow
      testID="background-tasks-expiration-switch"
      label="listen for the OS expiring the task"
      :value="isOn"
      :onChange="toggle"
      :color="color"
    />
    <text testID="background-tasks-expiration-log" class="info-text">
      {{ lines.length === 0 ? 'no expiration yet' : lines.join('\n') }}
    </text>
  </Card>
</template>
