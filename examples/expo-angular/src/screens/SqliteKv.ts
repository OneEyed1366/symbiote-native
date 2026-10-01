import { Component, computed, signal } from '@angular/core';
import {
  AsyncStorage,
  SQLiteStorage,
  Storage,
} from '@symbiote-native/sqlite/kv-store';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { aliasCalls, asyncCalls, syncCalls } from './sqlite-kv-calls';
import type { IKvForm } from './sqlite-kv-calls';

const CUSTOM_STORE_NAME = 'canary-custom-storage';

@Component({
  selector: 'SqliteKv',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="sqlite-kv-form-card" title="Key-value inputs">
      <Field
        testID="sqlite-kv-key-input"
        label="key"
        [value]="form().key"
        (valueChange)="patch({ key: $event })"
      />
      <Field
        testID="sqlite-kv-value-input"
        label="value (JSON object for mergeItem)"
        [value]="form().value"
        (valueChange)="patch({ value: $event })"
      />
      <Field
        testID="sqlite-kv-index-input"
        label="index for getKeyByIndex"
        [value]="form().index"
        (valueChange)="patch({ index: $event })"
      />
    </Card>
    <CallConsole
      prefix="sqlite-kv-async"
      title="AsyncStorage, async"
      [color]="color"
      [calls]="asyncList()"
    />
    <CallConsole
      prefix="sqlite-kv-sync"
      title="AsyncStorage, sync"
      [color]="color"
      [calls]="syncList()"
    />
    <CallConsole
      prefix="sqlite-kv-alias"
      title="AsyncStorage-style aliases"
      [color]="color"
      [calls]="aliasList()"
    />
    <CallConsole
      prefix="sqlite-kv-storage"
      title="Storage (same instance as AsyncStorage)"
      [color]="color"
      [calls]="storageCalls()"
    />
    <CallConsole
      prefix="sqlite-kv-custom"
      title="new SQLiteStorage(name)"
      [color]="color"
      [calls]="customCalls()"
    />
  `,
})
export class SqliteKv {
  readonly color = lineColorOf(ROUTE_NAME.Sqlite);
  private readonly custom = new SQLiteStorage(CUSTOM_STORE_NAME);

  readonly form = signal<IKvForm>({
    key: 'greeting',
    value: '{"hello":"world"}',
    index: '0',
  });

  readonly asyncList = computed(() => asyncCalls(AsyncStorage, this.form()));
  readonly syncList = computed(() => syncCalls(AsyncStorage, this.form()));
  readonly aliasList = computed(() => aliasCalls(AsyncStorage, this.form()));

  readonly storageCalls = computed(() => [
    {
      label: 'Storage is AsyncStorage',
      run: async () => Storage === AsyncStorage,
    },
    {
      label: 'Storage.getItemAsync',
      run: () => Storage.getItemAsync(this.form().key),
    },
  ]);

  readonly customCalls = computed(() => [
    ...asyncCalls(this.custom, this.form()).slice(0, 2),
    { label: 'closeAsync', run: () => this.custom.closeAsync() },
    { label: 'closeSync', run: async () => this.custom.closeSync() },
    { label: 'close', run: () => this.custom.close() },
  ]);

  patch(change: Partial<IKvForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }
}
