<script lang="ts">
  // SQLiteProvider: the Svelte equivalent of upstream expo-sqlite's SQLiteProvider/
  // useSQLiteContext pair (.vendors/expo packages/expo-sqlite/src/hooks.tsx, sdk-57). Opens the
  // database in an `$effect` (re-running whenever databaseName/directory/options/onInit change —
  // $effect's own cleanup-then-rerun IS upstream's teardown()-then-setup() dance), renders
  // nothing until it resolves, and hands the resolved `SQLiteDatabase` to descendants via
  // `useSQLiteContext` (./sqlite-context).
  //
  // Context is provided through a BOXED GETTER set synchronously during init, mirroring
  // navigation-context.ts: setContext only works at component-init time, but the database
  // resolves later, so the getter is handed out immediately and its underlying `$state` is
  // written once the effect settles.
  //
  // `assetSource` reaches `openDatabaseAsync` via `options`, forwarded below — not a separate
  // prop here. `useSuspense` is not offered: Svelte has no built-in Suspense primitive.
  //
  // Unlike upstream, `onInit` is not called from here — this package's own `openDatabaseAsync`
  // already runs it internally before resolving (see `IOnInitCallback`'s doc comment in
  // `core/types.ts`), so this component only forwards it through `options`.
  import type { Snippet } from 'svelte';
  import { openDatabaseAsync } from '../core';
  import type { IOnInitCallback, ISQLiteOpenOptions, SQLiteDatabase } from '../core';
  import { setSQLiteContext } from './sqlite-context';

  let {
    databaseName,
    directory,
    options,
    onInit,
    onError,
    children,
  }: {
    databaseName: string;
    directory?: string;
    options?: ISQLiteOpenOptions;
    onInit?: IOnInitCallback;
    onError?: (error: Error) => void;
    children?: Snippet;
  } = $props();

  let db = $state<SQLiteDatabase | undefined>(undefined);

  setSQLiteContext({
    get current(): SQLiteDatabase | undefined {
      return db;
    },
  });

  $effect(() => {
    const name = databaseName;
    const dir = directory;
    const openOptions = options;
    const init = onInit;

    let cancelled = false;
    let opened: SQLiteDatabase | undefined;

    openDatabaseAsync(name, { ...openOptions, onInit: init }, dir)
      .then(database => {
        if (cancelled) {
          void database.closeAsync();
          return;
        }
        opened = database;
        db = database;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        // Upstream default: rethrow. Svelte has no error-boundary equivalent to catch a
        // synchronous throw from here, so "rethrow" surfaces as an unhandled rejection — the
        // same observable failure (an uncaught error) upstream produces without `onError`.
        if (onError) onError(err);
        else throw err;
      });

    return () => {
      cancelled = true;
      db = undefined;
      if (opened) void opened.closeAsync();
    };
  });
</script>

{#if db}
  {@render children?.()}
{/if}
