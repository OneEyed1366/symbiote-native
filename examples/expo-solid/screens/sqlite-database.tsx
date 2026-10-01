import { createSignal } from 'solid-js';
import { useSQLiteContext } from '@symbiote-native/sqlite/solid';
import type {
  IChangeset,
  SQLiteSession,
  SQLiteStatement,
} from '@symbiote-native/sqlite/solid';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sqlite);
const INSERT = 'INSERT INTO notes (text) VALUES (?)';
const SELECT_ALL = 'SELECT * FROM notes ORDER BY id';

function need<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`${label} first`);
  }
  return value;
}

function AsyncCalls(props: { text: string; setText: (value: string) => void }) {
  const db = useSQLiteContext();
  let statement: SQLiteStatement | null = null;
  const stmt = () => need(statement, 'prepare a statement');
  return (
    <>
      <Card testID="sqlite-input-card" title="Note text for the calls below">
        <Field testID="sqlite-text-input" label="text" value={props.text} onChange={props.setText} />
      </Card>
      <CallConsole
        prefix="sqlite-async"
        title="Database, async"
        color={color}
        calls={[
          { label: 'execAsync (create table)', run: () => db.execAsync('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)') },
          { label: 'runAsync', run: () => db.runAsync(INSERT, props.text) },
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
            run: () => db.withExclusiveTransactionAsync(async tx => { await tx.runAsync(INSERT, 'exclusive'); }),
          },
          { label: 'serializeAsync', run: async () => (await db.serializeAsync()).byteLength },
          { label: 'loadExtensionAsync', run: () => db.loadExtensionAsync('/nonexistent/extension') },
          { label: 'syncLibSQL', run: () => db.syncLibSQL() },
        ]}
      />
      <CallConsole
        prefix="sqlite-statement-async"
        title="Prepared statement, async"
        color={color}
        calls={[
          { label: 'prepareAsync', run: async () => { statement = await db.prepareAsync('SELECT * FROM notes WHERE text LIKE ?'); return 'prepared'; } },
          { label: 'executeAsync', run: async () => { const result = await stmt().executeAsync<{ id: number }>(['%']); return { first: await result.getFirstAsync(), all: (await result.getAllAsync()).length }; } },
          { label: 'executeForRawResultAsync', run: async () => (await (await stmt().executeForRawResultAsync(['%'])).getAllAsync()) },
          { label: 'resetAsync', run: async () => (await stmt().executeAsync(['%'])).resetAsync() },
          { label: 'getColumnNamesAsync', run: () => stmt().getColumnNamesAsync() },
          { label: 'finalizeAsync', run: () => stmt().finalizeAsync() },
          {
            label: 'run result (lastInsertRowId, changes)',
            run: async () => {
              const insert = await db.prepareAsync(INSERT);
              try {
                const result = await insert.executeAsync([props.text]);
                return { lastInsertRowId: result.lastInsertRowId, changes: result.changes };
              } finally {
                await insert.finalizeAsync();
              }
            },
          },
        ]}
      />
    </>
  );
}

