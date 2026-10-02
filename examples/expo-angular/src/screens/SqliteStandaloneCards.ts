import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  addDatabaseChangeListener,
  backupDatabaseAsync,
  backupDatabaseSync,
  basename,
  bundledExtensions,
  createDatabasePath,
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  deleteDatabaseSync,
  deserializeDatabaseAsync,
  deserializeDatabaseSync,
  importDatabaseFromAssetAsync,
  openDatabaseAsync,
  openDatabaseSync,
  parseSQLQuery,
} from '@symbiote-native/sqlite';
import type { SQLiteDatabase } from '@symbiote-native/sqlite';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { toDirectory, toOpenOptions } from './sqlite-provider-form';
import type { IProviderForm } from './sqlite-provider-form';

const MAX_LOGGED_EVENTS = 6;
const BUNDLED_MODULE = require('../../assets/canary-seed.db');
const DEMO_DATABASE = 'canary-demo.db';
const IN_MEMORY = ':memory:';

@Component({
  selector: 'SqliteStandaloneCards',
  standalone: true,
  imports: [CallConsole, Card, Field, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <CallConsole
      prefix="sqlite-module"
      title="Module functions"
      [color]="color"
      [calls]="moduleCalls"
    />
    <CallConsole
      prefix="sqlite-backup"
      title="Backup"
      [color]="color"
      hint="Backs the standalone database up into a second in-memory database."
      [calls]="backupCalls"
    />
    <Card testID="sqlite-helpers-card" title="Helper inputs">
      <Field
        testID="sqlite-query-input"
        label="query for parseSQLQuery"
        [(value)]="query"
      />
    </Card>
    <CallConsole
      prefix="sqlite-helpers"
      title="Helpers"
      [color]="color"
      [calls]="helperCalls"
    />
    <Card testID="sqlite-change-card" title="addDatabaseChangeListener">
      <ToggleRow
        testID="sqlite-change-switch"
        label="listen (needs enableChangeListener)"
        [value]="isListening()"
        (valueChange)="toggleListener($event)"
        [color]="color"
      />
      <text testID="sqlite-change-log" class="info-text">{{ logText() }}</text>
    </Card>
  `,
})
export class SqliteStandaloneCards {
  readonly form = input.required<IProviderForm>();

  readonly color = lineColorOf(ROUTE_NAME.Sqlite);

  private standalone: SQLiteDatabase | null = null;
  private backup: SQLiteDatabase | null = null;
  private serialized: Uint8Array | null = null;

  readonly query = signal('INSERT INTO notes (text) VALUES (1) RETURNING id');
  readonly isListening = signal(false);
  private readonly lines = signal<string[]>([]);
  private subscription: ReturnType<typeof addDatabaseChangeListener> | null =
    null;

  private readonly directory = computed(() => toDirectory(this.form()));
  private readonly name = computed(
    () => `standalone-${this.form().databaseName}`,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.remove();
      this.subscription = null;
    });
  }

  logText(): string {
    const lines = this.lines();
    return lines.length === 0
      ? 'no changes yet, insert a note'
      : lines.join('\n');
  }

  private needStandalone(): SQLiteDatabase {
    if (this.standalone === null) {
      throw new Error('open a standalone database first');
    }
    return this.standalone;
  }

  private needBytes(): Uint8Array {
    if (this.serialized === null) {
      throw new Error('run "serialize for deserialize" first');
    }
    return this.serialized;
  }

  toggleListener(next: boolean): void {
    this.isListening.set(next);
    if (next) {
      this.subscription = addDatabaseChangeListener(event => {
        this.lines.update(lines =>
          [
            `${event.tableName} row ${event.rowId} in ${event.databaseName}`,
            ...lines,
          ].slice(0, MAX_LOGGED_EVENTS),
        );
      });
    } else {
      this.subscription?.remove();
      this.subscription = null;
    }
  }

  readonly moduleCalls = [
    {
      label: 'defaultDatabaseDirectory and bundledExtensions',
      run: async () => ({ defaultDatabaseDirectory, bundledExtensions }),
    },
    {
      label: 'openDatabaseAsync',
      run: async () => {
        this.standalone = await openDatabaseAsync(
          this.name(),
          toOpenOptions(this.form()),
          this.directory(),
        );
        return this.standalone.databasePath;
      },
    },
    {
      label: 'openDatabaseSync',
      run: async () => {
        this.standalone = openDatabaseSync(
          this.name(),
          toOpenOptions(this.form()),
          this.directory(),
        );
        return this.standalone.databasePath;
      },
    },
    {
      label: 'closeAsync (standalone)',
      run: async () => {
        await this.needStandalone().closeAsync();
        this.standalone = null;
        return 'closed';
      },
    },
    {
      label: 'closeSync (standalone)',
      run: async () => {
        this.needStandalone().closeSync();
        this.standalone = null;
        return 'closed';
      },
    },
    {
      label: 'serialize for deserialize',
      run: async () => {
        this.serialized = await this.needStandalone().serializeAsync();
        return this.serialized.byteLength;
      },
    },
    {
      label: 'deserializeDatabaseAsync',
      run: async () =>
        (await deserializeDatabaseAsync(this.needBytes())).databasePath,
    },
    {
      label: 'deserializeDatabaseSync',
      run: async () => deserializeDatabaseSync(this.needBytes()).databasePath,
    },
    {
      label: 'deleteDatabaseAsync',
      run: () => deleteDatabaseAsync(this.name(), this.directory()),
    },
    {
      label: 'deleteDatabaseSync',
      run: async () => deleteDatabaseSync(this.name(), this.directory()),
    },
    {
      label: 'importDatabaseFromAssetAsync',
      run: () =>
        importDatabaseFromAssetAsync(
          `imported-${this.form().databaseName}`,
          { assetId: BUNDLED_MODULE, forceOverwrite: true },
          this.directory(),
        ),
    },
  ];

  readonly backupCalls = [
    {
      label: 'backupDatabaseAsync',
      run: async () => {
        this.backup = await openDatabaseAsync(IN_MEMORY);
        await backupDatabaseAsync({
          sourceDatabase: this.needStandalone(),
          destDatabase: this.backup,
        });
        return 'backed up';
      },
    },
    {
      label: 'backupDatabaseSync',
      run: async () => {
        this.backup = openDatabaseSync(IN_MEMORY);
        backupDatabaseSync({
          sourceDatabase: this.needStandalone(),
          destDatabase: this.backup,
        });
        return 'backed up';
      },
    },
  ];

  readonly helperCalls = [
    { label: 'parseSQLQuery', run: async () => parseSQLQuery(this.query()) },
    {
      label: 'createDatabasePath',
      run: async () => createDatabasePath(DEMO_DATABASE),
    },
    {
      label: 'basename',
      run: async () => basename(createDatabasePath(DEMO_DATABASE)),
    },
  ];
}
