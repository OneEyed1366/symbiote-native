import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { injectSqliteDatabase } from './sqlite-database';

type INote = { id: number; text: string };

@Component({
  selector: 'SqliteNotes',
  standalone: true,
  imports: [ActionButton, Field, ResultRow, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <Scenario
      testID="sqlite-notes-scenario"
      title="Keep a notes list that survives restarts"
      why="Store structured data on the device with real SQL: queries, transactions and indexes. The table is created once by the provider, and the rows stay after the app is closed."
      [steps]="steps"
      expect="The notes you added are still listed after the relaunch, newest first. Clear all empties the table."
    >
      <Field testID="sqlite-note-input" label="note" [(value)]="text" />
      <ActionButton
        testID="sqlite-add-note"
        title="Add note"
        [color]="color"
        (press)="run(addNote)"
      />
      <ActionButton
        testID="sqlite-show-notes"
        title="Show notes"
        [color]="color"
        (press)="run(refresh)"
      />
      <ActionButton
        testID="sqlite-clear-notes"
        title="Clear all"
        [color]="color"
        (press)="run(clearNotes)"
      />
      <ResultRow
        testID="sqlite-notes-status"
        label="Status"
        [value]="status()"
      />
      @for (note of notes(); track note.id) {
        <text class="info-text">#{{ note.id }} {{ note.text }}</text>
      }
    </Scenario>
  `,
})
export class SqliteNotes {
  readonly color = lineColorOf(ROUTE_NAME.Sqlite);
  readonly steps = [
    'Type a note and press Add note',
    'Force-quit the app and open it again',
    'Press Show notes',
  ];

  private readonly db = injectSqliteDatabase();
  readonly text = signal('Buy milk');
  readonly notes = signal<INote[]>([]);
  readonly status = signal('idle');

  readonly refresh = async (): Promise<void> => {
    const rows = await this.db().getAllAsync<INote>(
      'SELECT id, text FROM notes ORDER BY id DESC',
    );
    this.notes.set(rows);
    this.status.set(`${rows.length} note(s)`);
  };

  readonly addNote = async (): Promise<void> => {
    await this.db().runAsync(
      'INSERT INTO notes (text) VALUES (?)',
      this.text(),
    );
    await this.refresh();
  };

  readonly clearNotes = async (): Promise<void> => {
    await this.db().runAsync('DELETE FROM notes');
    await this.refresh();
  };

  run(action: () => Promise<void>): void {
    action().catch((error: Error) =>
      this.status.set(`failed: ${error.message}`),
    );
  }
}
