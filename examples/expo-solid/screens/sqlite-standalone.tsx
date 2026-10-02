import { createSignal } from 'solid-js';
import {
  SQLiteDatabase,
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
import type { ISQLiteOpenOptions } from '@symbiote-native/sqlite';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sqlite);
const MAX_LOGGED_EVENTS = 6;
const BUNDLED_MODULE = require('../assets/canary-seed.db');

export type IProviderForm = {
  databaseName: string;
  directory: string;
  isSuspense: boolean;
  enableChangeListener: boolean;
  useNewConnection: boolean;
  finalizeUnused: boolean;
  libSqlUrl: string;
  libSqlToken: string;
  isLibSqlRemoteOnly: boolean;
};
export type ISetProvider = (patch: Partial<IProviderForm>) => void;

export const INITIAL_PROVIDER: IProviderForm = {
  databaseName: 'canary-demo.db',
  directory: '',
  isSuspense: false,
  enableChangeListener: true,
  useNewConnection: false,
  finalizeUnused: true,
  libSqlUrl: '',
  libSqlToken: '',
  isLibSqlRemoteOnly: false,
};

export function toOpenOptions(form: IProviderForm): ISQLiteOpenOptions {
  return {
    enableChangeListener: form.enableChangeListener,
    useNewConnection: form.useNewConnection,
    finalizeUnusedStatementsBeforeClosing: form.finalizeUnused,
    libSQLOptions:
      form.libSqlUrl === ''
        ? undefined
        : { url: form.libSqlUrl, authToken: form.libSqlToken, remoteOnly: form.isLibSqlRemoteOnly },
  };
}

export function ProviderCard(props: { form: IProviderForm; setForm: ISetProvider }) {
  return (
    <Card testID="sqlite-provider-card" title="SQLiteProvider props and open options">
      <Field testID="sqlite-name-input" label="databaseName" value={props.form.databaseName} onChange={databaseName => props.setForm({ databaseName })} />
      <Field testID="sqlite-directory-input" label="directory (empty = defaultDatabaseDirectory)" value={props.form.directory} onChange={directory => props.setForm({ directory })} />
      <ToggleRow testID="sqlite-suspense-switch" label="useSuspense" value={props.form.isSuspense} onChange={isSuspense => props.setForm({ isSuspense })} color={color} />
      <ToggleRow testID="sqlite-listener-switch" label="enableChangeListener" value={props.form.enableChangeListener} onChange={enableChangeListener => props.setForm({ enableChangeListener })} color={color} />
      <ToggleRow testID="sqlite-new-connection-switch" label="useNewConnection" value={props.form.useNewConnection} onChange={useNewConnection => props.setForm({ useNewConnection })} color={color} />
      <ToggleRow testID="sqlite-finalize-switch" label="finalizeUnusedStatementsBeforeClosing" value={props.form.finalizeUnused} onChange={finalizeUnused => props.setForm({ finalizeUnused })} color={color} />
      <Field testID="sqlite-libsql-url-input" label="libSQLOptions.url" value={props.form.libSqlUrl} onChange={libSqlUrl => props.setForm({ libSqlUrl })} />
      <Field testID="sqlite-libsql-token-input" label="libSQLOptions.authToken" value={props.form.libSqlToken} onChange={libSqlToken => props.setForm({ libSqlToken })} />
      <ToggleRow testID="sqlite-libsql-remote-switch" label="libSQLOptions.remoteOnly" value={props.form.isLibSqlRemoteOnly} onChange={isLibSqlRemoteOnly => props.setForm({ isLibSqlRemoteOnly })} color={color} />
    </Card>
  );
}

function need(database: SQLiteDatabase | null): SQLiteDatabase {
  if (database === null) {
    throw new Error('open a standalone database first');
  }
  return database;
}

function needBytes(bytes: Uint8Array | null): Uint8Array {
  if (bytes === null) {
    throw new Error('run "serialize for deserialize" first');
  }
  return bytes;
}

