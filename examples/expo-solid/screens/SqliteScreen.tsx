import { createSignal } from 'solid-js';
import {
  SQLiteProvider,
  useSQLiteContext,
} from '@symbiote-native/sqlite/solid';
import type {
  IChangeset,
  SQLiteSession,
} from '@symbiote-native/sqlite/solid';
import { AsyncStorage } from '@symbiote-native/sqlite/kv-store';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DATABASE_NAME = 'canary-demo.db';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type INote = { id: number; text: string };

const CREATE_NOTES_TABLE_SQL =
  'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)';

/** Descendant of <SQLiteProvider> — proves the context is populated once the database opens. */
function DatabaseReadyIndicator() {
  useSQLiteContext();
  return (
    <text testID="sqlite-open-status" class="value-text">
      database ready
    </text>
  );
}

function CrudCard(props: { lineColor: string }) {
  const db = useSQLiteContext();
  let noteCount = 0;

  const [insertStatus, setInsertStatus] = createSignal<string | null>(null);
  const [insertError, setInsertError] = createSignal<string | null>(null);
  const [notes, setNotes] = createSignal<INote[]>([]);
  const [notesError, setNotesError] = createSignal<string | null>(null);

  const handleInsert = async () => {
    noteCount += 1;
    const text = `note ${noteCount}`;
    try {
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', text);
      setInsertError(null);
      setInsertStatus(`inserted "${text}"`);
    } catch (error) {
      setInsertStatus(null);
      setInsertError(errorMessage(error));
    }
  };
  const handleRefresh = async () => {
    try {
      const rows = await db.getAllAsync<INote>('SELECT * FROM notes ORDER BY id');
      setNotesError(null);
      setNotes(rows);
    } catch (error) {
      setNotes([]);
      setNotesError(errorMessage(error));
    }
  };
  const insertStatusDisplay = () => insertError() ?? insertStatus() ?? 'not inserted yet';
  const notesDisplay = () => {
    if (notesError()) {
      return notesError()!;
    }
    return notes().length === 0
      ? 'not loaded yet'
      : notes().map(note => `#${note.id} ${note.text}`).join(', ');
  };

  return (
    <view testID="sqlite-crud-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Insert + read (CRUD)</text>
      </view>
      <ActionButton
        testID="sqlite-insert-note"
        title="Insert note"
        onPress={() => void handleInsert()}
        color={props.lineColor}
      />
      <view class="capability-row">
        <text class="capability-label">Insert</text>
        <text testID="sqlite-insert-status" class="value-text">
          {insertStatusDisplay()}
        </text>
      </view>
      <ActionButton
        testID="sqlite-refresh-notes"
        title="Refresh notes"
        onPress={() => void handleRefresh()}
        color={props.lineColor}
      />
      <text testID="sqlite-notes-list" class="info-text">
        {notesDisplay()}
      </text>
    </view>
  );
}

function TransactionCard(props: { lineColor: string }) {
  const db = useSQLiteContext();
  const [txStatus, setTxStatus] = createSignal<string | null>(null);
  const [txError, setTxError] = createSignal<string | null>(null);

  const handleCommit = async () => {
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'transaction note A');
        await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'transaction note B');
      });
      setTxError(null);
      setTxStatus('committed 2 rows');
    } catch (error) {
      setTxStatus(null);
      setTxError(errorMessage(error));
    }
  };
  // Deliberately throws inside the transaction task — withTransactionAsync rolls back and
  // re-throws, so the insert below never persists.
  const handleRollback = async () => {
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'should not persist');
        throw new Error('deliberate failure');
      });
    } catch {
      setTxStatus(null);
      setTxError('rolled back');
    }
  };
  const txDisplay = () => txError() ?? txStatus() ?? 'not run yet';

  return (
    <view testID="sqlite-transaction-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Transaction (commit / rollback)</text>
      </view>
      <ActionButton
        testID="sqlite-transaction-commit"
        title="Commit two writes"
        onPress={() => void handleCommit()}
        color={props.lineColor}
      />
      <ActionButton
        testID="sqlite-transaction-rollback"
        title="Fail + rollback"
        onPress={() => void handleRollback()}
        color={props.lineColor}
      />
      <view class="capability-row">
        <text class="capability-label">Result</text>
        <text testID="sqlite-transaction-status" class="value-text">
          {txDisplay()}
        </text>
      </view>
    </view>
  );
}

