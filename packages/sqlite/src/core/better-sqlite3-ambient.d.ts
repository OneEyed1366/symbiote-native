// `better-sqlite3` ships no bundled types and this project does not depend on `@types/better-sqlite3`
// (a devDependency-only test fixture does not need the community package's full surface) — a
// minimal structural declaration for exactly what `native-fakes.ts` uses. Kept out of the public
// `exports` surface (see this package's README, "Test it") and excluded from the published
// tarball (package.json `files`) the same way `native-fakes.ts` itself is: neither ships to a
// consumer, both back the headless test fakes only.

declare module 'better-sqlite3' {
  export type IRunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  export class Statement {
    readonly reader: boolean;
    raw(toggle?: boolean): this;
    run(...params: unknown[]): IRunResult;
    all(...params: unknown[]): unknown[];
    iterate(...params: unknown[]): IterableIterator<unknown>;
    columns(): { name: string }[];
  }

  export default class Database {
    constructor(filename: string);
    readonly inTransaction: boolean;
    exec(sql: string): this;
    prepare(sql: string): Statement;
    close(): this;
  }
}
