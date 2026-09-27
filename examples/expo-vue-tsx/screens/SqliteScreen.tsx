import { defineComponent, ref } from 'vue';
import {} from '@symbiote-native/vue';
import { SQLiteProvider, useSQLiteContext } from '@symbiote-native/sqlite/vue';
import type {
  IChangeset,
  SQLiteDatabase,
  SQLiteSession,
} from '@symbiote-native/sqlite/vue';
import { AsyncStorage } from '@symbiote-native/sqlite/kv-store';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DATABASE_NAME = 'canary-demo.db';
const KV_KEY = 'demo-key';
const KV_VALUE = 'demo-value';

type INote = { id: number; text: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createNotesTableIfMissing(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)',
  );
}

/**
 * Everything that needs the open `SQLiteDatabase` — `useSQLiteContext()` only resolves inside a
 * descendant's own setup(), never inside the ancestor screen body that merely writes the
 * `<SQLiteProvider>` JSX. So the CRUD and transaction cards live in this separate component,
 * mounted as the Provider's default-slot child.
 */
const SqliteWorkspace = defineComponent<{ lineColor: string }>(
  props => {
    const db = useSQLiteContext();

    // --- crud ---
    const notes = ref<INote[]>([]);
    async function handleInsertAndReload() {
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', `note ${Date.now()}`);
      notes.value = await db.getAllAsync<INote>('SELECT * FROM notes ORDER BY id DESC');
    }

    // --- transaction ---
    const transactionResult = ref('not run yet');
    async function handleTransactionCommit() {
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'transaction write 1');
          await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'transaction write 2');
        });
        transactionResult.value = 'committed 2 writes';
      } catch (error) {
        transactionResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleTransactionRollback() {
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'should not persist');
          throw new Error('deliberate failure');
        });
      } catch {
        transactionResult.value = 'rolled back';
      }
    }

    // --- session / changesets ---
    let session: SQLiteSession | null = null;
    let lastChangeset: IChangeset | null = null;
    const sessionResult = ref('not started yet');
    const changesetResult = ref('not captured yet');

    async function handleStartSession() {
      try {
        session = await db.createSessionAsync();
        await session.attachAsync(null);
        await session.enableAsync(true);
        sessionResult.value = 'session started, attached to all tables';
      } catch (error) {
        sessionResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleCaptureChangeset() {
      if (!session) {
        changesetResult.value = 'start a session first';
        return;
      }
      try {
        await db.runAsync('INSERT INTO notes (text) VALUES (?)', `session note ${Date.now()}`);
        lastChangeset = await session.createChangesetAsync();
        changesetResult.value = `captured ${lastChangeset.byteLength} bytes`;
      } catch (error) {
        changesetResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleInvertChangeset() {
      if (!session || !lastChangeset) {
        changesetResult.value = 'capture a changeset first';
        return;
      }
      try {
        const inverted = await session.invertChangesetAsync(lastChangeset);
        changesetResult.value = `inverted ${inverted.byteLength} bytes`;
      } catch (error) {
        changesetResult.value = `Failed: ${errorMessage(error)}`;
      }
    }
    async function handleCloseSession() {
      if (!session) {
        sessionResult.value = 'no open session';
        return;
      }
      try {
        await session.closeAsync();
        session = null;
        sessionResult.value = 'session closed';
      } catch (error) {
        sessionResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    return () => (
      <>
        <view testID="sqlite-open-card" class="auth-card">
          <view class="auth-card-header">
            <text class="auth-card-title">Open / Provider</text>
          </view>
          <text testID="sqlite-open-status" class="info-text">
            database ready
          </text>
        </view>
        <view testID="sqlite-crud-card" class="auth-card">
          <view class="auth-card-header">
            <text class="auth-card-title">Insert / read</text>
          </view>
          <ActionButton
            testID="sqlite-insert-note"
            title="Insert note"
            onPress={handleInsertAndReload}
            color={props.lineColor}
          />
          {notes.value.map(note => (
            <text key={note.id} testID={`sqlite-note-${note.id}`} class="auth-value-text">
              {`#${note.id} · ${note.text}`}
            </text>
          ))}
        </view>
        <view testID="sqlite-transaction-card" class="auth-card">
          <view class="auth-card-header">
            <text class="auth-card-title">Transaction</text>
          </view>
          <ActionButton
            testID="sqlite-transaction-commit"
            title="Run transaction (2 writes)"
            onPress={handleTransactionCommit}
            color={props.lineColor}
          />
          <ActionButton
            testID="sqlite-transaction-rollback"
            title="Run transaction (throws)"
            onPress={handleTransactionRollback}
            color={props.lineColor}
          />
          <text testID="sqlite-transaction-result" class="info-text">
            {transactionResult.value}
          </text>
        </view>
        <view testID="sqlite-session-card" class="auth-card">
          <view class="auth-card-header">
            <text class="auth-card-title">Session (changesets)</text>
          </view>
          <ActionButton
            testID="sqlite-session-start"
            title="Start session"
            onPress={handleStartSession}
            color={props.lineColor}
          />
          <ActionButton
            testID="sqlite-session-close"
            title="Close session"
            onPress={handleCloseSession}
            color={props.lineColor}
          />
          <text testID="sqlite-session-result" class="info-text">
            {sessionResult.value}
          </text>
          <ActionButton
            testID="sqlite-session-capture-changeset"
            title="Insert + capture changeset"
            onPress={handleCaptureChangeset}
            color={props.lineColor}
          />
          <ActionButton
            testID="sqlite-session-invert-changeset"
            title="Invert last changeset"
            onPress={handleInvertChangeset}
            color={props.lineColor}
          />
          <text testID="sqlite-session-changeset-result" class="info-text">
            {changesetResult.value}
          </text>
        </view>
      </>
    );
  },
  { name: 'SqliteWorkspace', props: ['lineColor'] },
);

/**
 * SQLite demo: @symbiote-native/sqlite — the Provider/context pair, insert + read-back through
 * the database opened by the Provider, `withTransactionAsync` commit and rollback, and the
 * separate SQLite-backed key-value store subpath.
 */
export const SqliteScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sqlite];
    const lineColor = LINE_COLOR[lineInfo.line];

    // --- kv-store ---
    const kvResult = ref('not read yet');
    async function handleKvRoundTrip() {
      try {
        await AsyncStorage.setItem(KV_KEY, KV_VALUE);
        kvResult.value = (await AsyncStorage.getItem(KV_KEY)) ?? 'null';
      } catch (error) {
        kvResult.value = `Failed: ${errorMessage(error)}`;
      }
    }

    return () => (
      <safe-area-view class="screen">
        <scroll-view
          testID="sqlite-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view testID="sqlite-hero" class="hero-card">
            <view class="hero-badge" style={{ backgroundColor: lineColor }}>
              <text class="hero-badge-text">{lineInfo.code}</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">SQLite</text>
              <text class="hero-body">
                @symbiote-native/sqlite — Database/Statement/Session, the SQL
                tagged-template helper, transactions, and a SQLite-backed
                key-value store.
              </text>
            </view>
          </view>

          <SQLiteProvider databaseName={DATABASE_NAME} onInit={createNotesTableIfMissing}>
            <SqliteWorkspace lineColor={lineColor} />
          </SQLiteProvider>

          <view testID="sqlite-kv-store-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Key-value store</text>
            </view>
            <ActionButton
              testID="sqlite-kv-round-trip"
              title="Set + read demo-key"
              onPress={handleKvRoundTrip}
              color={lineColor}
            />
            <text testID="sqlite-kv-result" class="info-text">
              {kvResult.value}
            </text>
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'SqliteScreen' },
);
