// Resolves expo-sqlite's native module by the same name its own `ExpoSQLite.ts` one-liner uses
// (`.vendors/expo` @ origin/sdk-57, packages/expo-sqlite/src/ExpoSQLite.ts:
// `requireNativeModule('ExpoSQLite')`) — through `expo-modules-core` directly, never the `expo`
// meta-package (root CLAUDE.md's dependency-scope invariant). Verified against the Android
// module's `Name("ExpoSQLite")` declaration
// (packages/expo-sqlite/android/.../SQLiteModule.kt) — see this package's `native-link.json`.
//
// `NativeDatabase`/`NativeStatement`/`NativeSession` are plain constructors exposed as CLASS
// PROPERTIES on the native module (`new ExpoSQLite.NativeDatabase(...)`), not `SharedObject`
// subclasses — see native-database.ts's header for why that makes this simpler than
// `@symbiote-native/audio`'s port.
import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

import { NativeDatabase } from './native-database';
import { NativeSession } from './native-session';
import { NativeStatement } from './native-statement';
import type { IDatabaseChangeEvent } from './types';

const EXPO_SQLITE_MODULE_NAME = 'ExpoSQLite';

export type INativeSQLiteModule = {
  readonly NativeDatabase: typeof NativeDatabase;
  readonly NativeStatement: typeof NativeStatement;
  readonly NativeSession: typeof NativeSession;
  /** The directory new databases are created in when no explicit directory is given. */
  readonly defaultDatabaseDirectory: string;
  /** Pre-bundled SQLite extensions (e.g. `sqlite-vec`), keyed by extension name. */
  readonly bundledExtensions: Record<
    string,
    { libPath: string; entryPoint: string } | undefined
  >;
  ensureDatabasePathExistsAsync(databasePath: string): Promise<void>;
  ensureDatabasePathExistsSync(databasePath: string): void;
  /** Copies `assetDatabasePath` (a downloaded `Asset.localUri`) to `databasePath`. */
  importAssetDatabaseAsync(
    databasePath: string,
    assetDatabasePath: string,
    forceOverwrite: boolean,
  ): Promise<void>;
  deleteDatabaseAsync(databasePath: string): Promise<void>;
  deleteDatabaseSync(databasePath: string): void;
  backupDatabaseAsync(
    destDatabase: NativeDatabase,
    destDatabaseName: string,
    sourceDatabase: NativeDatabase,
    sourceDatabaseName: string,
  ): Promise<void>;
  backupDatabaseSync(
    destDatabase: NativeDatabase,
    destDatabaseName: string,
    sourceDatabase: NativeDatabase,
    sourceDatabaseName: string,
  ): void;
  addListener(
    eventName: 'onDatabaseChange',
    listener: (event: IDatabaseChangeEvent) => void,
  ): EventSubscription;
};

export const expoSQLite = requireNativeModule<INativeSQLiteModule>(
  EXPO_SQLITE_MODULE_NAME,
);
