import { Component, signal } from '@angular/core';
import type {
  IChangeset,
  SQLiteSession,
  SQLiteStatement,
} from '@symbiote-native/sqlite/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { injectSqliteDatabase } from './sqlite-database';
import { CREATE_NOTES_TABLE } from './sqlite-provider-form';

const INSERT = 'INSERT INTO notes (text) VALUES (?)';
const SELECT_ALL = 'SELECT * FROM notes ORDER BY id';
const SELECT_LIKE = 'SELECT * FROM notes WHERE text LIKE ?';
const NO_EXTENSION = '/nonexistent/extension';
const ANY_TEXT = ['%'];

function need<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`${label} first`);
  }
  return value;
}

@Component({
  selector: 'SqliteDatabaseCards',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="sqlite-input-card" title="Note text for the calls below">
      <Field testID="sqlite-text-input" label="text" [(value)]="text" />
    </Card>
    <CallConsole
      prefix="sqlite-async"
      title="Database, async"
      [color]="color"
      [calls]="asyncCalls"
    />
    <CallConsole
      prefix="sqlite-statement-async"
      title="Prepared statement, async"
      [color]="color"
      [calls]="statementAsyncCalls"
    />
    <CallConsole
      prefix="sqlite-sync"
      title="Database, sync"
      [color]="color"
      hint="Sync calls block the JS thread for the duration of the query."
      [calls]="syncCalls"
    />
    <CallConsole
      prefix="sqlite-statement-sync"
      title="Prepared statement, sync"
      [color]="color"
      [calls]="statementSyncCalls"
    />
    <CallConsole
      prefix="sqlite-tagged"
      title="sql tagged template"
      [color]="color"
      [calls]="taggedCalls"
    />
    <CallConsole
      prefix="sqlite-session"
      title="Session and changesets"
      [color]="color"
      [calls]="sessionCalls"
    />
  `,
})
export class SqliteDatabaseCards {
  readonly color = lineColorOf(ROUTE_NAME.Sqlite);
  private readonly db = injectSqliteDatabase();

  readonly text = signal('canary note');
  private statement: SQLiteStatement | null = null;
  private syncStatement: SQLiteStatement | null = null;
  private session: SQLiteSession | null = null;
  private changeset: IChangeset | null = null;

  private stmt(): SQLiteStatement {
    return need(this.statement, 'prepare a statement');
  }

  private syncStmt(): SQLiteStatement {
    return need(this.syncStatement, 'prepare a statement');
  }

  private live(): SQLiteSession {
    return need(this.session, 'create a session');
  }

  private captured(): IChangeset {
    return need(this.changeset, 'capture a changeset');
  }

  readonly asyncCalls = [
    {
      label: 'execAsync (create table)',
      run: () => this.db().execAsync(CREATE_NOTES_TABLE),
    },
    { label: 'runAsync', run: () => this.db().runAsync(INSERT, this.text()) },
    { label: 'getFirstAsync', run: () => this.db().getFirstAsync(SELECT_ALL) },
    { label: 'getAllAsync', run: () => this.db().getAllAsync(SELECT_ALL) },
    {
      label: 'getEachAsync',
      run: async () => {
        const rows: unknown[] = [];
        for await (const row of this.db().getEachAsync(SELECT_ALL)) {
          rows.push(row);
        }
        return rows;
      },
    },
    {
      label: 'isInTransactionAsync',
      run: () => this.db().isInTransactionAsync(),
    },
    {
      label: 'withTransactionAsync (commit)',
      run: () =>
        this.db().withTransactionAsync(async () => {
          await this.db().runAsync(INSERT, 'transaction A');
          await this.db().runAsync(INSERT, 'transaction B');
        }),
    },
    {
      label: 'withTransactionAsync (rollback)',
      run: async () => {
        try {
          await this.db().withTransactionAsync(async () => {
            await this.db().runAsync(INSERT, 'must not persist');
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
        this.db().withExclusiveTransactionAsync(async tx => {
          await tx.runAsync(INSERT, 'exclusive');
        }),
    },
    {
      label: 'serializeAsync',
      run: async () => (await this.db().serializeAsync()).byteLength,
    },
    {
      label: 'loadExtensionAsync',
      run: () => this.db().loadExtensionAsync(NO_EXTENSION),
    },
    { label: 'syncLibSQL', run: () => this.db().syncLibSQL() },
  ];

  readonly statementAsyncCalls = [
    {
      label: 'prepareAsync',
      run: async () => {
        this.statement = await this.db().prepareAsync(SELECT_LIKE);
        return 'prepared';
      },
    },
    {
      label: 'executeAsync',
      run: async () => {
        const result = await this.stmt().executeAsync<{ id: number }>(ANY_TEXT);
        return {
          first: await result.getFirstAsync(),
          all: (await result.getAllAsync()).length,
        };
      },
    },
    {
      label: 'executeForRawResultAsync',
      run: async () =>
        (await this.stmt().executeForRawResultAsync(ANY_TEXT)).getAllAsync(),
    },
    {
      label: 'resetAsync',
      run: async () => (await this.stmt().executeAsync(ANY_TEXT)).resetAsync(),
    },
    {
      label: 'getColumnNamesAsync',
      run: () => this.stmt().getColumnNamesAsync(),
    },
    { label: 'finalizeAsync', run: () => this.stmt().finalizeAsync() },
    {
      label: 'run result (lastInsertRowId, changes)',
      run: async () => {
        const insert = await this.db().prepareAsync(INSERT);
        try {
          const result = await insert.executeAsync([this.text()]);
          return {
            lastInsertRowId: result.lastInsertRowId,
            changes: result.changes,
          };
        } finally {
          await insert.finalizeAsync();
        }
      },
    },
  ];

  readonly syncCalls = [
    {
      label: 'execSync',
      run: async () => this.db().execSync(CREATE_NOTES_TABLE),
    },
    {
      label: 'runSync',
      run: async () => this.db().runSync(INSERT, this.text()),
    },
    {
      label: 'getFirstSync',
      run: async () => this.db().getFirstSync(SELECT_ALL),
    },
    { label: 'getAllSync', run: async () => this.db().getAllSync(SELECT_ALL) },
    {
      label: 'getEachSync',
      run: async () => Array.from(this.db().getEachSync(SELECT_ALL)),
    },
    {
      label: 'isInTransactionSync',
      run: async () => this.db().isInTransactionSync(),
    },
    {
      label: 'withTransactionSync',
      run: async () =>
        this.db().withTransactionSync(() => {
          this.db().runSync(INSERT, 'sync transaction');
        }),
    },
    {
      label: 'serializeSync',
      run: async () => this.db().serializeSync().byteLength,
    },
    {
      label: 'loadExtensionSync',
      run: async () => this.db().loadExtensionSync(NO_EXTENSION),
    },
  ];

  readonly statementSyncCalls = [
    {
      label: 'prepareSync',
      run: async () => {
        this.syncStatement = this.db().prepareSync(SELECT_LIKE);
        return 'prepared';
      },
    },
    {
      label: 'executeSync',
      run: async () => {
        const result = this.syncStmt().executeSync(ANY_TEXT);
        return {
          first: result.getFirstSync(),
          all: result.getAllSync().length,
        };
      },
    },
    {
      label: 'resetSync',
      run: async () => this.syncStmt().executeSync(ANY_TEXT).resetSync(),
    },
    {
      label: 'getColumnNamesSync',
      run: async () => this.syncStmt().getColumnNamesSync(),
    },
    { label: 'finalizeSync', run: async () => this.syncStmt().finalizeSync() },
  ];

  readonly taggedCalls = [
    {
      label: 'sql (await)',
      run: async () =>
        this.db()
          .sql`SELECT * FROM notes WHERE text LIKE ${`%${this.text()}%`}`,
    },
    {
      label: 'sql values',
      run: () => this.db().sql`SELECT id, text FROM notes`.values(),
    },
    {
      label: 'sql first',
      run: () => this.db().sql`SELECT * FROM notes ORDER BY id DESC`.first(),
    },
    {
      label: 'sql each',
      run: async () => {
        const rows: unknown[] = [];
        for await (const row of this.db().sql`SELECT * FROM notes`.each()) {
          rows.push(row);
        }
        return rows;
      },
    },
    {
      label: 'sql allSync',
      run: async () => this.db().sql`SELECT * FROM notes`.allSync(),
    },
    {
      label: 'sql valuesSync',
      run: async () => this.db().sql`SELECT id, text FROM notes`.valuesSync(),
    },
    {
      label: 'sql firstSync',
      run: async () => this.db().sql`SELECT * FROM notes`.firstSync(),
    },
    {
      label: 'sql eachSync',
      run: async () =>
        Array.from(this.db().sql`SELECT * FROM notes`.eachSync()),
    },
  ];

  readonly sessionCalls = [
    {
      label: 'createSessionAsync',
      run: async () => {
        this.session = await this.db().createSessionAsync();
        return 'session created';
      },
    },
    {
      label: 'createSessionSync',
      run: async () => {
        this.session = this.db().createSessionSync();
        return 'session created';
      },
    },
    { label: 'attachAsync', run: () => this.live().attachAsync(null) },
    { label: 'enableAsync', run: () => this.live().enableAsync(true) },
    { label: 'attachSync', run: async () => this.live().attachSync(null) },
    { label: 'enableSync', run: async () => this.live().enableSync(true) },
    {
      label: 'insert a row',
      run: () => this.db().runAsync(INSERT, 'session note'),
    },
    {
      label: 'createChangesetAsync',
      run: async () => {
        this.changeset = await this.live().createChangesetAsync();
        return this.changeset.byteLength;
      },
    },
    {
      label: 'createChangesetSync',
      run: async () => {
        this.changeset = this.live().createChangesetSync();
        return this.changeset.byteLength;
      },
    },
    {
      label: 'createInvertedChangesetAsync',
      run: async () =>
        (await this.live().createInvertedChangesetAsync()).byteLength,
    },
    {
      label: 'createInvertedChangesetSync',
      run: async () => this.live().createInvertedChangesetSync().byteLength,
    },
    {
      label: 'invertChangesetAsync',
      run: async () =>
        (await this.live().invertChangesetAsync(this.captured())).byteLength,
    },
    {
      label: 'invertChangesetSync',
      run: async () =>
        this.live().invertChangesetSync(this.captured()).byteLength,
    },
    {
      label: 'applyChangesetAsync',
      run: () => this.live().applyChangesetAsync(this.captured()),
    },
    {
      label: 'applyChangesetSync',
      run: async () => this.live().applyChangesetSync(this.captured()),
    },
    {
      label: 'closeAsync (session)',
      run: async () => {
        await this.live().closeAsync();
        this.session = null;
        return 'closed';
      },
    },
  ];
}
