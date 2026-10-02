<script setup lang="ts">
import { ref } from 'vue';
import { Directory, File } from '@symbiote-native/file-system';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.FileSystem);

const mimeTypes = ref('');
const initialUri = ref('');
const isMultiple = ref(false);

function picked(files: File | File[] | null): string[] {
  if (files === null) {
    return [];
  }
  return (Array.isArray(files) ? files : [files]).map(item => item.uri);
}

const calls = [
  {
    label: 'File.pickFileAsync',
    run: async () => {
      const types = mimeTypes.value
        .split(',')
        .map(item => item.trim())
        .filter(item => item !== '');
      const common = {
        initialUri: initialUri.value === '' ? undefined : initialUri.value,
        mimeTypes: types.length === 0 ? undefined : types,
      };
      const outcome = isMultiple.value
        ? await File.pickFileAsync({ ...common, multipleFiles: true })
        : await File.pickFileAsync({ ...common, multipleFiles: false });
      return outcome.canceled ? 'canceled' : picked(outcome.result);
    },
  },
  {
    label: 'Directory.pickDirectoryAsync',
    run: async () =>
      (await Directory.pickDirectoryAsync(initialUri.value === '' ? undefined : initialUri.value))
        .uri,
  },
];
</script>

<template>
  <Card testID="file-system-picker-card" title="System pickers">
    <Field
      testID="file-system-mime-input"
      label="mimeTypes (comma separated)"
      :value="mimeTypes"
      :onChange="next => (mimeTypes = next)"
    />
    <Field
      testID="file-system-initial-input"
      label="initialUri"
      :value="initialUri"
      :onChange="next => (initialUri = next)"
    />
    <ToggleRow
      testID="file-system-multiple-switch"
      label="multipleFiles"
      :value="isMultiple"
      :onChange="next => (isMultiple = next)"
      :color="color"
    />
  </Card>
  <CallConsole prefix="file-system-pickers" title="Picker calls" :color="color" :calls="calls" />
</template>
