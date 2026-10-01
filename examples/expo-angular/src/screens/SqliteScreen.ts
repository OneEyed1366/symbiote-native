import { Component, computed, effect, inject, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { SqliteService } from '@symbiote-native/sqlite/angular';
import type { SQLiteDatabase } from '@symbiote-native/sqlite/angular';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { SqliteDatabaseCards } from './SqliteDatabaseCards';
import { SqliteKv } from './SqliteKv';
import { SqliteNotes } from './SqliteNotes';
import { SqliteProviderCard } from './SqliteProviderCard';
import { SqliteStandaloneCards } from './SqliteStandaloneCards';
import {
  CREATE_NOTES_TABLE,
  INITIAL_PROVIDER,
  toDirectory,
  toOpenOptions,
} from './sqlite-provider-form';
import type { IProviderForm } from './sqlite-provider-form';

async function createNotesTable(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_NOTES_TABLE);
}

// The service is scoped to this screen, so the database opens and closes with it
@Component({
  selector: 'SqliteScreen',
  standalone: true,
  imports: [
    Explorer,
    ScreenShell,
    SqliteDatabaseCards,
    SqliteKv,
    SqliteNotes,
    SqliteProviderCard,
    SqliteStandaloneCards,
    SYMBIOTE_ELEMENTS,
  ],
  providers: [SqliteService],
  template: `
    <ScreenShell
      [route]="route"
      testID="sqlite-scroll"
      title="SQLite"
      body="Keep structured data on the device with a real SQL database: queries, transactions, prepared statements, change tracking and a simple key-value store on top."
    >
      @if (isReady()) {
        <SqliteNotes />
        <Explorer testID="sqlite-database-explorer" [color]="color">
          <ng-template><SqliteDatabaseCards /></ng-template>
        </Explorer>
      }
      <Explorer testID="sqlite-explorer" [color]="color">
        <ng-template>
          <SqliteProviderCard [(form)]="form" [color]="color" />
          <text testID="sqlite-provider-error" class="info-text"
            >onError: {{ providerError() }}</text
          >
          <SqliteStandaloneCards [form]="form()" />
          <SqliteKv />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class SqliteScreen {
  readonly route = ROUTE_NAME.Sqlite;
  readonly color = lineColorOf(ROUTE_NAME.Sqlite);

  private readonly sqlite = inject(SqliteService);
  readonly form = signal<IProviderForm>({ ...INITIAL_PROVIDER });
  readonly providerError = signal('none');

  // Reading `database()` re-throws an open failure, so the error is checked first
  readonly isReady = computed(
    () =>
      this.sqlite.error() === undefined && this.sqlite.database() !== undefined,
  );

  constructor() {
    effect(() => {
      const form = this.form();
      this.sqlite.open({
        databaseName: form.databaseName,
        directory: toDirectory(form),
        options: { ...toOpenOptions(form), onInit: createNotesTable },
        onError: error => this.providerError.set(error.message),
      });
    });
  }
}
