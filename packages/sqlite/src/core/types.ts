import type { SQLiteDatabase } from './sqlite-database';
import type { ISQLiteOpenOptions } from './native-database';

/** The event payload for `addDatabaseChangeListener`. */
export type IDatabaseChangeEvent = {
  /** The database name — `main` by default, or another name set via `ATTACH DATABASE`. */
  databaseName: string;
  /** The absolute file path to the database. */
  databaseFilePath: string;
  /** The table name. */
  tableName: string;
  /** The changed row ID. */
  rowId: number;
};

/**
 * Called once, right after the native handle opens and before `openDatabaseAsync`/
 * `openDatabaseSync` returns the database — e.g. to run `execAsync`/`execSync` migrations.
 *
 * **Deviation from upstream:** expo-sqlite only exposes this as a `SQLiteProviderProps.onInit`
 * field, called by its React `<SQLiteProvider>` after opening, before rendering children. This
 * package has no Provider yet (per-adapter Provider/hook wrappers are a later, separate pass —
 * see the README), so `onInit` is exposed directly on `openDatabaseAsync`/`openDatabaseSync`
 * instead, giving any adapter — or plain module-scope code with no view tree at all — the same
 * "run this once right after open" hook without needing a Provider to exist first. A future
 * Provider can still accept its own `onInit` prop and either forward it here or call the
 * callback itself; that choice is left to that later pass.
 */
export type IOnInitCallback = (db: SQLiteDatabase) => Promise<void> | void;

/** A bundled database file to import on first open, via `@symbiote-native/asset`. */
export type ISQLiteAssetSource = {
  /** The asset id from `require('./assets/db.db')`. */
  assetId: number;
  /** Overwrite the local database file even if it already exists. @default false */
  forceOverwrite?: boolean;
};

export type IOpenDatabaseOptions = ISQLiteOpenOptions & {
  onInit?: IOnInitCallback;
  /** Async-only — see `importDatabaseFromAssetAsync`; ignored by `openDatabaseSync`. */
  assetSource?: ISQLiteAssetSource;
};
