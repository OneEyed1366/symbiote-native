import type { ISQLiteOpenOptions } from '@symbiote-native/sqlite/angular';

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

export const CREATE_NOTES_TABLE =
  'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)';

export function toOpenOptions(form: IProviderForm): ISQLiteOpenOptions {
  return {
    enableChangeListener: form.enableChangeListener,
    useNewConnection: form.useNewConnection,
    finalizeUnusedStatementsBeforeClosing: form.finalizeUnused,
    libSQLOptions:
      form.libSqlUrl === ''
        ? undefined
        : {
            url: form.libSqlUrl,
            authToken: form.libSqlToken,
            remoteOnly: form.isLibSqlRemoteOnly,
          },
  };
}

export function toDirectory(form: IProviderForm): string | undefined {
  return form.directory === '' ? undefined : form.directory;
}
