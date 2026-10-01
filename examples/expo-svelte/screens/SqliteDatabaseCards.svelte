<script lang="ts">
  import { useSQLiteContext } from '@symbiote-native/sqlite/svelte';
  import type {
    IChangeset,
    SQLiteSession,
    SQLiteStatement,
  } from '@symbiote-native/sqlite/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { CREATE_NOTES_TABLE } from './sqlite-provider-form';

  const color = lineColorOf(ROUTE_NAME.Sqlite);
  const INSERT = 'INSERT INTO notes (text) VALUES (?)';
  const SELECT_ALL = 'SELECT * FROM notes ORDER BY id';
  const SELECT_LIKE = 'SELECT * FROM notes WHERE text LIKE ?';
  const NO_EXTENSION = '/nonexistent/extension';
  const ANY_TEXT = ['%'];

  const db = useSQLiteContext();

  let text = $state('canary note');
  let statement: SQLiteStatement | null = null;
  let syncStatement: SQLiteStatement | null = null;
  let session: SQLiteSession | null = null;
  let changeset: IChangeset | null = null;

  function need<T>(value: T | null, label: string): T {
    if (value === null) {
      throw new Error(`${label} first`);
    }
    return value;
  }

  const stmt = (): SQLiteStatement => need(statement, 'prepare a statement');
  const syncStmt = (): SQLiteStatement => need(syncStatement, 'prepare a statement');
  const live = (): SQLiteSession => need(session, 'create a session');
  const captured = (): IChangeset => need(changeset, 'capture a changeset');
</script>

<Card testID="sqlite-input-card" title="Note text for the calls below">
  <Field
    testID="sqlite-text-input"
    label="text"
    value={text}
    onChange={next => {
      text = next;
    }}
  />
</Card>
<CallConsole
  prefix="sqlite-async"
  title="Database, async"
  {color}
  calls={[
    { label: 'execAsync (create table)', run: () => db.execAsync(CREATE_NOTES_TABLE) },
    { label: 'runAsync', run: () => db.runAsync(INSERT, text) },
    { label: 'getFirstAsync', run: () => db.getFirstAsync(SELECT_ALL) },
    { label: 'getAllAsync', run: () => db.getAllAsync(SELECT_ALL) },
    {
      label: 'getEachAsync',
      run: async () => {
        const rows: unknown[] = [];
        for await (const row of db.getEachAsync(SELECT_ALL)) {
          rows.push(row);
        }
        return rows;
      },
    },
    { label: 'isInTransactionAsync', run: () => db.isInTransactionAsync() },
    {
      label: 'withTransactionAsync (commit)',
      run: () =>
        db.withTransactionAsync(async () => {
          await db.runAsync(INSERT, 'transaction A');
          await db.runAsync(INSERT, 'transaction B');
        }),
    },
    {
      label: 'withTransactionAsync (rollback)',
      run: async () => {
        try {
          await db.withTransactionAsync(async () => {
            await db.runAsync(INSERT, 'must not persist');
            throw new Error('deliberate rollback');
          });
        } catch (error) {
          return `rolled back: ${error instanceof Error ? error.message : String(error)}`;
        }
        return 'did not roll back';
      },
    },
    {
      label: 'withExclusiveTransactionAsync',
      run: () =>
        db.withExclusiveTransactionAsync(async tx => {
          await tx.runAsync(INSERT, 'exclusive');
        }),
    },
    { label: 'serializeAsync', run: async () => (await db.serializeAsync()).byteLength },
    { label: 'loadExtensionAsync', run: () => db.loadExtensionAsync(NO_EXTENSION) },
    { label: 'syncLibSQL', run: () => db.syncLibSQL() },
  ]}
/>
<CallConsole
  prefix="sqlite-statement-async"
  title="Prepared statement, async"
  {color}
  calls={[
    {
      label: 'prepareAsync',
      run: async () => {
        statement = await db.prepareAsync(SELECT_LIKE);
        return 'prepared';
      },
    },
    {
      label: 'executeAsync',
      run: async () => {
        const result = await stmt().executeAsync<{ id: number }>(ANY_TEXT);
        return { first: await result.getFirstAsync(), all: (await result.getAllAsync()).length };
      },
    },
    {
      label: 'executeForRawResultAsync',
      run: async () => (await stmt().executeForRawResultAsync(ANY_TEXT)).getAllAsync(),
    },
    { label: 'resetAsync', run: async () => (await stmt().executeAsync(ANY_TEXT)).resetAsync() },
    { label: 'getColumnNamesAsync', run: () => stmt().getColumnNamesAsync() },
    { label: 'finalizeAsync', run: () => stmt().finalizeAsync() },
    {
      label: 'run result (lastInsertRowId, changes)',
      run: async () => {
        const insert = await db.prepareAsync(INSERT);
        try {
          const result = await insert.executeAsync([text]);
          return { lastInsertRowId: result.lastInsertRowId, changes: result.changes };
        } finally {
          await insert.finalizeAsync();
        }
      },
    },
  ]}
