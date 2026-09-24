// Vue twin of upstream's `SQLiteProvider`/`useSQLiteContext`
// (.vendors/expo @ origin/sdk-57, packages/expo-sqlite/src/hooks.tsx). React's mechanics
// (useEffect/React.use/Suspense) don't transfer; this reproduces the OBSERVABLE contract with
// Vue's own provide/inject, following packages/navigation/src/vue/navigation-context.ts's shape
// (a symbol-keyed InjectionKey, a `require*` getter that throws with a hook-scoped message).
//
// `assetSource` reaches `openDatabaseAsync` via the `options` prop, not a separate prop here.
// Deliberately excluded, this pass only: Suspense integration (`useSuspense`). Vue has its own
// `<Suspense>`/async `setup()` idiom instead of React's `use()`; wiring it in is a later decision.

import {
  defineComponent,
  inject,
  onUnmounted,
  provide,
  shallowRef,
  watch,
} from '@vue/runtime-core';
import type { InjectionKey, ShallowRef } from '@vue/runtime-core';
import { openDatabaseAsync } from '../core';
import type { ISQLiteOpenOptions, SQLiteDatabase } from '../core';

export type ISQLiteProviderProps = {
  databaseName: string;
  directory?: string;
  options?: ISQLiteOpenOptions;
  onInit?: (db: SQLiteDatabase) => Promise<void> | void;
  onError?: (error: Error) => void;
};

const SQLITE_CONTEXT_KEY: InjectionKey<ShallowRef<SQLiteDatabase | null>> =
  Symbol('sqlite-context');

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Opens `databaseName` (re-opening whenever `databaseName`/`directory`/`options`/`onInit`
 * change) and provides the resulting `SQLiteDatabase` to its default-slot children via
 * `useSQLiteContext`. Renders nothing while opening or on failure with no `onError`; on failure
 * with `onError`, calls it and renders nothing. Closes the database before re-opening and on
 * unmount.
 */
export const SQLiteProvider = defineComponent<ISQLiteProviderProps>(
  (props, { slots }) => {
    const database = shallowRef<SQLiteDatabase | null>(null);
    provide(SQLITE_CONTEXT_KEY, database);

    // Async watch callback: Vue's `callWithAsyncErrorHandling` attaches a `.catch` to the
    // returned promise and routes a rejection through `app.config.errorHandler`
    // (`handleError`) — the same channel `mount()` wires to the engine's shared reporter (see
    // packages/navigation's composables.test.ts). So a thrown `Error` here IS the Vue-idiomatic
    // "rethrow", not a swallowed unhandled rejection.
    watch(
      () => [props.databaseName, props.directory, props.options, props.onInit],
      async () => {
        const previous = database.value;
        database.value = null;
        await previous?.closeAsync();

        const { databaseName, directory, options, onInit, onError } = props;
        try {
          database.value = await openDatabaseAsync(
            databaseName,
            { ...options, onInit },
            directory,
          );
        } catch (reason) {
          const error = toError(reason);
          if (onError !== undefined) {
            onError(error);
          } else {
            throw error;
          }
        }
      },
      { immediate: true },
    );

    onUnmounted(() => {
      void database.value?.closeAsync();
    });

    return () => (database.value !== null ? slots.default?.() : null);
  },
  {
    name: 'SQLiteProvider',
    props: ['databaseName', 'directory', 'options', 'onInit', 'onError'],
  },
);

/**
 * Reads the `SQLiteDatabase` opened by the nearest ancestor `<SQLiteProvider>`. Throws when
 * called outside one.
 */
export function useSQLiteContext(): SQLiteDatabase {
  const context = inject(SQLITE_CONTEXT_KEY, undefined);
  if (context === undefined || context.value === null) {
    throw new Error('useSQLiteContext must be used within a <SQLiteProvider>');
  }
  return context.value;
}
