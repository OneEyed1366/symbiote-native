<script lang="ts">
  import { SQLiteProvider } from '@symbiote-native/sqlite/svelte';
  import type { IOnInitCallback } from '@symbiote-native/sqlite/svelte';
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import SqliteDatabaseCards from './SqliteDatabaseCards.svelte';
  import SqliteKv from './SqliteKv.svelte';
  import SqliteNotes from './SqliteNotes.svelte';
  import SqliteProviderCard from './SqliteProviderCard.svelte';
  import SqliteStandaloneCards from './SqliteStandaloneCards.svelte';
  import {
    CREATE_NOTES_TABLE,
    INITIAL_PROVIDER,
    toDirectory,
    toOpenOptions,
  } from './sqlite-provider-form';
  import type { IProviderForm } from './sqlite-provider-form';

  const ROUTE = ROUTE_NAME.Sqlite;
  const color = lineColorOf(ROUTE);

  const createNotesTable: IOnInitCallback = async db => {
    await db.execAsync(CREATE_NOTES_TABLE);
  };

  let form = $state<IProviderForm>({ ...INITIAL_PROVIDER });
  let providerError = $state('none');

  const options = $derived(toOpenOptions(form));
  const directory = $derived(toDirectory(form));

  function setForm(patch: Partial<IProviderForm>): void {
    Object.assign(form, patch);
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="sqlite-scroll"
  title="SQLite"
  body="Keep structured data on the device with a real SQL database: queries, transactions, prepared statements, change tracking and a simple key-value store on top."
>
  <SQLiteProvider
    databaseName={form.databaseName}
    {directory}
    {options}
    onInit={createNotesTable}
    onError={error => {
      providerError = error.message;
    }}
  >
    <SqliteNotes />
    <Explorer testID="sqlite-database-explorer" {color}>
      <SqliteDatabaseCards />
    </Explorer>
  </SQLiteProvider>
  <Explorer testID="sqlite-explorer" {color}>
    <SqliteProviderCard {form} {setForm} {color} />
    <text testID="sqlite-provider-error" class="info-text">{`onError: ${providerError}`}</text>
    <SqliteStandaloneCards {form} />
    <SqliteKv />
  </Explorer>
</ScreenShell>
