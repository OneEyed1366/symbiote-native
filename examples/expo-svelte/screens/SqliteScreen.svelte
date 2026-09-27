<script lang="ts">
  // @symbiote-native/sqlite tour stop — <SQLiteProvider>/useSQLiteContext, CRUD, a transaction
  // (commit + deliberate rollback), and the SQLite-backed AsyncStorage key/value store. Svelte
  // twin of examples/expo-vue-sfc/screens/SqliteScreen.vue.
  import { SQLiteProvider, openDatabaseAsync } from '@symbiote-native/sqlite/svelte';
  import type {
    IChangeset,
    SQLiteDatabase,
    SQLiteSession,
  } from '@symbiote-native/sqlite/svelte';
  import { AsyncStorage } from '@symbiote-native/sqlite/kv-store';
  import SqliteReadyIndicator from '../components/SqliteReadyIndicator.svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sqlite];
  const lineColor = LINE_COLOR[lineInfo.line];

  type INote = { id: number; text: string };

  async function createNotesTable(db: SQLiteDatabase): Promise<void> {
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)',
    );
  }

  // CRUD + transaction cards share one connection, opened directly — independent of the
  // <SQLiteProvider> the open card below demoes.
  let db: SQLiteDatabase | null = null;
  let dbOpenError = $state<string | null>(null);

  $effect(() => {
    let cancelled = false;
    openDatabaseAsync('canary-demo.db', { onInit: createNotesTable })
      .then(opened => {
        if (cancelled) {
          void opened.closeAsync();
          return;
        }
        db = opened;
      })
      .catch((reason: unknown) => {
        if (!cancelled) dbOpenError = String(reason);
      });
    return () => {
      cancelled = true;
      void db?.closeAsync();
      db = null;
    };
  });

  // CRUD
  let noteSeq = 0;
  let notes = $state<INote[]>([]);
  let crudError = $state<string | null>(null);

  async function handleInsertNote(): Promise<void> {
    crudError = null;
    try {
      if (!db) throw new Error('database not open yet');
      noteSeq += 1;
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', `note #${noteSeq}`);
      notes = await db.sql<INote>`SELECT * FROM notes ORDER BY id`;
    } catch (reason) {
      crudError = String(reason);
    }
  }

  // Transaction — commit two writes, or deliberately throw inside one to show rollback.
  let transactionError = $state<string | null>(null);
  let transactionDone = $state(false);
  let transactionRolledBack = $state(false);

  async function handleCommitTransaction(): Promise<void> {
    transactionError = null;
    transactionRolledBack = false;
    try {
      if (!db) throw new Error('database not open yet');
      const opened = db;
      await opened.withTransactionAsync(async () => {
        await opened.runAsync('INSERT INTO notes (text) VALUES (?)', 'transaction note A');
        await opened.runAsync('INSERT INTO notes (text) VALUES (?)', 'transaction note B');
      });
      notes = await opened.sql<INote>`SELECT * FROM notes ORDER BY id`;
      transactionDone = true;
    } catch (reason) {
      transactionError = String(reason);
    }
  }

  async function handleRollbackTransaction(): Promise<void> {
    transactionError = null;
    transactionDone = false;
    try {
      if (!db) throw new Error('database not open yet');
      const opened = db;
      await opened.withTransactionAsync(async () => {
        await opened.runAsync('INSERT INTO notes (text) VALUES (?)', 'never committed');
        throw new Error('deliberate rollback');
      });
    } catch (reason) {
      transactionRolledBack = true;
      transactionError = String(reason);
    }
  }

  // Session / changesets — operates on the same `db` connection as CRUD/transactions above.
  let session: SQLiteSession | null = null;
  let lastChangeset: IChangeset | null = null;
  let sessionStatus = $state('not started yet');
  let changesetStatus = $state('not captured yet');

  async function handleStartSession(): Promise<void> {
    try {
      if (!db) throw new Error('database not open yet');
      session = await db.createSessionAsync();
      await session.attachAsync(null);
      await session.enableAsync(true);
      sessionStatus = 'session started, attached to all tables';
    } catch (reason) {
      sessionStatus = `Failed: ${String(reason)}`;
    }
  }

  async function handleCaptureChangeset(): Promise<void> {
    if (!db || !session) {
      changesetStatus = 'start a session first';
      return;
    }
    try {
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', `session note ${Date.now()}`);
      lastChangeset = await session.createChangesetAsync();
      changesetStatus = `captured ${lastChangeset.byteLength} bytes`;
    } catch (reason) {
      changesetStatus = `Failed: ${String(reason)}`;
    }
  }

  async function handleInvertChangeset(): Promise<void> {
    if (!session || !lastChangeset) {
      changesetStatus = 'capture a changeset first';
      return;
    }
    try {
      const inverted = await session.invertChangesetAsync(lastChangeset);
      changesetStatus = `inverted ${inverted.byteLength} bytes`;
    } catch (reason) {
      changesetStatus = `Failed: ${String(reason)}`;
    }
  }

  async function handleCloseSession(): Promise<void> {
    if (!session) {
      sessionStatus = 'no open session';
      return;
    }
    try {
      await session.closeAsync();
      session = null;
      sessionStatus = 'session closed';
    } catch (reason) {
      sessionStatus = `Failed: ${String(reason)}`;
    }
  }

  // Key/value store — independent of the database connection above.
  const KV_KEY = 'sqlite-demo-key';
  let kvValue = $state<string | null>(null);
  let kvError = $state<string | null>(null);

  async function handleKvRoundTrip(): Promise<void> {
    kvError = null;
    try {
      await AsyncStorage.setItem(KV_KEY, 'demo-value');
      kvValue = await AsyncStorage.getItem(KV_KEY);
    } catch (reason) {
      kvError = String(reason);
    }
  }
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="sqlite-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">SQLite</text>
        <text testID="sqlite-hero" class="hero-body">
          @symbiote-native/sqlite — SQLiteProvider/useSQLiteContext, CRUD over a real table,
          transactions (commit and rollback), and the SQLite-backed AsyncStorage key/value store.
        </text>
      </view>
    </view>

    <view testID="sqlite-open-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">SQLiteProvider / useSQLiteContext</text>
      </view>
      <SQLiteProvider databaseName="canary-open-demo.db" onInit={createNotesTable}>
        <SqliteReadyIndicator />
      </SQLiteProvider>
    </view>

    <view testID="sqlite-crud-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">CRUD</text>
      </view>
      <ActionButton
        testID="sqlite-crud-insert"
        title="Insert note"
        onPress={handleInsertNote}
        color={lineColor}
      />
      {#if crudError}
        <text class="auth-result-text">{crudError}</text>
      {:else}
        <text testID="sqlite-crud-count" class="auth-value-text">
          {`${notes.length} notes`}
        </text>
      {/if}
      <view testID="sqlite-crud-list">
        {#each notes as note (note.id)}
          <text class="info-text">{`#${note.id} · ${note.text}`}</text>
        {/each}
      </view>
    </view>

    <view testID="sqlite-transaction-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Transaction</text>
      </view>
      <view class="button-row">
        <ActionButton
          testID="sqlite-transaction-commit"
          title="Commit two writes"
          onPress={handleCommitTransaction}
          color={lineColor}
        />
        <ActionButton
          testID="sqlite-transaction-rollback"
          title="Trigger rollback"
          onPress={handleRollbackTransaction}
          color={lineColor}
        />
      </view>
      {#if transactionRolledBack}
        <text testID="sqlite-transaction-result" class="auth-value-text">
          rolled back
        </text>
      {:else if transactionError}
        <text testID="sqlite-transaction-result" class="auth-result-text">
          {transactionError}
        </text>
      {:else if transactionDone}
        <text testID="sqlite-transaction-result" class="auth-value-text">
          committed
        </text>
      {:else}
        <text testID="sqlite-transaction-result" class="info-text">not run yet</text>
      {/if}
    </view>

    <view testID="sqlite-session-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Session (changesets)</text>
      </view>
      <view class="button-row">
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
      <text testID="sqlite-session-result" class="auth-value-text">
        {sessionStatus}
      </text>
      <view class="button-row">
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
      <text testID="sqlite-session-changeset-result" class="auth-value-text">
        {changesetStatus}
      </text>
    </view>

    <view testID="sqlite-kv-store-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Key/value store (AsyncStorage)</text>
      </view>
      <ActionButton
        testID="sqlite-kv-round-trip"
        title="Set + read demo-key"
        onPress={handleKvRoundTrip}
        color={lineColor}
      />
      {#if kvError}
        <text class="auth-result-text">{kvError}</text>
      {:else}
        <text testID="sqlite-kv-value" class="auth-value-text">
          {kvValue ?? 'not set yet'}
        </text>
      {/if}
    </view>

    {#if dbOpenError}
      <text testID="sqlite-open-error" class="auth-result-text">{dbOpenError}</text>
    {/if}
  </scroll-view>
</safe-area-view>