function SessionCard(props: { lineColor: string }) {
  const db = useSQLiteContext();
  let session: SQLiteSession | null = null;
  let lastChangeset: IChangeset | null = null;

  const [sessionStatus, setSessionStatus] = createSignal('not started yet');
  const [changesetStatus, setChangesetStatus] = createSignal('not captured yet');

  const handleStartSession = async () => {
    try {
      session = await db.createSessionAsync();
      await session.attachAsync(null);
      await session.enableAsync(true);
      setSessionStatus('session started, attached to all tables');
    } catch (error) {
      setSessionStatus(`Failed: ${errorMessage(error)}`);
    }
  };
  const handleCaptureChangeset = async () => {
    if (!session) {
      setChangesetStatus('start a session first');
      return;
    }
    try {
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', `session note ${Date.now()}`);
      lastChangeset = await session.createChangesetAsync();
      setChangesetStatus(`captured ${lastChangeset.byteLength} bytes`);
    } catch (error) {
      setChangesetStatus(`Failed: ${errorMessage(error)}`);
    }
  };
  const handleInvertChangeset = async () => {
    if (!session || !lastChangeset) {
      setChangesetStatus('capture a changeset first');
      return;
    }
    try {
      const inverted = await session.invertChangesetAsync(lastChangeset);
      setChangesetStatus(`inverted ${inverted.byteLength} bytes`);
    } catch (error) {
      setChangesetStatus(`Failed: ${errorMessage(error)}`);
    }
  };
  const handleCloseSession = async () => {
    if (!session) {
      setSessionStatus('no open session');
      return;
    }
    try {
      await session.closeAsync();
      session = null;
      setSessionStatus('session closed');
    } catch (error) {
      setSessionStatus(`Failed: ${errorMessage(error)}`);
    }
  };

  return (
    <view testID="sqlite-session-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Session (changesets)</text>
      </view>
      <ActionButton
        testID="sqlite-session-start"
        title="Start session"
        onPress={() => void handleStartSession()}
        color={props.lineColor}
      />
      <ActionButton
        testID="sqlite-session-close"
        title="Close session"
        onPress={() => void handleCloseSession()}
        color={props.lineColor}
      />
      <view class="capability-row">
        <text class="capability-label">Session</text>
        <text testID="sqlite-session-result" class="value-text">
          {sessionStatus()}
        </text>
      </view>
      <ActionButton
        testID="sqlite-session-capture-changeset"
        title="Insert + capture changeset"
        onPress={() => void handleCaptureChangeset()}
        color={props.lineColor}
      />
      <ActionButton
        testID="sqlite-session-invert-changeset"
        title="Invert last changeset"
        onPress={() => void handleInvertChangeset()}
        color={props.lineColor}
      />
      <view class="capability-row">
        <text class="capability-label">Changeset</text>
        <text testID="sqlite-session-changeset-result" class="value-text">
          {changesetStatus()}
        </text>
      </view>
    </view>
  );
}

function KvStoreCard(props: { lineColor: string }) {
  const [kvValue, setKvValue] = createSignal<string | null>(null);
  const [kvError, setKvError] = createSignal<string | null>(null);

  const handleRoundTrip = async () => {
    try {
      await AsyncStorage.setItem('demo-key', 'demo-value');
      const value = await AsyncStorage.getItem('demo-key');
      setKvError(null);
      setKvValue(value);
    } catch (error) {
      setKvValue(null);
      setKvError(errorMessage(error));
    }
  };
  const kvDisplay = () => kvError() ?? kvValue() ?? 'not run yet';

  return (
    <view testID="sqlite-kv-store-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Key-value store (AsyncStorage)</text>
      </view>
      <ActionButton
        testID="sqlite-kv-round-trip"
        title="Set + get demo-key"
        onPress={() => void handleRoundTrip()}
        color={props.lineColor}
      />
      <view class="capability-row">
        <text class="capability-label">Value</text>
        <text testID="sqlite-kv-value" class="value-text">
          {kvDisplay()}
        </text>
      </view>
    </view>
  );
}

/**
 * @symbiote-native/sqlite canary demo: a <SQLiteProvider>/useSQLiteContext database shared by
 * the CRUD and transaction cards, plus the SQLite-backed AsyncStorage key-value store, which
 * opens its own database independently and needs no Provider.
 */
export function SqliteScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sqlite];
  const lineColor = LINE_COLOR[lineInfo.line];

  return (
    <safe-area-view class="screen">
      <scroll-view testID="sqlite-scroll" class="screen" contentContainerStyle="scroll-content">
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
              @symbiote-native/sqlite — SQLiteProvider/useSQLiteContext, insert + read, a
              transaction that commits or rolls back, and a SQLite-backed key-value store.
            </text>
          </view>
        </view>

        <SQLiteProvider
          databaseName={DATABASE_NAME}
          onInit={db => db.execAsync(CREATE_NOTES_TABLE_SQL)}
        >
          <>
            <view testID="sqlite-open-card" class="feature-card">
              <view class="feature-card-header">
                <text class="feature-card-title">Open + init (Provider)</text>
              </view>
              <DatabaseReadyIndicator />
            </view>
            <CrudCard lineColor={lineColor} />
            <TransactionCard lineColor={lineColor} />
            <SessionCard lineColor={lineColor} />
          </>
        </SQLiteProvider>

        <KvStoreCard lineColor={lineColor} />
      </scroll-view>
    </safe-area-view>
  );
}
