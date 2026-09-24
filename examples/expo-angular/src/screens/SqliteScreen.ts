import { Component, inject, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  SqliteService,
  provideSqliteDatabase,
} from '@symbiote-native/sqlite/angular';
import type {
  IChangeset,
  SQLiteDatabase,
  SQLiteSession,
} from '@symbiote-native/sqlite/angular';
import { AsyncStorage } from '@symbiote-native/sqlite/kv-store';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type INoteRow = { id: number; text: string };

const DATABASE_NAME = 'canary-demo.db';
const KV_STORE_KEY = 'demo-key';
const KV_STORE_VALUE = 'demo-value';

async function createNotesTable(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT)',
  );
}

/**
 * @symbiote-native/sqlite canary demo: SqliteService injected off this screen's OWN `providers`
 * (Angular's DI twin of the other adapters' <SQLiteProvider> — see the package README's Angular
 * section), so the database opens/closes with this screen's lifecycle rather than app-wide. Covers
 * the notes CRUD round-trip, `withTransactionAsync` commit/rollback, and the SQLite-backed
 * `AsyncStorage` key-value store from its own `/kv-store` subpath.
 */
@Component({
  selector: 'SqliteScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  providers: [
    SqliteService,
    provideSqliteDatabase({
      databaseName: DATABASE_NAME,
      options: { onInit: createNotesTable },
    }),
  ],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="sqlite-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">SQLite</text>
            <text testID="sqlite-hero" class="hero-body">
              @symbiote-native/sqlite — Database/Statement/Session, the SQL
              tagged-template helper, transactions, and the SQLite-backed
              key-value store.
            </text>
          </view>
        </view>

        <view testID="sqlite-open-card" class="capability-card">
          <text class="capability-card-title">Database</text>
          <text testID="sqlite-open-status" class="value-text">{{
            openStatusLabel()
          }}</text>
        </view>

        <view testID="sqlite-crud-card" class="capability-card">
          <text class="capability-card-title">Notes (CRUD)</text>
          <view class="button-row">
            <ActionButton
              testID="sqlite-crud-insert"
              title="Insert note"
              (press)="insertNote()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="sqlite-crud-refresh"
              title="Read all"
              (press)="refreshNotesFromDb()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="sqlite-crud-notes" class="value-text">{{
            notesLabel()
          }}</text>
        </view>

        <view testID="sqlite-transaction-card" class="capability-card">
          <text class="capability-card-title">Transaction</text>
          <view class="button-row">
            <ActionButton
              testID="sqlite-transaction-commit"
              title="Commit 2 writes"
              (press)="runTransaction()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="sqlite-transaction-rollback"
              title="Throw + rollback"
              (press)="runFailingTransaction()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="sqlite-transaction-status" class="value-text">{{
            transactionStatusLabel()
          }}</text>
        </view>

        <view testID="sqlite-session-card" class="capability-card">
          <text class="capability-card-title">Session (changesets)</text>
          <view class="button-row">
            <ActionButton
              testID="sqlite-session-start"
              title="Start session"
              (press)="startSession()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="sqlite-session-close"
              title="Close session"
              (press)="closeSession()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="sqlite-session-result" class="value-text">{{
            sessionStatusLabel()
          }}</text>
          <view class="button-row">
            <ActionButton
              testID="sqlite-session-capture-changeset"
              title="Insert + capture changeset"
              (press)="captureChangeset()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="sqlite-session-invert-changeset"
              title="Invert last changeset"
              (press)="invertChangeset()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="sqlite-session-changeset-result" class="value-text">{{
            changesetStatusLabel()
          }}</text>
        </view>

        <view testID="sqlite-kv-store-card" class="capability-card">
          <text class="capability-card-title">Key-value store</text>
          <view class="button-row">
            <ActionButton
              testID="sqlite-kv-store-set"
              title="Set demo-key"
              (press)="setKvValue()"
              [color]="lineColor"
            ></ActionButton>
            <ActionButton
              testID="sqlite-kv-store-get"
              title="Get demo-key"
              (press)="getKvValue()"
              [color]="lineColor"
            ></ActionButton>
          </view>
          <text testID="sqlite-kv-store-value" class="value-text">{{
            kvValueLabel()
          }}</text>
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class SqliteScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sqlite];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  private readonly sqlite = inject(SqliteService);

  // --- open ---
  openStatusLabel(): string {
    const error = this.sqlite.error();
    if (error) return `error: ${errorMessage(error)}`;
    if (this.sqlite.isLoading()) return 'loading';
    return this.sqlite.database() ? 'database ready' : 'not started yet';
  }

  private readyDatabase(): SQLiteDatabase | null {
    if (this.sqlite.error()) return null;
    return this.sqlite.database() ?? null;
  }

  // --- crud ---
  private readonly notes = signal<INoteRow[]>([]);
  private readonly crudError = signal<string | null>(null);
  private noteSeq = 0;

  async insertNote(): Promise<void> {
    const db = this.readyDatabase();
    if (!db) {
      this.crudError.set('database not ready');
      return;
    }
    this.noteSeq += 1;
    try {
      await db.runAsync(
        'INSERT INTO notes (text) VALUES (?)',
        `Note ${this.noteSeq}`,
      );
      await this.refreshNotes(db);
    } catch (error) {
      this.crudError.set(errorMessage(error));
    }
  }

  async refreshNotesFromDb(): Promise<void> {
    const db = this.readyDatabase();
    if (!db) {
      this.crudError.set('database not ready');
      return;
    }
    await this.refreshNotes(db);
  }

  private async refreshNotes(db: SQLiteDatabase): Promise<void> {
    try {
      this.notes.set(await db.getAllAsync<INoteRow>('SELECT * FROM notes'));
      this.crudError.set(null);
    } catch (error) {
      this.crudError.set(errorMessage(error));
    }
  }

  notesLabel(): string {
    const error = this.crudError();
    if (error) return error;
    const rows = this.notes();
    if (!rows.length) return 'no rows yet';
    return rows.map(row => `#${row.id} ${row.text}`).join(', ');
  }

  // --- transaction ---
  private readonly transactionStatus = signal<string | null>(null);

  async runTransaction(): Promise<void> {
    const db = this.readyDatabase();
    if (!db) {
      this.transactionStatus.set('database not ready');
      return;
    }
    try {
      await db.withTransactionAsync(async () => {
        this.noteSeq += 1;
        await db.runAsync(
          'INSERT INTO notes (text) VALUES (?)',
          `Tx note ${this.noteSeq}`,
        );
        this.noteSeq += 1;
        await db.runAsync(
          'INSERT INTO notes (text) VALUES (?)',
          `Tx note ${this.noteSeq}`,
        );
      });
      this.transactionStatus.set('committed 2 rows');
      await this.refreshNotes(db);
    } catch (error) {
      this.transactionStatus.set(errorMessage(error));
    }
  }

  async runFailingTransaction(): Promise<void> {
    const db = this.readyDatabase();
    if (!db) {
      this.transactionStatus.set('database not ready');
      return;
    }
    try {
      await db.withTransactionAsync(async () => {
        this.noteSeq += 1;
        await db.runAsync(
          'INSERT INTO notes (text) VALUES (?)',
          `Tx note ${this.noteSeq} doomed`,
        );
        throw new Error('deliberate failure to trigger rollback');
      });
    } catch {
      this.transactionStatus.set('rolled back');
      await this.refreshNotes(db);
    }
  }

  transactionStatusLabel(): string {
    return this.transactionStatus() ?? 'not run yet';
  }

  // --- session / changesets ---
  private session: SQLiteSession | null = null;
  private lastChangeset: IChangeset | null = null;
  private readonly sessionStatus = signal<string | null>(null);
  private readonly changesetStatus = signal<string | null>(null);

  async startSession(): Promise<void> {
    const db = this.readyDatabase();
    if (!db) {
      this.sessionStatus.set('database not ready');
      return;
    }
    try {
      this.session = await db.createSessionAsync();
      await this.session.attachAsync(null);
      await this.session.enableAsync(true);
      this.sessionStatus.set('session started, attached to all tables');
    } catch (error) {
      this.sessionStatus.set(errorMessage(error));
    }
  }

  async captureChangeset(): Promise<void> {
    const db = this.readyDatabase();
    if (!db || !this.session) {
      this.changesetStatus.set('start a session first');
      return;
    }
    try {
      this.noteSeq += 1;
      await db.runAsync(
        'INSERT INTO notes (text) VALUES (?)',
        `Session note ${this.noteSeq}`,
      );
      this.lastChangeset = await this.session.createChangesetAsync();
      this.changesetStatus.set(
        `captured ${this.lastChangeset.byteLength} bytes`,
      );
    } catch (error) {
      this.changesetStatus.set(errorMessage(error));
    }
  }

  async invertChangeset(): Promise<void> {
    if (!this.session || !this.lastChangeset) {
      this.changesetStatus.set('capture a changeset first');
      return;
    }
    try {
      const inverted = await this.session.invertChangesetAsync(
        this.lastChangeset,
      );
      this.changesetStatus.set(`inverted ${inverted.byteLength} bytes`);
    } catch (error) {
      this.changesetStatus.set(errorMessage(error));
    }
  }

  async closeSession(): Promise<void> {
    if (!this.session) {
      this.sessionStatus.set('no open session');
      return;
    }
    try {
      await this.session.closeAsync();
      this.session = null;
      this.sessionStatus.set('session closed');
    } catch (error) {
      this.sessionStatus.set(errorMessage(error));
    }
  }

  sessionStatusLabel(): string {
    return this.sessionStatus() ?? 'not started yet';
  }

  changesetStatusLabel(): string {
    return this.changesetStatus() ?? 'not captured yet';
  }

  // --- kv store ---
  private readonly kvValue = signal<string | null>(null);
  private readonly kvError = signal<string | null>(null);

  async setKvValue(): Promise<void> {
    try {
      await AsyncStorage.setItem(KV_STORE_KEY, KV_STORE_VALUE);
      this.kvError.set(null);
    } catch (error) {
      this.kvError.set(errorMessage(error));
    }
  }

  async getKvValue(): Promise<void> {
    try {
      this.kvValue.set(await AsyncStorage.getItem(KV_STORE_KEY));
      this.kvError.set(null);
    } catch (error) {
      this.kvError.set(errorMessage(error));
    }
  }

  kvValueLabel(): string {
    const error = this.kvError();
    if (error) return error;
    return this.kvValue() ?? 'not read yet';
  }
}
