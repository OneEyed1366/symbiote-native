import { Show, Suspense, createSignal } from 'solid-js';
import { SQLiteProvider } from '@symbiote-native/sqlite/solid';
import type { IOnInitCallback } from '@symbiote-native/sqlite/solid';
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

export function SqliteScreen() {
  const [form, setFormState] = createSignal<IProviderForm>(INITIAL_PROVIDER);
  const [providerError, setProviderError] = createSignal('none');
  const setForm = (patch: Partial<IProviderForm>) => setFormState(previous => ({ ...previous, ...patch }));
  const directory = () => (form().directory === '' ? undefined : form().directory);
  const cards = () => (
    <SQLiteProvider
      databaseName={form().databaseName}
      directory={directory()}
      options={toOpenOptions(form())}
      onInit={createNotesTable}
      onError={error => setProviderError(error.message)}
    >
      <NotesScenario />
      <Explorer testID="sqlite-database-explorer" color={lineColorOf(ROUTE_NAME.Sqlite)}>
        <DatabaseCards />
      </Explorer>
    </SQLiteProvider>
  );
  return (
    <ScreenShell
      route={ROUTE_NAME.Sqlite}
      testID="sqlite-scroll"
      title="SQLite"
      body="Keep structured data on the device with a real SQL database: queries, transactions, prepared statements, change tracking and a simple key-value store on top."
    >
      <Show when={form().isSuspense} fallback={cards()}>
        <Suspense fallback={<text class="info-text">opening database…</text>}>{cards()}</Suspense>
      </Show>
      <Explorer testID="sqlite-explorer" color={lineColorOf(ROUTE_NAME.Sqlite)}>
        <ProviderCard form={form()} setForm={setForm} />
        <text testID="sqlite-provider-error" class="info-text">{`onError: ${providerError()}`}</text>
        <StandaloneCards form={form()} />
        <KvCards />
      </Explorer>
    </ScreenShell>
  );
}