/>
<CallConsole
  prefix="sqlite-sync"
  title="Database, sync"
  {color}
  hint="Sync calls block the JS thread for the duration of the query."
  calls={[
    { label: 'execSync', run: async () => db.execSync(CREATE_NOTES_TABLE) },
    { label: 'runSync', run: async () => db.runSync(INSERT, text) },
    { label: 'getFirstSync', run: async () => db.getFirstSync(SELECT_ALL) },
    { label: 'getAllSync', run: async () => db.getAllSync(SELECT_ALL) },
    { label: 'getEachSync', run: async () => Array.from(db.getEachSync(SELECT_ALL)) },
    { label: 'isInTransactionSync', run: async () => db.isInTransactionSync() },
    {
      label: 'withTransactionSync',
      run: async () =>
        db.withTransactionSync(() => {
          db.runSync(INSERT, 'sync transaction');
        }),
    },
    { label: 'serializeSync', run: async () => db.serializeSync().byteLength },
    { label: 'loadExtensionSync', run: async () => db.loadExtensionSync(NO_EXTENSION) },
  ]}
/>
<CallConsole
  prefix="sqlite-statement-sync"
  title="Prepared statement, sync"
  {color}
  calls={[
    {
      label: 'prepareSync',
      run: async () => {
        syncStatement = db.prepareSync(SELECT_LIKE);
        return 'prepared';
      },
    },
    {
      label: 'executeSync',
      run: async () => {
        const result = syncStmt().executeSync(ANY_TEXT);
        return { first: result.getFirstSync(), all: result.getAllSync().length };
      },
    },
    { label: 'resetSync', run: async () => syncStmt().executeSync(ANY_TEXT).resetSync() },
    { label: 'getColumnNamesSync', run: async () => syncStmt().getColumnNamesSync() },
    { label: 'finalizeSync', run: async () => syncStmt().finalizeSync() },
  ]}
/>
<CallConsole
  prefix="sqlite-tagged"
  title="sql tagged template"
  {color}
  calls={[
    {
      label: 'sql (await)',
      run: async () => db.sql`SELECT * FROM notes WHERE text LIKE ${`%${text}%`}`,
    },
    { label: 'sql values', run: () => db.sql`SELECT id, text FROM notes`.values() },
    { label: 'sql first', run: () => db.sql`SELECT * FROM notes ORDER BY id DESC`.first() },
    {
      label: 'sql each',
      run: async () => {
        const rows: unknown[] = [];
        for await (const row of db.sql`SELECT * FROM notes`.each()) {
          rows.push(row);
        }
        return rows;
      },
    },
    { label: 'sql allSync', run: async () => db.sql`SELECT * FROM notes`.allSync() },
    { label: 'sql valuesSync', run: async () => db.sql`SELECT id, text FROM notes`.valuesSync() },
    { label: 'sql firstSync', run: async () => db.sql`SELECT * FROM notes`.firstSync() },
    {
      label: 'sql eachSync',
      run: async () => Array.from(db.sql`SELECT * FROM notes`.eachSync()),
    },
  ]}
/>
<CallConsole
  prefix="sqlite-session"
  title="Session and changesets"
  {color}
  calls={[
    {
      label: 'createSessionAsync',
      run: async () => {
        session = await db.createSessionAsync();
        return 'session created';
      },
    },
    {
      label: 'createSessionSync',
      run: async () => {
        session = db.createSessionSync();
        return 'session created';
      },
    },
    { label: 'attachAsync', run: () => live().attachAsync(null) },
    { label: 'enableAsync', run: () => live().enableAsync(true) },
    { label: 'attachSync', run: async () => live().attachSync(null) },
    { label: 'enableSync', run: async () => live().enableSync(true) },
    { label: 'insert a row', run: () => db.runAsync(INSERT, 'session note') },
    {
      label: 'createChangesetAsync',
      run: async () => {
        changeset = await live().createChangesetAsync();
        return changeset.byteLength;
      },
    },
    {
      label: 'createChangesetSync',
      run: async () => {
        changeset = live().createChangesetSync();
        return changeset.byteLength;
      },
    },
    {
      label: 'createInvertedChangesetAsync',
      run: async () => (await live().createInvertedChangesetAsync()).byteLength,
    },
    {
      label: 'createInvertedChangesetSync',
      run: async () => live().createInvertedChangesetSync().byteLength,
    },
    {
      label: 'invertChangesetAsync',
      run: async () => (await live().invertChangesetAsync(captured())).byteLength,
    },
    {
      label: 'invertChangesetSync',
      run: async () => live().invertChangesetSync(captured()).byteLength,
    },
    { label: 'applyChangesetAsync', run: () => live().applyChangesetAsync(captured()) },
    { label: 'applyChangesetSync', run: async () => live().applyChangesetSync(captured()) },
    {
      label: 'closeAsync (session)',
      run: async () => {
        await live().closeAsync();
        session = null;
        return 'closed';
      },
    },
  ]}
/>
