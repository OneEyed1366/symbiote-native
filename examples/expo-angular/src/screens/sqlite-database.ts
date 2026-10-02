import { inject } from '@angular/core';
import { SqliteService } from '@symbiote-native/sqlite/angular';
import type { SQLiteDatabase } from '@symbiote-native/sqlite/angular';

// Angular twin of `useSQLiteContext`, only valid once the screen has rendered its database children
export function injectSqliteDatabase(): () => SQLiteDatabase {
  const sqlite = inject(SqliteService);
  return () => {
    const database = sqlite.database();
    if (database === undefined) {
      throw new Error('the SQLite database is not open yet');
    }
    return database;
  };
}
