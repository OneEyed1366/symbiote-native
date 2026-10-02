<script lang="ts">
  import {
    addDatabaseChangeListener,
    backupDatabaseAsync,
    backupDatabaseSync,
    basename,
    bundledExtensions,
    createDatabasePath,
    defaultDatabaseDirectory,
    deleteDatabaseAsync,
    deleteDatabaseSync,
    deserializeDatabaseAsync,
    deserializeDatabaseSync,
    importDatabaseFromAssetAsync,
    openDatabaseAsync,
    openDatabaseSync,
    parseSQLQuery,
  } from '@symbiote-native/sqlite';
  import type { SQLiteDatabase } from '@symbiote-native/sqlite';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { toDirectory, toOpenOptions } from './sqlite-provider-form';
  import type { IProviderForm } from './sqlite-provider-form';

  let { form }: { form: IProviderForm } = $props();

  const color = lineColorOf(ROUTE_NAME.Sqlite);
  const MAX_LOGGED_EVENTS = 6;
  const BUNDLED_MODULE = require('../assets/canary-seed.db');
  const DEMO_DATABASE = 'canary-demo.db';
  const IN_MEMORY = ':memory:';

  let standalone: SQLiteDatabase | null = null;
  let backup: SQLiteDatabase | null = null;
  let serialized: Uint8Array | null = null;

  let query = $state('INSERT INTO notes (text) VALUES (1) RETURNING id');
  let isListening = $state(false);
  let lines = $state<string[]>([]);
  let subscription: ReturnType<typeof addDatabaseChangeListener> | null = null;

  const directory = $derived(toDirectory(form));
  const name = $derived(`standalone-${form.databaseName}`);

  function needStandalone(): SQLiteDatabase {
    if (standalone === null) {
      throw new Error('open a standalone database first');
    }
    return standalone;
  }

  function needBytes(): Uint8Array {
    if (serialized === null) {
      throw new Error('run "serialize for deserialize" first');
    }
    return serialized;
  }

  function toggleListener(next: boolean): void {
    isListening = next;
    if (next) {
      subscription = addDatabaseChangeListener(event => {
        lines = [
          `${event.tableName} row ${event.rowId} in ${event.databaseName}`,
          ...lines,
        ].slice(0, MAX_LOGGED_EVENTS);
      });
    } else {
      subscription?.remove();
    }
  }
</script>

<CallConsole
  prefix="sqlite-module"
  title="Module functions"
  {color}
  calls={[
    {
      label: 'defaultDatabaseDirectory and bundledExtensions',
      run: async () => ({ defaultDatabaseDirectory, bundledExtensions }),
    },
    {
      label: 'openDatabaseAsync',
      run: async () => {
        standalone = await openDatabaseAsync(name, toOpenOptions(form), directory);
        return standalone.databasePath;
      },
    },
    {
      label: 'openDatabaseSync',
      run: async () => {
        standalone = openDatabaseSync(name, toOpenOptions(form), directory);
        return standalone.databasePath;
      },
    },
    {
      label: 'closeAsync (standalone)',
      run: async () => {
        await needStandalone().closeAsync();
        standalone = null;
        return 'closed';
      },
    },
    {
      label: 'closeSync (standalone)',
      run: async () => {
        needStandalone().closeSync();
        standalone = null;
        return 'closed';
      },
    },
    {
      label: 'serialize for deserialize',
      run: async () => {
        serialized = await needStandalone().serializeAsync();
        return serialized.byteLength;
      },
    },
    {
      label: 'deserializeDatabaseAsync',
      run: async () => (await deserializeDatabaseAsync(needBytes())).databasePath,
    },
    {
      label: 'deserializeDatabaseSync',
      run: async () => deserializeDatabaseSync(needBytes()).databasePath,
    },
    { label: 'deleteDatabaseAsync', run: () => deleteDatabaseAsync(name, directory) },
    { label: 'deleteDatabaseSync', run: async () => deleteDatabaseSync(name, directory) },
    {
      label: 'importDatabaseFromAssetAsync',
      run: () =>
        importDatabaseFromAssetAsync(
          `imported-${form.databaseName}`,
          { assetId: BUNDLED_MODULE, forceOverwrite: true },
          directory,
        ),
    },
  ]}
/>
<CallConsole
  prefix="sqlite-backup"
  title="Backup"
  {color}
  hint="Backs the standalone database up into a second in-memory database."
  calls={[
    {
      label: 'backupDatabaseAsync',
      run: async () => {
        backup = await openDatabaseAsync(IN_MEMORY);
        await backupDatabaseAsync({ sourceDatabase: needStandalone(), destDatabase: backup });
        return 'backed up';
      },
    },
    {
      label: 'backupDatabaseSync',
      run: async () => {
        backup = openDatabaseSync(IN_MEMORY);
        backupDatabaseSync({ sourceDatabase: needStandalone(), destDatabase: backup });
        return 'backed up';
      },
    },
  ]}
/>
<Card testID="sqlite-helpers-card" title="Helper inputs">
  <Field
    testID="sqlite-query-input"
    label="query for parseSQLQuery"
    value={query}
    onChange={next => {
      query = next;
    }}
  />
</Card>
<CallConsole
  prefix="sqlite-helpers"
  title="Helpers"
  {color}
  calls={[
    { label: 'parseSQLQuery', run: async () => parseSQLQuery(query) },
    { label: 'createDatabasePath', run: async () => createDatabasePath(DEMO_DATABASE) },
    { label: 'basename', run: async () => basename(createDatabasePath(DEMO_DATABASE)) },
  ]}
/>
<Card testID="sqlite-change-card" title="addDatabaseChangeListener">
  <ToggleRow
    testID="sqlite-change-switch"
    label="listen (needs enableChangeListener)"
    value={isListening}
    onChange={toggleListener}
    {color}
  />
  <text testID="sqlite-change-log" class="info-text">
    {lines.length === 0 ? 'no changes yet, insert a note' : lines.join('\n')}
  </text>
</Card>
