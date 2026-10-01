<script setup lang="ts">
import { ref } from 'vue';
import { File, Paths } from '@symbiote-native/file-system';
import CallConsole from '../components/CallConsole.vue';
import Field from '../components/Field.vue';
import Scenario from '../components/Scenario.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.FileSystem);
const NOTE_NAME = 'canary-note.txt';
const BYTES_PER_MB = 1_048_576;

const text = ref('Remember the milk');

const note = (): File => new File(Paths.document, NOTE_NAME);

const calls = [
  {
    label: 'Save note',
    run: async () => {
      const file = note();
      if (!file.exists) {
        file.create();
      }
      file.write(text.value);
      return { uri: file.uri, size: file.size };
    },
  },
  { label: 'Read note', run: () => note().text() },
  { label: 'Delete note', run: async () => note().delete() },
  {
    label: 'Free disk space (MB)',
    run: async () => Math.round(Paths.availableDiskSpace / BYTES_PER_MB),
  },
];
</script>

<template>
  <Scenario
    testID="file-system-note-scenario"
    title="Keep a note on the device and read it after a restart"
    why="Store drafts, exports or cached data as real files in the app's own documents folder. They survive restarts and other apps cannot read them."
    :steps="['Type a note and press Save note', 'Force-quit the app and open it again', 'Press Read note']"
    expect="The note text comes back unchanged after the relaunch. Delete note removes the file, and Read note then fails with a clear error."
  >
    <Field
      testID="file-system-note-input"
      label="note"
      :value="text"
      :onChange="next => (text = next)"
    />
    <CallConsole isBare prefix="file-system-note" title="Note file" :color="color" :calls="calls" />
  </Scenario>
</template>
