<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
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
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { toDirectory, toOpenOptions } from './sqlite-provider-form';
import type { IProviderForm } from './sqlite-provider-form';

const props = defineProps<{ form: IProviderForm }>();

const color = lineColorOf(ROUTE_NAME.Sqlite);
const MAX_LOGGED_EVENTS = 6;
const BUNDLED_MODULE = require('../assets/canary-seed.db');
const DEMO_DATABASE = 'canary-demo.db';
const IN_MEMORY = ':memory:';

let standalone: SQLiteDatabase | null = null;
let backup: SQLiteDatabase | null = null;
let serialized: Uint8Array | null = null;

const query = ref('INSERT INTO notes (text) VALUES (1) RETURNING id');
const isListening = ref(false);
const lines = ref<string[]>([]);
let subscription: ReturnType<typeof addDatabaseChangeListener> | null = null;

const directory = computed(() => toDirectory(props.form));
const name = computed(() => `standalone-${props.form.databaseName}`);

onUnmounted(() => {
  subscription?.remove();
  subscription = null;
});

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
  isListening.value = next;
  if (next) {
    subscription = addDatabaseChangeListener(event => {
      lines.value = [
        `${event.tableName} row ${event.rowId} in ${event.databaseName}`,
        ...lines.value,
      ].slice(0, MAX_LOGGED_EVENTS);
    });
  } else {
    subscription?.remove();
    subscription = null;
  }
}

const moduleCalls = [
  {
    label: 'defaultDatabaseDirectory and bundledExtensions',
    run: async () => ({ defaultDatabaseDirectory, bundledExtensions }),
  },
  {
    label: 'openDatabaseAsync',
    run: async () => {
      standalone = await openDatabaseAsync(name.value, toOpenOptions(props.form), directory.value);
      return standalone.databasePath;
    },
  },
  {
    label: 'openDatabaseSync',
    run: async () => {
      standalone = openDatabaseSync(name.value, toOpenOptions(props.form), directory.value);
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
  { label: 'deleteDatabaseAsync', run: () => deleteDatabaseAsync(name.value, directory.value) },
  {
    label: 'deleteDatabaseSync',
    run: async () => deleteDatabaseSync(name.value, directory.value),
  },
  {
    label: 'importDatabaseFromAssetAsync',
    run: () =>
      importDatabaseFromAssetAsync(
        `imported-${props.form.databaseName}`,
        { assetId: BUNDLED_MODULE, forceOverwrite: true },
        directory.value,
      ),
  },
];

const backupCalls = [
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
];

const helperCalls = [
  { label: 'parseSQLQuery', run: async () => parseSQLQuery(query.value) },
  { label: 'createDatabasePath', run: async () => createDatabasePath(DEMO_DATABASE) },
  { label: 'basename', run: async () => basename(createDatabasePath(DEMO_DATABASE)) },
];
</script>

<template>
  <CallConsole prefix="sqlite-module" title="Module functions" :color="color" :calls="moduleCalls" />
  <CallConsole
    prefix="sqlite-backup"
    title="Backup"
    :color="color"
    hint="Backs the standalone database up into a second in-memory database."
    :calls="backupCalls"
  />
  <Card testID="sqlite-helpers-card" title="Helper inputs">
    <Field
      testID="sqlite-query-input"
      label="query for parseSQLQuery"
      :value="query"
      :onChange="next => (query = next)"
    />
  </Card>
  <CallConsole prefix="sqlite-helpers" title="Helpers" :color="color" :calls="helperCalls" />
  <Card testID="sqlite-change-card" title="addDatabaseChangeListener">
    <ToggleRow
      testID="sqlite-change-switch"
      label="listen (needs enableChangeListener)"
      :value="isListening"
      :onChange="toggleListener"
      :color="color"
    />
    <text testID="sqlite-change-log" class="info-text">
      {{ lines.length === 0 ? 'no changes yet, insert a note' : lines.join('\n') }}
    </text>
  </Card>
</template>
