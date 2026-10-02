<script lang="ts">
  import { useSQLiteContext } from '@symbiote-native/sqlite/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  type INote = { id: number; text: string };

  const color = lineColorOf(ROUTE_NAME.Sqlite);
  const db = useSQLiteContext();

  let text = $state('Buy milk');
  let notes = $state<INote[]>([]);
  let status = $state('idle');

  async function refresh(): Promise<void> {
    const rows = await db.getAllAsync<INote>('SELECT id, text FROM notes ORDER BY id DESC');
    notes = rows;
    status = `${rows.length} note(s)`;
  }

  function run(action: () => Promise<void>): void {
    action().catch((error: Error) => {
      status = `failed: ${error.message}`;
    });
  }
</script>

<Scenario
  testID="sqlite-notes-scenario"
  title="Keep a notes list that survives restarts"
  why="Store structured data on the device with real SQL: queries, transactions and indexes. The table is created once by the provider, and the rows stay after the app is closed."
  steps={['Type a note and press Add note', 'Force-quit the app and open it again', 'Press Show notes']}
  expect="The notes you added are still listed after the relaunch, newest first. Clear all empties the table."
>
  <Field
    testID="sqlite-note-input"
    label="note"
    value={text}
    onChange={next => {
      text = next;
    }}
  />
  <ActionButton
    testID="sqlite-add-note"
    title="Add note"
    onPress={() =>
      run(async () => {
        await db.runAsync('INSERT INTO notes (text) VALUES (?)', text);
        await refresh();
      })}
    {color}
  />
  <ActionButton testID="sqlite-show-notes" title="Show notes" onPress={() => run(refresh)} {color} />
  <ActionButton
    testID="sqlite-clear-notes"
    title="Clear all"
    onPress={() =>
      run(async () => {
        await db.runAsync('DELETE FROM notes');
        await refresh();
      })}
    {color}
  />
  <ResultRow testID="sqlite-notes-status" label="Status" value={status} />
  {#each notes as note (note.id)}
    <text class="info-text">{`#${note.id}  ${note.text}`}</text>
  {/each}
</Scenario>
