<!--
  Descendant of <SQLiteProvider> (SqliteScreen.vue) — useSQLiteContext() may only be called
  inside one. Renders the ready badge (open card), the CRUD demo (insert + read all notes), and
  the transaction demo (two writes committed, one deliberately rolled back) — all three need the
  same open SQLiteDatabase handle, so they share this one context-reading component instead of
  each re-injecting it.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useSQLiteContext } from '@symbiote-native/sqlite/vue';
import type { IChangeset, SQLiteSession } from '@symbiote-native/sqlite/vue';
import ActionButton from './ActionButton.vue';

defineProps<{ lineColor: string }>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const db = useSQLiteContext();

type INote = { id: number; text: string };

// CRUD — insert a row, then read every row back.
const notesListText = ref('No notes yet.');
const crudError = ref<string | null>(null);
let noteCounter = 0;

function handleInsertAndList(): void {
  crudError.value = null;
  noteCounter += 1;
  void db
    .runAsync('INSERT INTO notes (text) VALUES (?)', `note #${noteCounter}`)
    .then(() => db.getAllAsync<INote>('SELECT * FROM notes'))
    .then(notes => {
      notesListText.value =
        notes.length === 0
          ? 'No notes yet.'
          : notes.map(note => `#${note.id}: ${note.text}`).join(', ');
    })
    .catch((error: Error) => {
      crudError.value = `insert/list failed: ${error.message}`;
    });
}

// Transaction — commit two writes, or deliberately throw mid-transaction to show rollback.
const transactionStatusText = ref('not run yet');
const transactionError = ref<string | null>(null);

function handleCommitTransaction(): void {
  transactionError.value = null;
  void db
    .withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'tx note A');
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'tx note B');
    })
    .then(() => {
      transactionStatusText.value = 'committed 2 rows';
    })
    .catch((error: Error) => {
      transactionError.value = `transaction failed: ${errorMessage(error)}`;
    });
}

function handleThrowMidTransaction(): void {
  transactionError.value = null;
  void db
    .withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO notes (text) VALUES (?)', 'should not persist');
      throw new Error('deliberate failure');
    })
    .then(() => {
      transactionStatusText.value = 'committed (unexpected)';
    })
    .catch(() => {
      transactionStatusText.value = 'rolled back';
    });
}

// Session / changesets
let session: SQLiteSession | null = null;
let lastChangeset: IChangeset | null = null;
const sessionStatusText = ref('not started yet');
const changesetStatusText = ref('not captured yet');

function handleStartSession(): void {
  void db
    .createSessionAsync()
    .then(created => {
      session = created;
      return created.attachAsync(null).then(() => created.enableAsync(true));
    })
    .then(() => {
      sessionStatusText.value = 'session started, attached to all tables';
    })
    .catch((error: Error) => {
      sessionStatusText.value = `start failed: ${errorMessage(error)}`;
    });
}

function handleCaptureChangeset(): void {
  if (!session) {
    changesetStatusText.value = 'start a session first';
    return;
  }
  void db
    .runAsync('INSERT INTO notes (text) VALUES (?)', `session note ${Date.now()}`)
    .then(() => session!.createChangesetAsync())
    .then(changeset => {
      lastChangeset = changeset;
      changesetStatusText.value = `captured ${changeset.byteLength} bytes`;
    })
    .catch((error: Error) => {
      changesetStatusText.value = `capture failed: ${errorMessage(error)}`;
    });
}

function handleInvertChangeset(): void {
  if (!session || !lastChangeset) {
    changesetStatusText.value = 'capture a changeset first';
    return;
  }
  void session
    .invertChangesetAsync(lastChangeset)
    .then(inverted => {
      changesetStatusText.value = `inverted ${inverted.byteLength} bytes`;
    })
    .catch((error: Error) => {
      changesetStatusText.value = `invert failed: ${errorMessage(error)}`;
    });
}

function handleCloseSession(): void {
  if (!session) {
    sessionStatusText.value = 'no open session';
    return;
  }
  void session
    .closeAsync()
    .then(() => {
      session = null;
      sessionStatusText.value = 'session closed';
    })
    .catch((error: Error) => {
      sessionStatusText.value = `close failed: ${errorMessage(error)}`;
    });
}
</script>

<template>
  <view testID="sqlite-open-card" class="auth-card">
    <view class="auth-card-header">
      <text class="auth-card-title">Open (SQLiteProvider)</text>
    </view>
    <text testID="sqlite-open-status" class="auth-value-text">database ready</text>
  </view>

  <view testID="sqlite-crud-card" class="auth-card">
    <view class="auth-card-header">
      <text class="auth-card-title">CRUD (insert / read all)</text>
    </view>
    <ActionButton
      testID="sqlite-crud-insert"
      title="Insert note"
      :onPress="handleInsertAndList"
      :color="lineColor"
    />
    <text testID="sqlite-crud-notes" class="info-text">{{ notesListText }}</text>
    <view v-if="crudError" class="auth-result auth-result-error">
      <text class="auth-result-text">{{ crudError }}</text>
    </view>
  </view>

  <view testID="sqlite-transaction-card" class="auth-card">
    <view class="auth-card-header">
      <text class="auth-card-title">Transaction (commit / rollback)</text>
    </view>
    <view class="button-row">
      <ActionButton
        testID="sqlite-transaction-commit"
        title="Commit 2 writes"
        :onPress="handleCommitTransaction"
        :color="lineColor"
      />
      <ActionButton
        testID="sqlite-transaction-rollback"
        title="Throw mid-transaction"
        :onPress="handleThrowMidTransaction"
        :color="lineColor"
      />
    </view>
    <text testID="sqlite-transaction-status" class="auth-value-text">{{
      transactionStatusText
    }}</text>
    <view v-if="transactionError" class="auth-result auth-result-error">
      <text class="auth-result-text">{{ transactionError }}</text>
    </view>
  </view>

  <view testID="sqlite-session-card" class="auth-card">
    <view class="auth-card-header">
      <text class="auth-card-title">Session (changesets)</text>
    </view>
    <view class="button-row">
      <ActionButton
        testID="sqlite-session-start"
        title="Start session"
        :onPress="handleStartSession"
        :color="lineColor"
      />
      <ActionButton
        testID="sqlite-session-close"
        title="Close session"
        :onPress="handleCloseSession"
        :color="lineColor"
      />
    </view>
    <text testID="sqlite-session-result" class="auth-value-text">{{
      sessionStatusText
    }}</text>
    <view class="button-row">
      <ActionButton
        testID="sqlite-session-capture-changeset"
        title="Insert + capture changeset"
        :onPress="handleCaptureChangeset"
        :color="lineColor"
      />
      <ActionButton
        testID="sqlite-session-invert-changeset"
        title="Invert last changeset"
        :onPress="handleInvertChangeset"
        :color="lineColor"
      />
    </view>
    <text testID="sqlite-session-changeset-result" class="auth-value-text">{{
      changesetStatusText
    }}</text>
  </view>
</template>
