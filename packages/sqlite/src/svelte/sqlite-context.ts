// Svelte context accessor for the database `<SQLiteProvider>` opens. Mirrors
// packages/navigation/src/svelte/navigation-context.ts's boxed-getter shape: Svelte's
// setContext only runs synchronously during component init, while the database resolves later
// (an async openDatabaseAsync), so the provider hands out a getter object up front and mutates
// the value it reads later instead of calling setContext once resolution finishes.

import { getContext, setContext } from 'svelte';
import type { SQLiteDatabase } from '../core';

export type ISQLiteContextValue = {
  readonly current: SQLiteDatabase | undefined;
};

const SQLITE_CONTEXT_KEY = Symbol('symbiote-sqlite-context');

// Written only from <SQLiteProvider>'s own init, never by app code.
export function setSQLiteContext(value: ISQLiteContextValue): void {
  setContext(SQLITE_CONTEXT_KEY, value);
}

/**
 * A global function for accessing the SQLite database provided by the nearest ancestor
 * `<SQLiteProvider>`. Throws if called outside one — matching upstream expo-sqlite's
 * `useSQLiteContext` (`.vendors/expo` packages/expo-sqlite/src/hooks.tsx, sdk-57).
 */
export function useSQLiteContext(): SQLiteDatabase {
  const value = getContext<ISQLiteContextValue | undefined>(SQLITE_CONTEXT_KEY);
  if (value === undefined || value.current === undefined) {
    throw new Error('useSQLiteContext must be used within a <SQLiteProvider>');
  }
  return value.current;
}
