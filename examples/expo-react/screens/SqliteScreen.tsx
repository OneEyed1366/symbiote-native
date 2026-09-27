import { useCallback, useRef, useState } from 'react';
import {
  SQLiteProvider,
  useSQLiteContext,
} from '@symbiote-native/sqlite/react';
import type {
  IChangeset,
  IOnInitCallback,
  SQLiteDatabase,
  SQLiteSession,
} from '@symbiote-native/sqlite/react';
import { AsyncStorage } from '@symbiote-native/sqlite/kv-store';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DATABASE_NAME = 'canary-demo.db';
const KV_KEY = 'demo-key';
const KV_VALUE = 'demo-value';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IAsyncResult<TValue> =
  | { status: 'success'; value: TValue }
  | { status: 'error'; message: string };

type INoteRow = { id: number; text: string };

function ResultBlock({ testID, result }: { testID: string; result: IAsyncResult<string> | null }) {
  if (!result) {
    return null;
  }
  return (
    <view
      testID={testID}
      className={`auth-result auth-result-${result.status === 'success' ? 'success' : 'error'}`}
    >
      <text className="auth-result-text">
        {result.status === 'success' ? result.value : `Failed: ${result.message}`}
      </text>
    </view>
  );
}

const createNotesTable: IOnInitCallback = async db => {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)',
  );
};

/**
 * Everything that needs an open database — rendered as `<SQLiteProvider>`'s child, so
 * `useSQLiteContext()` below always resolves (the Provider renders nothing until the database is
 * ready). A Fragment, not a wrapping View, so these three cards keep the ScrollView's own
 * `scroll-content` gap between them instead of nesting inside an extra host node.
 */
