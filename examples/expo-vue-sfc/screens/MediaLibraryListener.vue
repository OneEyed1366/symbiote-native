<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { addListener, removeAllListeners } from '@symbiote-native/media-library/vue';
import Card from '../components/Card.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.MediaLibrary);
const MAX_LOGGED_EVENTS = 6;

const isOn = ref(false);
const lines = ref<string[]>([]);
let subscription: ReturnType<typeof addListener> | null = null;

onUnmounted(() => {
  subscription?.remove();
  subscription = null;
});

function toggle(next: boolean): void {
  isOn.value = next;
  if (next) {
    subscription = addListener(event => {
      const summary = `incremental ${event.hasIncrementalChanges}, +${event.insertedAssets?.length ?? 0} -${event.deletedAssets?.length ?? 0} ~${event.updatedAssets?.length ?? 0}`;
      lines.value = [summary, ...lines.value].slice(0, MAX_LOGGED_EVENTS);
    });
  } else {
    subscription?.remove();
    removeAllListeners();
  }
}
</script>

<template>
  <Card testID="media-library-listener-card" title="Change listener">
    <ToggleRow
      testID="media-library-listener-switch"
      label="addListener / removeAllListeners"
      :value="isOn"
      :onChange="toggle"
      :color="color"
    />
    <text testID="media-library-listener-log" class="info-text">
      {{ lines.length === 0 ? 'no changes yet, edit the library in another app' : lines.join('\n') }}
    </text>
  </Card>
</template>
