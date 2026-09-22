// Ported from expo-sqlite's NativeDatabase.ts (.vendors/expo @ origin/sdk-57,
// packages/expo-sqlite/src/NativeDatabase.ts), renamed with this repo's `I`-prefix convention.
//
// `NativeDatabase` is a PLAIN native class, not a `SharedObject` — expo-sqlite instantiates it
// directly (`new ExpoSQLite.NativeDatabase(path, options)`), unlike expo-audio's JSI-backed
// shared objects. See the package README for why that makes this port simpler than
// `@symbiote-native/audio`'s.
import type { NativeSession } from './native-session';
import type { NativeStatement } from './native-statement';

/** An instance of the native SQLite database handle. */
export declare class NativeDatabase {
  constructor(
    databasePath: string,
    options?: ISQLiteOpenOptions,
    serializedData?: Uint8Array,
  );

  //#region Asynchronous API

  public initAsync(): Promise<void>;
  public isInTransactionAsync(): Promise<boolean>;
  public closeAsync(): Promise<void>;
  public execAsync(source: string): Promise<void>;
  public serializeAsync(databaseName: string): Promise<Uint8Array>;
  public prepareAsync(
    nativeStatement: NativeStatement,
    source: string,
  ): Promise<NativeStatement>;
  public createSessionAsync(
    nativeSession: NativeSession,
    dbName: string,
  ): Promise<NativeSession>;
  public loadExtensionAsync(
    libPath: string,
    entryPoint?: string,
  ): Promise<void>;

  //#endregion

  //#region Synchronous API

  public initSync(): void;
  public isInTransactionSync(): boolean;
  public closeSync(): void;
  public execSync(source: string): void;
  public serializeSync(databaseName: string): Uint8Array;
  public prepareSync(
    nativeStatement: NativeStatement,
    source: string,
  ): NativeStatement;
  public createSessionSync(
    nativeSession: NativeSession,
    dbName: string,
  ): NativeSession;
  public loadExtensionSync(libPath: string, entryPoint?: string): void;

  //#endregion

  /** Only available when the native module was built against a libSQL-backed SQLite. */
  public syncLibSQL(): Promise<void>;
}

/** Options for opening a database. */
export type ISQLiteOpenOptions = {
  /**
   * Whether to call the [`sqlite3_update_hook()`](https://www.sqlite.org/c3ref/update_hook.html)
   * function and enable `onDatabaseChange` events.
   * @default false
   */
  enableChangeListener?: boolean;
  /**
   * Whether to create a new connection even if a connection with the same database name exists
   * in cache.
   * @default false
   */
  useNewConnection?: boolean;
  /**
   * Finalize unclosed statements automatically when the database is closed.
   * @default true
   * @hidden
   */
  finalizeUnusedStatementsBeforeClosing?: boolean;
  /** Options for libSQL integration. */
  libSQLOptions?: {
    /** The URL of the libSQL server. */
    url: string;
    /** The auth token for the libSQL server. */
    authToken: string;
    /**
     * Whether to use remote-only without syncing to a local database.
     * @default false
     */
    remoteOnly?: boolean;
  };
};

type IFlattenedOpenOptions = Omit<ISQLiteOpenOptions, 'libSQLOptions'> & {
  libSQLUrl?: string;
  libSQLAuthToken?: string;
  libSQLRemoteOnly?: boolean;
};

/** Flattens `ISQLiteOpenOptions` into the shape the native module expects. */
export function flattenOpenOptions(
  options: ISQLiteOpenOptions,
): IFlattenedOpenOptions {
  const { libSQLOptions, ...restOptions } = options;
  const result: IFlattenedOpenOptions = { ...restOptions };
  if (libSQLOptions) {
    Object.assign(result, {
      libSQLUrl: libSQLOptions.url,
      libSQLAuthToken: libSQLOptions.authToken,
      libSQLRemoteOnly: libSQLOptions.remoteOnly,
    });
  }
  return result;
}