function SqliteDatabaseCards({ lineColor }: { lineColor: string }) {
  const db = useSQLiteContext();
  const insertCountRef = useRef(0);

  const [insertResult, setInsertResult] = useState<IAsyncResult<string> | null>(null);
  const [readResult, setReadResult] = useState<IAsyncResult<string> | null>(null);
  const [notes, setNotes] = useState<INoteRow[]>([]);
  const [transactionResult, setTransactionResult] = useState<IAsyncResult<string> | null>(null);

  const handleInsertNote = useCallback(() => {
    insertCountRef.current += 1;
    const text = `Note ${insertCountRef.current}`;
    db.runAsync('INSERT INTO notes (text) VALUES (?)', text)
      .then(() => setInsertResult({ status: 'success', value: `Inserted "${text}"` }))
      .catch(error => setInsertResult({ status: 'error', message: errorMessage(error) }));
  }, [db]);

  const handleReadNotes = useCallback(() => {
    db.sql<INoteRow>`SELECT * FROM notes ORDER BY id`.then(
      rows => {
        setNotes(rows);
        setReadResult({ status: 'success', value: `${rows.length} row(s)` });
      },
      error => setReadResult({ status: 'error', message: errorMessage(error) }),
    );
  }, [db]);

  const handleCommitTransaction = useCallback(() => {
    db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'Transaction note A');
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'Transaction note B');
    })
      .then(() => setTransactionResult({ status: 'success', value: 'Committed 2 writes' }))
      .catch(error => setTransactionResult({ status: 'error', message: errorMessage(error) }));
  }, [db]);

  // Deliberately throws inside the transaction to prove withTransactionAsync rolls back — the
  // "success" here is the throw being caught and nothing persisted, not the write itself.
  const handleRollbackTransaction = useCallback(() => {
    db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'Should not persist');
      throw new Error('deliberate rollback');
    })
      .then(() => setTransactionResult({ status: 'error', message: 'did not roll back' }))
      .catch(() => setTransactionResult({ status: 'success', value: 'rolled back' }));
  }, [db]);

  // --- session / changesets ---
  const sessionRef = useRef<SQLiteSession | null>(null);
  const lastChangesetRef = useRef<IChangeset | null>(null);
  const [sessionResult, setSessionResult] = useState<IAsyncResult<string> | null>(null);
  const [changesetResult, setChangesetResult] = useState<IAsyncResult<string> | null>(null);

  const handleStartSession = useCallback(() => {
    db.createSessionAsync()
      .then(session => session.attachAsync(null).then(() => session.enableAsync(true).then(() => session)))
      .then(session => {
        sessionRef.current = session;
        setSessionResult({ status: 'success', value: 'Session started, attached to all tables' });
      })
      .catch(error => setSessionResult({ status: 'error', message: errorMessage(error) }));
  }, [db]);

  const handleCaptureChangeset = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      setChangesetResult({ status: 'error', message: 'Start a session first' });
      return;
    }
    insertCountRef.current += 1;
    const text = `Session note ${insertCountRef.current}`;
    db.runAsync('INSERT INTO notes (text) VALUES (?)', text)
      .then(() => session.createChangesetAsync())
      .then(changeset => {
        lastChangesetRef.current = changeset;
        setChangesetResult({
          status: 'success',
          value: `Captured changeset: ${changeset.byteLength} bytes`,
        });
      })
      .catch(error => setChangesetResult({ status: 'error', message: errorMessage(error) }));
  }, [db]);

  const handleInvertChangeset = useCallback(() => {
    const session = sessionRef.current;
    const changeset = lastChangesetRef.current;
    if (!session || !changeset) {
      setChangesetResult({ status: 'error', message: 'Capture a changeset first' });
      return;
    }
    session
      .invertChangesetAsync(changeset)
      .then(inverted =>
        setChangesetResult({
          status: 'success',
          value: `Inverted changeset: ${inverted.byteLength} bytes`,
        }),
      )
      .catch(error => setChangesetResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  const handleCloseSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      setSessionResult({ status: 'error', message: 'No open session' });
      return;
    }
    session
      .closeAsync()
      .then(() => {
        sessionRef.current = null;
        setSessionResult({ status: 'success', value: 'Session closed' });
      })
      .catch(error => setSessionResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  return (
    <>
      <view testID="sqlite-open-card" className="auth-card">
        <view className="auth-card-header">
          <text className="auth-card-title">Open</text>
        </view>
        <text testID="sqlite-open-status" className="auth-value-text">
          database ready
        </text>
      </view>

      <view testID="sqlite-crud-card" className="auth-card">
        <view className="auth-card-header">
          <text className="auth-card-title">Insert / read</text>
        </view>
        <view className="button-row">
          <ActionButton
            testID="sqlite-insert-note"
            title="Insert note"
            onPress={handleInsertNote}
            color={lineColor}
          />
          <ActionButton
            testID="sqlite-read-notes"
            title="Read all notes"
            onPress={handleReadNotes}
            color={lineColor}
          />
        </view>
        <ResultBlock testID="sqlite-insert-result" result={insertResult} />
        <ResultBlock testID="sqlite-read-result" result={readResult} />
        {notes.map(note => (
          <text key={note.id} testID={`sqlite-note-${note.id}`} className="info-text">
            {`#${note.id} · ${note.text}`}
          </text>
        ))}
      </view>

      <view testID="sqlite-transaction-card" className="auth-card">
        <view className="auth-card-header">
          <text className="auth-card-title">Transaction</text>
        </view>
        <view className="button-row">
          <ActionButton
            testID="sqlite-commit-transaction"
            title="Commit 2 writes"
            onPress={handleCommitTransaction}
            color={lineColor}
          />
          <ActionButton
            testID="sqlite-rollback-transaction"
            title="Force rollback"
            onPress={handleRollbackTransaction}
            color={lineColor}
          />
        </view>
        <ResultBlock testID="sqlite-transaction-result" result={transactionResult} />
      </view>

      <view testID="sqlite-session-card" className="auth-card">
        <view className="auth-card-header">
          <text className="auth-card-title">Session (changesets)</text>
        </view>
        <view className="button-row">
          <ActionButton
            testID="sqlite-session-start"
            title="Start session"
            onPress={handleStartSession}
            color={lineColor}
          />
          <ActionButton
            testID="sqlite-session-close"
            title="Close session"
            onPress={handleCloseSession}
            color={lineColor}
          />
        </view>
        <ResultBlock testID="sqlite-session-result" result={sessionResult} />
        <view className="button-row">
          <ActionButton
            testID="sqlite-session-capture-changeset"
            title="Insert + capture changeset"
            onPress={handleCaptureChangeset}
            color={lineColor}
          />
          <ActionButton
            testID="sqlite-session-invert-changeset"
            title="Invert last changeset"
            onPress={handleInvertChangeset}
            color={lineColor}
          />
        </view>
        <ResultBlock testID="sqlite-session-changeset-result" result={changesetResult} />
      </view>
    </>
  );
}

function KvStoreCard({ lineColor }: { lineColor: string }) {
  const [kvResult, setKvResult] = useState<IAsyncResult<string> | null>(null);

  const handleKvRoundTrip = useCallback(() => {
    AsyncStorage.setItem(KV_KEY, KV_VALUE)
      .then(() => AsyncStorage.getItem(KV_KEY))
      .then(value => setKvResult({ status: 'success', value: value ?? '(null)' }))
      .catch(error => setKvResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  return (
    <view testID="sqlite-kv-store-card" className="auth-card">
      <view className="auth-card-header">
        <text className="auth-card-title">Key-value store</text>
      </view>
      <ActionButton
        testID="sqlite-kv-store-round-trip"
        title="Set + get"
        onPress={handleKvRoundTrip}
        color={lineColor}
      />
      <ResultBlock testID="sqlite-kv-store-result" result={kvResult} />
    </view>
  );
}

/**
 * @symbiote-native/sqlite canary demo: a Provider-scoped `notes` database (schema created via
 * `onInit`), the runAsync/`sql` tagged-template insert-then-read cycle, `withTransactionAsync`
 * commit + deliberate-throw rollback, and the separate SQLite-backed `AsyncStorage` key-value
 * store (its own database, reached through the package's `/kv-store` subpath, not through the
 * Provider above).
 */
export function SqliteScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sqlite];
  const lineColor = LINE_COLOR[lineInfo.line];

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="sqlite-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="sqlite-hero" className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">SQLite</text>
            <text className="hero-body">
              @symbiote-native/sqlite — a Provider-scoped database, the runAsync/sql
              tagged-template read/write surface, transaction commit + rollback, and the
              SQLite-backed key-value store.
            </text>
          </view>
        </view>

        <SQLiteProvider databaseName={DATABASE_NAME} onInit={createNotesTable}>
          <SqliteDatabaseCards lineColor={lineColor} />
        </SQLiteProvider>

        <KvStoreCard lineColor={lineColor} />
      </scroll-view>
    </safe-area-view>
  );
}