export function StandaloneCards(props: { form: IProviderForm }) {
  let standalone: SQLiteDatabase | null = null;
  let backup: SQLiteDatabase | null = null;
  let serialized: Uint8Array | null = null;
  const directory = () => (props.form.directory === '' ? undefined : props.form.directory);
  const name = () => `standalone-${props.form.databaseName}`;
  return (
    <>
      <CallConsole
        prefix="sqlite-module"
        title="Module functions"
        color={color}
        calls={[
          { label: 'defaultDatabaseDirectory and bundledExtensions', run: async () => ({ defaultDatabaseDirectory, bundledExtensions }) },
          {
            label: 'openDatabaseAsync',
            run: async () => {
              standalone = await openDatabaseAsync(name(), toOpenOptions(props.form), directory());
              return standalone.databasePath;
            },
          },
          {
            label: 'openDatabaseSync',
            run: async () => {
              standalone = openDatabaseSync(name(), toOpenOptions(props.form), directory());
              return standalone.databasePath;
            },
          },
          { label: 'closeAsync (standalone)', run: async () => { await need(standalone).closeAsync(); standalone = null; return 'closed'; } },
          { label: 'closeSync (standalone)', run: async () => { need(standalone).closeSync(); standalone = null; return 'closed'; } },
          { label: 'serialize for deserialize', run: async () => { serialized = await need(standalone).serializeAsync(); return serialized.byteLength; } },
          {
            label: 'deserializeDatabaseAsync',
            run: async () => (await deserializeDatabaseAsync(needBytes(serialized))).databasePath,
          },
          { label: 'deserializeDatabaseSync', run: async () => deserializeDatabaseSync(needBytes(serialized)).databasePath },
          { label: 'deleteDatabaseAsync', run: () => deleteDatabaseAsync(name(), directory()) },
          { label: 'deleteDatabaseSync', run: async () => deleteDatabaseSync(name(), directory()) },
          { label: 'importDatabaseFromAssetAsync', run: () => importDatabaseFromAssetAsync(`imported-${props.form.databaseName}`, { assetId: BUNDLED_MODULE, forceOverwrite: true }, directory()) },
        ]}
      />
      <CallConsole
        prefix="sqlite-backup"
        title="Backup"
        color={color}
        hint="Backs the standalone database up into a second in-memory database."
        calls={[
          {
            label: 'backupDatabaseAsync',
            run: async () => {
              backup = await openDatabaseAsync(':memory:');
              await backupDatabaseAsync({ sourceDatabase: need(standalone), destDatabase: backup });
              return 'backed up';
            },
          },
          {
            label: 'backupDatabaseSync',
            run: async () => {
              backup = openDatabaseSync(':memory:');
              backupDatabaseSync({ sourceDatabase: need(standalone), destDatabase: backup });
              return 'backed up';
            },
          },
        ]}
      />
      <HelperCalls />
      <ChangeListenerCard />
    </>
  );
}

function HelperCalls() {
  const [query, setQuery] = createSignal('INSERT INTO notes (text) VALUES (1) RETURNING id');
  return (
    <>
      <Card testID="sqlite-helpers-card" title="Helper inputs">
        <Field testID="sqlite-query-input" label="query for parseSQLQuery" value={query()} onChange={setQuery} />
      </Card>
      <CallConsole
        prefix="sqlite-helpers"
        title="Helpers"
        color={color}
        calls={[
          { label: 'parseSQLQuery', run: async () => parseSQLQuery(query()) },
          { label: 'createDatabasePath', run: async () => createDatabasePath('canary-demo.db') },
          { label: 'basename', run: async () => basename(createDatabasePath('canary-demo.db')) },
        ]}
      />
    </>
  );
}

function ChangeListenerCard() {
  const [isOn, setIsOn] = createSignal(false);
  const [lines, setLines] = createSignal<string[]>([]);
  let subscription: ReturnType<typeof addDatabaseChangeListener> | null = null;
  const toggle = (next: boolean) => {
    setIsOn(next);
    if (next) {
      subscription = addDatabaseChangeListener(event =>
        setLines(previous => [`${event.tableName} row ${event.rowId} in ${event.databaseName}`, ...previous].slice(0, MAX_LOGGED_EVENTS)),
      );
    } else {
      subscription?.remove();
    }
  };
  return (
    <Card testID="sqlite-change-card" title="addDatabaseChangeListener">
      <ToggleRow testID="sqlite-change-switch" label="listen (needs enableChangeListener)" value={isOn()} onChange={toggle} color={color} />
      <text testID="sqlite-change-log" class="info-text">
        {lines().length === 0 ? 'no changes yet, insert a note' : lines().join('\n')}
      </text>
    </Card>
  );
}
