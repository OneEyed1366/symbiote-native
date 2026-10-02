import { computed, defineComponent, ref } from 'vue';
import { SQLiteProvider } from '@symbiote-native/sqlite/vue';
import type { IOnInitCallback } from '@symbiote-native/sqlite/vue';
import { Explorer } from '../components/Scenario';
import { ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { DatabaseCards } from './sqlite-database';
import { KvCards } from './sqlite-kv';
import { NotesScenario } from './sqlite-notes';
import {
  INITIAL_PROVIDER,
  ProviderCard,
  StandaloneCards,
  toOpenOptions,
} from './sqlite-standalone';
import type { IProviderForm } from './sqlite-standalone';

const createNotesTable: IOnInitCallback = async db => {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)',
  );
};

export const SqliteScreen = defineComponent(
  () => {
    const form = ref<IProviderForm>(INITIAL_PROVIDER);
    const providerError = ref('none');
    const setForm = (patch: Partial<IProviderForm>) => {
      form.value = { ...form.value, ...patch };
    };
    const onError = (error: Error) => {
      providerError.value = error.message;
    };
    const directory = computed(() =>
      form.value.directory === '' ? undefined : form.value.directory,
    );
    const openOptions = computed(() => toOpenOptions(form.value));

    return () => (
      <ScreenShell
        route={ROUTE_NAME.Sqlite}
        testID="sqlite-scroll"
        title="SQLite"
        body="Keep structured data on the device with a real SQL database: queries, transactions, prepared statements, change tracking and a simple key-value store on top."
      >
        <SQLiteProvider
          databaseName={form.value.databaseName}
          directory={directory.value}
          options={openOptions.value}
          onInit={createNotesTable}
          onError={onError}
        >
          <NotesScenario />
          <Explorer testID="sqlite-database-explorer" color={lineColorOf(ROUTE_NAME.Sqlite)}>
            <DatabaseCards />
          </Explorer>
        </SQLiteProvider>
        <Explorer testID="sqlite-explorer" color={lineColorOf(ROUTE_NAME.Sqlite)}>
          <ProviderCard form={form.value} setForm={setForm} />
          <text testID="sqlite-provider-error" class="info-text">{`onError: ${providerError.value}`}</text>
          <StandaloneCards form={form.value} />
          <KvCards />
        </Explorer>
      </ScreenShell>
    );
  },
  { name: 'SqliteScreen' },
);
