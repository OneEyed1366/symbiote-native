// Ported from expo-sqlite's SQLiteSession.ts (.vendors/expo @ origin/sdk-57,
// packages/expo-sqlite/src/SQLiteSession.ts), renamed with this repo's `I`-prefix convention.
import type { NativeDatabase } from './native-database';
import type { NativeSession, IChangeset } from './native-session';

export type { IChangeset };

/**
 * An instance of the SQLite session extension.
 * @see [Session Extension](https://www.sqlite.org/sessionintro.html)
 */
export class SQLiteSession {
  constructor(
    private readonly nativeDatabase: NativeDatabase,
    private readonly nativeSession: NativeSession,
  ) {}

  //#region Asynchronous API

  /**
   * Attaches a table to the session.
   * @see [`sqlite3session_attach`](https://www.sqlite.org/session/sqlite3session_attach.html)
   * @param table The table to attach. `null` attaches all tables.
   */
  public attachAsync(table: string | null): Promise<void> {
    return this.nativeSession.attachAsync(this.nativeDatabase, table);
  }

  /**
   * Enables or disables the session.
   * @see [`sqlite3session_enable`](https://www.sqlite.org/session/sqlite3session_enable.html)
   */
  public enableAsync(enabled: boolean): Promise<void> {
    return this.nativeSession.enableAsync(this.nativeDatabase, enabled);
  }

  /**
   * Closes the session.
   * @see [`sqlite3session_delete`](https://www.sqlite.org/session/sqlite3session_delete.html)
   */
  public closeAsync(): Promise<void> {
    return this.nativeSession.closeAsync(this.nativeDatabase);
  }

  /**
   * Creates a changeset.
   * @see [`sqlite3session_changeset`](https://www.sqlite.org/session/sqlite3session_changeset.html)
   */
  public async createChangesetAsync(): Promise<IChangeset> {
    const changesetBuffer = await this.nativeSession.createChangesetAsync(
      this.nativeDatabase,
    );
    return new Uint8Array(changesetBuffer);
  }

  /**
   * Creates an inverted changeset — shorthand for `createChangesetAsync()` +
   * `invertChangesetAsync()`.
   */
  public async createInvertedChangesetAsync(): Promise<IChangeset> {
    const changesetBuffer =
      await this.nativeSession.createInvertedChangesetAsync(
        this.nativeDatabase,
      );
    return new Uint8Array(changesetBuffer);
  }

  /**
   * Applies a changeset.
   * @see [`sqlite3changeset_apply`](https://www.sqlite.org/session/sqlite3changeset_apply.html)
   */
  public applyChangesetAsync(changeset: IChangeset): Promise<void> {
    return this.nativeSession.applyChangesetAsync(
      this.nativeDatabase,
      changeset,
    );
  }

  /**
   * Inverts a changeset.
   * @see [`sqlite3changeset_invert`](https://www.sqlite.org/session/sqlite3changeset_invert.html)
   */
  public async invertChangesetAsync(
    changeset: IChangeset,
  ): Promise<IChangeset> {
    const changesetBuffer = await this.nativeSession.invertChangesetAsync(
      this.nativeDatabase,
      changeset,
    );
    return new Uint8Array(changesetBuffer);
  }

  //#endregion

  //#region Synchronous API

  /**
   * Attaches a table to the session.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public attachSync(table: string | null): void {
    this.nativeSession.attachSync(this.nativeDatabase, table);
  }

  /**
   * Enables or disables the session.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public enableSync(enabled: boolean): void {
    this.nativeSession.enableSync(this.nativeDatabase, enabled);
  }

  /**
   * Closes the session.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public closeSync(): void {
    this.nativeSession.closeSync(this.nativeDatabase);
  }

  /**
   * Creates a changeset.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public createChangesetSync(): IChangeset {
    const changesetBuffer = this.nativeSession.createChangesetSync(
      this.nativeDatabase,
    );
    return new Uint8Array(changesetBuffer);
  }

  /**
   * Creates an inverted changeset — shorthand for `createChangesetSync()` +
   * `invertChangesetSync()`.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public createInvertedChangesetSync(): IChangeset {
    const changesetBuffer = this.nativeSession.createInvertedChangesetSync(
      this.nativeDatabase,
    );
    return new Uint8Array(changesetBuffer);
  }

  /**
   * Applies a changeset.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public applyChangesetSync(changeset: IChangeset): void {
    this.nativeSession.applyChangesetSync(this.nativeDatabase, changeset);
  }

  /**
   * Inverts a changeset.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public invertChangesetSync(changeset: IChangeset): IChangeset {
    const changesetBuffer = this.nativeSession.invertChangesetSync(
      this.nativeDatabase,
      changeset,
    );
    return new Uint8Array(changesetBuffer);
  }

  //#endregion
}
