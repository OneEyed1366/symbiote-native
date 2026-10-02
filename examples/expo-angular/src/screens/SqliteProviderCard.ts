import { Component, input, model } from '@angular/core';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import type { IProviderForm } from './sqlite-provider-form';

@Component({
  selector: 'SqliteProviderCard',
  standalone: true,
  imports: [Card, Field, ToggleRow],
  template: `
    <Card
      testID="sqlite-provider-card"
      title="SQLiteProvider props and open options"
    >
      <Field
        testID="sqlite-name-input"
        label="databaseName"
        [value]="form().databaseName"
        (valueChange)="patch({ databaseName: $event })"
      />
      <Field
        testID="sqlite-directory-input"
        label="directory (empty = defaultDatabaseDirectory)"
        [value]="form().directory"
        (valueChange)="patch({ directory: $event })"
      />
      <ToggleRow
        testID="sqlite-suspense-switch"
        label="useSuspense"
        [value]="form().isSuspense"
        (valueChange)="patch({ isSuspense: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="sqlite-listener-switch"
        label="enableChangeListener"
        [value]="form().enableChangeListener"
        (valueChange)="patch({ enableChangeListener: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="sqlite-new-connection-switch"
        label="useNewConnection"
        [value]="form().useNewConnection"
        (valueChange)="patch({ useNewConnection: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="sqlite-finalize-switch"
        label="finalizeUnusedStatementsBeforeClosing"
        [value]="form().finalizeUnused"
        (valueChange)="patch({ finalizeUnused: $event })"
        [color]="color()"
      />
      <Field
        testID="sqlite-libsql-url-input"
        label="libSQLOptions.url"
        [value]="form().libSqlUrl"
        (valueChange)="patch({ libSqlUrl: $event })"
      />
      <Field
        testID="sqlite-libsql-token-input"
        label="libSQLOptions.authToken"
        [value]="form().libSqlToken"
        (valueChange)="patch({ libSqlToken: $event })"
      />
      <ToggleRow
        testID="sqlite-libsql-remote-switch"
        label="libSQLOptions.remoteOnly"
        [value]="form().isLibSqlRemoteOnly"
        (valueChange)="patch({ isLibSqlRemoteOnly: $event })"
        [color]="color()"
      />
    </Card>
  `,
})
export class SqliteProviderCard {
  readonly form = model.required<IProviderForm>();
  readonly color = input.required<string>();

  patch(change: Partial<IProviderForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
