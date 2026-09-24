// Ported from expo-sqlite's NativeSession.ts (.vendors/expo @ origin/sdk-57,
// packages/expo-sqlite/src/NativeSession.ts), renamed with this repo's `I`-prefix convention.
//
// A plain native class wrapping SQLite's session extension
// (https://www.sqlite.org/sessionintro.html), instantiated directly
// (`new ExpoSQLite.NativeSession()`) and mutated in place by
// `NativeDatabase.createSessionAsync`/`createSessionSync` — see `sqlite-database.ts`.
import type { ISQLiteAnyDatabase } from './native-statement';

/** A changeset produced by the session extension. */
export type IChangeset = Uint8Array;
export type INativeChangeset = ArrayBuffer;

export declare class NativeSession {
  //#region Asynchronous API

  public attachAsync(
    database: ISQLiteAnyDatabase,
    table: string | null,
  ): Promise<void>;
  public enableAsync(
    database: ISQLiteAnyDatabase,
    enabled: boolean,
  ): Promise<void>;
  public closeAsync(database: ISQLiteAnyDatabase): Promise<void>;

  public createChangesetAsync(
    database: ISQLiteAnyDatabase,
  ): Promise<INativeChangeset>;
  public createInvertedChangesetAsync(
    database: ISQLiteAnyDatabase,
  ): Promise<INativeChangeset>;
  public applyChangesetAsync(
    database: ISQLiteAnyDatabase,
    changeset: IChangeset | INativeChangeset,
  ): Promise<void>;
  public invertChangesetAsync(
    database: ISQLiteAnyDatabase,
    changeset: IChangeset | INativeChangeset,
  ): Promise<INativeChangeset>;

  //#endregion

  //#region Synchronous API

  public attachSync(database: ISQLiteAnyDatabase, table: string | null): void;
  public enableSync(database: ISQLiteAnyDatabase, enabled: boolean): void;
  public closeSync(database: ISQLiteAnyDatabase): void;

  public createChangesetSync(database: ISQLiteAnyDatabase): INativeChangeset;
  public createInvertedChangesetSync(
    database: ISQLiteAnyDatabase,
  ): INativeChangeset;
  public applyChangesetSync(
    database: ISQLiteAnyDatabase,
    changeset: IChangeset | INativeChangeset,
  ): void;
  public invertChangesetSync(
    database: ISQLiteAnyDatabase,
    changeset: IChangeset | INativeChangeset,
  ): INativeChangeset;

  //#endregion
}
