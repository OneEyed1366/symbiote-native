<script setup lang="ts">
import { ref } from 'vue';
import { useSQLiteContext } from '@symbiote-native/sqlite/vue';
import ActionButton from '../components/ActionButton.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

type INote = { id: number; text: string };

const color = lineColorOf(ROUTE_NAME.Sqlite);
const db = useSQLiteContext();

const text = ref('Buy milk');
const notes = ref<INote[]>([]);
const status = ref('idle');

async function refresh(): Promise<void> {
  const rows = await db.getAllAsync<INote>('SELECT id, text FROM notes ORDER BY id DESC');
  notes.value = rows;
  status.value = `${rows.length} note(s)`;
}

function run(action: () => Promise<void>): void {
  action().catch((error: Error) => {
    status.value = `failed: ${error.message}`;
  });
}

async function addNote(): Promise<void> {
  await db.runAsync('INSERT INTO notes (text) VALUES (?)', text.value);
  await refresh();
}

async function clearNotes(): Promise<void> {
  await db.runAsync('DELETE FROM notes');
  await refresh();
}
</script>

<template>
  <Scenario
    testID="sqlite-notes-scenario"
    title="Keep a notes list that survives restarts"
    why="Store structured data on the device with real SQL: queries, transactions and indexes. The table is created once by the provider, and the rows stay after the app is closed."
    :steps="['Type a note and press Add note', 'Force-quit the app and open it again', 'Press Show notes']"
    expect="The notes you added are still listed after the relaunch, newest first. Clear all empties the table."
  >
    <Field
      testID="sqlite-note-input"
      label="note"
      :value="text"
      :onChange="next => (text = next)"
    />
    <ActionButton
      testID="sqlite-add-note"
      title="Add note"
      :onPress="() => run(addNote)"
      :color="color"
    />
    <ActionButton
      testID="sqlite-show-notes"
      title="Show notes"
      :onPress="() => run(refresh)"
      :color="color"
    />
    <ActionButton
      testID="sqlite-clear-notes"
      title="Clear all"
      :onPress="() => run(clearNotes)"
      :color="color"
    />
    <ResultRow testID="sqlite-notes-status" label="Status" :value="status" />
    <text v-for="note in notes" :key="note.id" class="info-text">{{
      `#${note.id}  ${note.text}`
    }}</text>
  </Scenario>
</template>
