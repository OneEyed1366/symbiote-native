<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { Directory, Paths } from '@symbiote-native/file-system';
import type { IFileSystemWatchEventType } from '@symbiote-native/file-system';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const props = defineProps<{ dirName: string }>();

const color = lineColorOf(ROUTE_NAME.FileSystem);
const MAX_LOGGED_EVENTS = 6;
const WATCH_EVENTS: readonly IFileSystemWatchEventType[] = [
  'created',
  'modified',
  'deleted',
  'renamed',
];
const EVENT_CHOICES = WATCH_EVENTS.map(item => ({ label: item, value: item }));

const isOn = ref(false);
const debounce = ref('100');
const events = ref<IFileSystemWatchEventType>('modified');
const lines = ref<string[]>([]);
let subscription: { remove: () => void } | null = null;

onUnmounted(() => {
  subscription?.remove();
  subscription = null;
});

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function toggle(next: boolean): void {
  isOn.value = next;
  if (!next) {
    subscription?.remove();
    subscription = null;
    return;
  }
  subscription = new Directory(Paths.cache, props.dirName).watch(
    event => {
      lines.value = [`${event.type} ${event.target.uri}`, ...lines.value].slice(0, MAX_LOGGED_EVENTS);
    },
    { debounce: optionalNumber(debounce.value), events: [events.value] },
  );
}
</script>

<template>
  <Card testID="file-system-watch-card" title="watch (directory)">
    <Field
      testID="file-system-debounce-input"
      label="debounce (ms)"
      :value="debounce"
      :onChange="next => (debounce = next)"
    />
    <ChoiceRow
      testID="file-system-events"
      label="events"
      :options="EVENT_CHOICES"
      :value="events"
      :onChange="next => (events = next)"
      :color="color"
    />
    <ToggleRow
      testID="file-system-watch-switch"
      label="watch the directory above"
      :value="isOn"
      :onChange="toggle"
      :color="color"
    />
    <text testID="file-system-watch-log" class="info-text">
      {{
        lines.length === 0
          ? 'no events yet, create the directory then change files inside it'
          : lines.join('\n')
      }}
    </text>
  </Card>
</template>
