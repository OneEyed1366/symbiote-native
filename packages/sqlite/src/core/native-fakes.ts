// Test-only fakes for expo-sqlite's native module — first instance in this repo of a
// PLAIN-CONSTRUCTOR native module fake (see `symbiote-expo-native-module` skill §10b: most
// wrapped Expo modules are `SharedObject` subclasses; expo-sqlite's `NativeDatabase`/
// `NativeStatement`/`NativeSession` are ordinary classes instantiated directly by our own
// `sqlite-database.ts`, so the fakes only have to be duck-type compatible with what THAT file
// calls — not with the ambient `declare class` in native-database.ts/native-statement.ts/
// native-session.ts, which describe the real native surface, not this fake).
//
// Each fake wraps a REAL `better-sqlite3` database so tests exercise genuine SQL behavior
// (real transactions, real constraint errors, real column shapes) rather than a hand-rolled
// stub that could silently drift from what SQLite actually does.
//
// Excluded from both `tsc --build` (tsconfig.json) and the published tarball (package.json
// `files`) — it exists only for `vi.mock('./native-module', ...)` to inject into tests.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Statement as IBetterSqliteStatement } from 'better-sqlite3';
import { vi } from 'vitest';

// Real, file-backed SQLite databases in a scratch directory — NOT `:memory:`. This build of
// better-sqlite3 does not honor `file:<name>?mode=memory&cache=shared` as an in-memory URI: it
// silently falls back to treating the whole string as a literal filename, so an earlier version
// of this fake wrote hundreds of garbage files named `file:%2F...?mode=memory&cache=shared` into
// the repo's own working directory (`git status` showed 275 of them). A real file is also more
// faithful to expo-sqlite anyway — a database name genuinely IS a file, so two `NativeDatabase`
// instances opened against the SAME resolved path (`SQLiteDatabase.withExclusiveTransactionAsync`'s
// `useNewConnection: true`) share data exactly like two connections to one file always do, while
// each keeps its own independent `.close()`.
// `process.once('exit', ...)` cleans it up on a normal test-runner shutdown, but a worker pool
// that terminates its workers forcefully (killed rather than exited) can skip it — no JS-level
// hook survives that. Harmless either way: it is OS temp space, not the project tree.
const TEMP_DIR = mkdtempSync(join(tmpdir(), 'symbiote-sqlite-test-'));
process.once('exit', () => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

type IBoundValues = Record<string, unknown>;
type IRunResult = {
  lastInsertRowId: number;
  changes: number;
  firstRowValues: unknown[];
};

function toBindArgs(
  primitiveParams: IBoundValues,
  blobParams: IBoundValues,
  shouldPassAsArray: boolean,
): unknown[] {
  const merged: IBoundValues = { ...primitiveParams, ...blobParams };
  if (shouldPassAsArray) {
    const indices = Object.keys(merged)
      .map(Number)
      .sort((a, b) => a - b);
    return indices.map(index => merged[String(index)]);
  }
  // Named params: expo-sqlite keeps the sigil (`$name`/`:name`/`@name`) in the JS-level key;
  // better-sqlite3 wants the bare name in a single object argument.
  const named: IBoundValues = {};
  for (const [key, value] of Object.entries(merged)) {
    named[key.replace(/^[:$@]/, '')] = value;
  }
  return [named];
}

export class FakeNativeStatement {
  private stmt: IBetterSqliteStatement | undefined;
  private columnNames: string[] = [];
  private isReader = false;
  private cursor: IterableIterator<unknown> | null = null;
  // The args of the most recent run — resetSync() re-opens the cursor with these, mirroring real
  // SQLite's sqlite3_reset(), which rewinds a prepared statement for re-stepping from the start
  // WITHOUT unbinding its parameters.
  private lastArgs: unknown[] = [];

  prepare(db: Database, source: string): void {
    this.stmt = db.prepare(source);
    this.isReader = this.stmt.reader;
    if (this.isReader) {
      this.stmt.raw(true);
      this.columnNames = this.stmt.columns().map(column => column.name);
    } else {
      this.columnNames = [];
    }
  }

  private requireStatement(): IBetterSqliteStatement {
    if (!this.stmt) {
      throw new Error(
        'FakeNativeStatement used before prepare() / after finalize()',
      );
    }
    return this.stmt;
  }

  runSync(
    _database: unknown,
    primitiveParams: IBoundValues,
    blobParams: IBoundValues,
    shouldPassAsArray: boolean,
  ): IRunResult {
    const stmt = this.requireStatement();
    const args = toBindArgs(primitiveParams, blobParams, shouldPassAsArray);
    this.lastArgs = args;
    this.closeCursor();
    if (this.isReader) {
      this.cursor = stmt.iterate(...args);
      const first = this.cursor.next();
      return {
        lastInsertRowId: 0,
        changes: 0,
        firstRowValues: first.done ? [] : (first.value as unknown[]),
      };
    }
    const info = stmt.run(...args);
    this.cursor = null;
    return {
      lastInsertRowId: Number(info.lastInsertRowid),
      changes: info.changes,
      firstRowValues: [],
    };
  }

  async runAsync(
    database: unknown,
    primitiveParams: IBoundValues,
    blobParams: IBoundValues,
    shouldPassAsArray: boolean,
  ): Promise<IRunResult> {
    return this.runSync(
      database,
      primitiveParams,
      blobParams,
      shouldPassAsArray,
    );
  }

  stepSync(_database: unknown): unknown[] | null {
    if (!this.cursor) {
      return null;
    }
    const next = this.cursor.next();
    return next.done ? null : (next.value as unknown[]);
  }

  async stepAsync(database: unknown): Promise<unknown[] | null> {
    return this.stepSync(database);
  }

  getAllSync(_database: unknown): unknown[][] {
    if (!this.cursor) {
      return [];
    }
    const rows: unknown[][] = [];
    for (let next = this.cursor.next(); !next.done; next = this.cursor.next()) {
      rows.push(next.value as unknown[]);
    }
    return rows;
  }

  async getAllAsync(database: unknown): Promise<unknown[][]> {
    return this.getAllSync(database);
  }

  getColumnNamesSync(): string[] {
    return this.columnNames;
  }

  async getColumnNamesAsync(): Promise<string[]> {
    return this.getColumnNamesSync();
  }

  // better-sqlite3 keeps a statement "busy" for the whole connection until an `.iterate()`
  // cursor is either exhausted or explicitly closed — an unfinished SELECT left mid-iteration
  // (exactly what `getFirstAsync()`/`getFirstSync()` do: `run()` pulls only the first row) blocks
  // every subsequent query on the same `Database`, surfacing as `TypeError: This database
  // connection is busy executing a query` on a completely unrelated later call. Real SQLite has
  // no such restriction for a query dropped mid-iteration, so this closes the generator whenever
  // the cursor is replaced/dropped rather than merely dereferencing it.
  private closeCursor(): void {
    this.cursor?.return?.();
    this.cursor = null;
  }

  resetSync(_database: unknown): void {
    this.closeCursor();
    if (this.isReader && this.stmt) {
      this.cursor = this.stmt.iterate(...this.lastArgs);
    }
  }

  async resetAsync(database: unknown): Promise<void> {
    this.resetSync(database);
  }

  finalizeSync(_database: unknown): void {
    this.closeCursor();
    this.stmt = undefined;
  }

  async finalizeAsync(database: unknown): Promise<void> {
    this.finalizeSync(database);
  }
}

export class FakeNativeSession {
  async attachAsync(): Promise<void> {}
  attachSync(): void {}
  async enableAsync(): Promise<void> {}
  enableSync(): void {}
  async closeAsync(): Promise<void> {}
  closeSync(): void {}
  async createChangesetAsync(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
  createChangesetSync(): ArrayBuffer {
    return new ArrayBuffer(0);
  }
  async createInvertedChangesetAsync(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
  createInvertedChangesetSync(): ArrayBuffer {
    return new ArrayBuffer(0);
  }
  async applyChangesetAsync(): Promise<void> {}
  applyChangesetSync(): void {}
  async invertChangesetAsync(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
  invertChangesetSync(): ArrayBuffer {
    return new ArrayBuffer(0);
  }
}

export class FakeNativeDatabase {
  /** Test instrumentation: how many real `better-sqlite3` handles this fake has opened —
   * used to prove `SQLiteStorage`'s `await-lock` actually serializes concurrent first access. */
  static instanceCount = 0;

  readonly db: Database;

  constructor(
    databasePath: string,
    _options?: unknown,
    serializedData?: Uint8Array,
  ) {
    if (serializedData != null) {
      // deserializeDatabaseAsync/Sync's path — better-sqlite3's Database constructor opens
      // directly from a serialized Buffer as a private in-memory db, matching
      // sqlite3_deserialize()'s semantics (the real native module's own contract, per the
      // deserializeDatabaseAsync doc comment this fake stands in for).
      this.db = new Database(Buffer.from(serializedData));
      FakeNativeDatabase.instanceCount++;
      return;
    }
    // A real file under TEMP_DIR, keyed by the resolved database PATH, rather than a bare
    // `:memory:` — real expo-sqlite databases are files, so two `NativeDatabase` instances
    // opened with `useNewConnection: true` (SQLiteDatabase's `withExclusiveTransactionAsync`)
    // see the SAME tables, and each still closes independently. A bare `:memory:` gives each
    // `new Database(...)` call its own private, empty store, breaking that path with `SqliteError:
    // no such table`; `databasePath === ':memory:'` (only reached via `deserializeDatabaseAsync`,
    // not exercised by this package's tests) gets its own throwaway file instead, since there is
    // no path to key sharing on.
    const fileName =
      databasePath === ':memory:'
        ? `anon-${Math.random()}.sqlite`
        : `${encodeURIComponent(databasePath)}.sqlite`;
    this.db = new Database(join(TEMP_DIR, fileName));
    FakeNativeDatabase.instanceCount++;
  }

  async initAsync(): Promise<void> {}
  initSync(): void {}

  async isInTransactionAsync(): Promise<boolean> {
    return this.db.inTransaction;
  }
  isInTransactionSync(): boolean {
    return this.db.inTransaction;
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
  closeSync(): void {
    this.db.close();
  }

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }
  execSync(source: string): void {
    this.db.exec(source);
  }

  async serializeAsync(_databaseName: string): Promise<Uint8Array> {
    return this.serializeSync(_databaseName);
  }
  serializeSync(_databaseName: string): Uint8Array {
    return new Uint8Array(this.db.serialize());
  }

  async prepareAsync(
    nativeStatement: FakeNativeStatement,
    source: string,
  ): Promise<FakeNativeStatement> {
    nativeStatement.prepare(this.db, source);
    return nativeStatement;
  }
  prepareSync(
    nativeStatement: FakeNativeStatement,
    source: string,
  ): FakeNativeStatement {
    nativeStatement.prepare(this.db, source);
    return nativeStatement;
  }

  async createSessionAsync(
    nativeSession: FakeNativeSession,
    _dbName: string,
  ): Promise<FakeNativeSession> {
    return nativeSession;
  }
  createSessionSync(
    nativeSession: FakeNativeSession,
    _dbName: string,
  ): FakeNativeSession {
    return nativeSession;
  }

  async loadExtensionAsync(): Promise<void> {
    throw new Error('loadExtension is not implemented by the test fake');
  }
  loadExtensionSync(): void {
    throw new Error('loadExtension is not implemented by the test fake');
  }
}

/**
 * Injected in place of `./native-module`'s `expoSQLite` export via `vi.mock`. The function
 * members are `vi.fn()`-wrapped (not just plain closures) so a test can assert on how they were
 * called, e.g. that `openDatabaseAsync` resolved the path it hands to `ensureDatabasePathExistsAsync`.
 */
export const FAKE_EXPO_SQLITE = {
  NativeDatabase: FakeNativeDatabase,
  NativeStatement: FakeNativeStatement,
  NativeSession: FakeNativeSession,
  defaultDatabaseDirectory: '/fake-sqlite-directory',
  bundledExtensions: {},
  ensureDatabasePathExistsAsync: vi.fn(
    async (_path: string): Promise<void> => {},
  ),
  ensureDatabasePathExistsSync: vi.fn((_path: string): void => {}),
  importAssetDatabaseAsync: vi.fn(
    async (
      _databasePath: string,
      _assetDatabasePath: string,
      _forceOverwrite: boolean,
    ): Promise<void> => {},
  ),
  deleteDatabaseAsync: vi.fn(async (_path: string): Promise<void> => {}),
  deleteDatabaseSync: vi.fn((_path: string): void => {}),
  backupDatabaseAsync: vi.fn(async (): Promise<void> => {
    throw new Error('backupDatabase is not implemented by the test fake');
  }),
  backupDatabaseSync: vi.fn((): void => {
    throw new Error('backupDatabase is not implemented by the test fake');
  }),
  addListener: vi.fn(
    (_eventName: string, _listener: (event: unknown) => void) => ({
      remove: () => {},
    }),
  ),
};