function SyncCalls(props: { text: string }) {
  const db = useSQLiteContext();
  let statement: SQLiteStatement | null = null;
  const stmt = () => need(statement, 'prepare a statement');
  return (
    <>
      <CallConsole
        prefix="sqlite-sync"
        title="Database, sync"
        color={color}
        hint="Sync calls block the JS thread for the duration of the query."
        calls={[
          { label: 'execSync', run: async () => db.execSync('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)') },
          { label: 'runSync', run: async () => db.runSync(INSERT, props.text) },
          { label: 'getFirstSync', run: async () => db.getFirstSync(SELECT_ALL) },
          { label: 'getAllSync', run: async () => db.getAllSync(SELECT_ALL) },
          { label: 'getEachSync', run: async () => Array.from(db.getEachSync(SELECT_ALL)) },
          { label: 'isInTransactionSync', run: async () => db.isInTransactionSync() },
          { label: 'withTransactionSync', run: async () => db.withTransactionSync(() => { db.runSync(INSERT, 'sync transaction'); }) },
          { label: 'serializeSync', run: async () => db.serializeSync().byteLength },
          { label: 'loadExtensionSync', run: async () => db.loadExtensionSync('/nonexistent/extension') },
        ]}
      />
      <CallConsole
        prefix="sqlite-statement-sync"
        title="Prepared statement, sync"
        color={color}
        calls={[
          { label: 'prepareSync', run: async () => { statement = db.prepareSync('SELECT * FROM notes WHERE text LIKE ?'); return 'prepared'; } },
          { label: 'executeSync', run: async () => { const result = stmt().executeSync(['%']); return { first: result.getFirstSync(), all: result.getAllSync().length }; } },
          { label: 'resetSync', run: async () => stmt().executeSync(['%']).resetSync() },
          { label: 'getColumnNamesSync', run: async () => stmt().getColumnNamesSync() },
          { label: 'finalizeSync', run: async () => stmt().finalizeSync() },
        ]}
      />
    </>
  );
}

function TaggedCalls(props: { text: string }) {
  const db = useSQLiteContext();
  return (
    <CallConsole
      prefix="sqlite-tagged"
      title="sql tagged template"
      color={color}
      calls={[
        { label: 'sql (await)', run: async () => db.sql`SELECT * FROM notes WHERE text LIKE ${`%${props.text}%`}` },
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
        { label: 'sql eachSync', run: async () => Array.from(db.sql`SELECT * FROM notes`.eachSync()) },
      ]}
    />
  );
}

function SessionCalls() {
  const db = useSQLiteContext();
  let session: SQLiteSession | null = null;
  let changeset: IChangeset | null = null;
  const live = () => need(session, 'create a session');
  const captured = () => need(changeset, 'capture a changeset');
  return (
    <CallConsole
      prefix="sqlite-session"
      title="Session and changesets"
      color={color}
      calls={[
        { label: 'createSessionAsync', run: async () => { session = await db.createSessionAsync(); return 'session created'; } },
        { label: 'createSessionSync', run: async () => { session = db.createSessionSync(); return 'session created'; } },
        { label: 'attachAsync', run: () => live().attachAsync(null) },
        { label: 'enableAsync', run: () => live().enableAsync(true) },
        { label: 'attachSync', run: async () => live().attachSync(null) },
        { label: 'enableSync', run: async () => live().enableSync(true) },
        { label: 'insert a row', run: () => db.runAsync(INSERT, 'session note') },
        { label: 'createChangesetAsync', run: async () => { changeset = await live().createChangesetAsync(); return changeset.byteLength; } },
        { label: 'createChangesetSync', run: async () => { changeset = live().createChangesetSync(); return changeset.byteLength; } },
        { label: 'createInvertedChangesetAsync', run: async () => (await live().createInvertedChangesetAsync()).byteLength },
        { label: 'createInvertedChangesetSync', run: async () => live().createInvertedChangesetSync().byteLength },
        { label: 'invertChangesetAsync', run: async () => (await live().invertChangesetAsync(captured())).byteLength },
        { label: 'invertChangesetSync', run: async () => live().invertChangesetSync(captured()).byteLength },
        { label: 'applyChangesetAsync', run: () => live().applyChangesetAsync(captured()) },
        { label: 'applyChangesetSync', run: async () => live().applyChangesetSync(captured()) },
        { label: 'closeAsync (session)', run: async () => { await live().closeAsync(); session = null; return 'closed'; } },
      ]}
    />
  );
}

export function DatabaseCards() {
  const [text, setText] = createSignal('canary note');
  return (
    <>
      <AsyncCalls text={text()} setText={setText} />
      <SyncCalls text={text()} />
      <TaggedCalls text={text()} />
      <SessionCalls />
    </>
  );
}
