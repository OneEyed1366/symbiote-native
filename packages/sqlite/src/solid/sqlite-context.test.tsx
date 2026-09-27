// Co-located Solid-driven test for <SQLiteProvider>/useSQLiteContext.
//
// No JSX syntax anywhere in this file, despite the .tsx extension (kept to match the task's
// requested filename): the repo's `vitest.config.ts` "solid" project configures
// babel-preset-solid with `moduleName: '@symbiote-native/solid/renderer'` for every file it
// transforms, and `packages/sqlite` does not depend on that adapter package (see
// ../solid/sqlite-context.ts's header on why the SOURCE file is plain `.ts` for the same root
// cause). Writing real JSX here would make Babel try to import `createComponent` from a package
// this manifest never installs. `createComponent`/`children` from solid-js core sidestep it
// entirely — the same style production code in this package already uses.
//
// SQLiteProvider renders no host primitive (Context.Provider, `undefined`, or plain function
// children), so there is nothing here resembling a Fabric tree to mount into — no
// @symbiote-native/{solid,engine,test-utils}, mirroring exactly why ../react's sibling test skips
// the whole reconciler stack for the same component. The harness is solid-js's own `children()`
// helper (renderer-agnostic — it just resolves nested accessors/arrays into a value), driven
// inside `createRoot` since createResource/createMemo need a live reactive owner.
import {
  children,
  createComponent,
  createRoot,
  createSignal,
  catchError,
  type Accessor,
} from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SQLiteProvider, useSQLiteContext } from './sqlite-context';
import type { ISQLiteProviderProps } from './sqlite-context';
import type { SQLiteDatabase } from '../core';

const { openDatabaseAsyncMock, closeAsyncMock } = vi.hoisted(() => ({
  openDatabaseAsyncMock: vi.fn(),
  closeAsyncMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('../core', () => ({ openDatabaseAsync: openDatabaseAsyncMock }));

const noop = (): void => {};

type IDeferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): IDeferred<T> {
  const box: Pick<IDeferred<T>, 'resolve' | 'reject'> = {
    resolve: noop,
    reject: noop,
  };
  const promise = new Promise<T>((resolve, reject) => {
    box.resolve = resolve;
    box.reject = reject;
  });
  return { promise, resolve: box.resolve, reject: box.reject };
}

// A structural stand-in for the resolved database — the provider only ever calls
// `closeAsync()` on it, and production code's own typing (`SQLiteDatabase`, from the UNMOCKED
// `../core` types) never sees this shape, so nothing here needs a cast.
type IFakeDb = { closeAsync: typeof closeAsyncMock };

function fakeDatabase(): IFakeDb {
  return { closeAsync: closeAsyncMock };
}

// createResource's internal memos need a live owner; each test disposes its own root, which also
// runs SQLiteProvider's onCleanup — the production stand-in for "unmount".
function mount(props: ISQLiteProviderProps): {
  resolved: Accessor<unknown>;
  dispose: () => void;
} {
  let resolved: Accessor<unknown> = () => undefined;
  const dispose = createRoot(disposeRoot => {
    resolved = children(() => createComponent(SQLiteProvider, props));
    return disposeRoot;
  });
  return { resolved, dispose };
}

// The propagation contract: no onError means the error surfaces through Solid's own error
// context, exactly like any other throw in this adapter (adapters/solid/src/render.ts's
// `catchError` + rethrow at the mount root). `catchError` here plays the harness's own
// <ErrorBoundary> — it does not matter that the throw originates inside an async continuation
// (the resource settling): every computation created during `fn()` snapshots this Owner's
// context at CREATION time, so a later reactive update still finds the handler.
function mountCatching(props: ISQLiteProviderProps): {
  resolved: Accessor<unknown>;
  dispose: () => void;
  caught: () => unknown;
} {
  let resolved: Accessor<unknown> = () => undefined;
  let caught: unknown;
  const dispose = createRoot(disposeRoot => {
    catchError(
      () => {
        resolved = children(() => createComponent(SQLiteProvider, props));
      },
      error => {
        caught = error;
      },
    );
    return disposeRoot;
  });
  return { resolved, dispose, caught: () => caught };
}

// Lets the resource's fetcher promise (and createResource's own follow-up microtask, loadEnd)
// settle before the next assertion.
async function flush(...settled: Array<Promise<unknown>>): Promise<void> {
  await Promise.allSettled(settled);
  await Promise.resolve();
  await Promise.resolve();
}

function Consumer(props: { onRender: (db: SQLiteDatabase) => void }): string {
  props.onRender(useSQLiteContext());
  return 'consumer-rendered';
}

afterEach(() => {
  vi.resetAllMocks();
  closeAsyncMock.mockImplementation(() => Promise.resolve());
});

describe('<SQLiteProvider>', () => {
  it('renders nothing while the database is opening', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const onRender = vi.fn();

    const { resolved, dispose } = mount({
      databaseName: 'pending.db',
      children: () => createComponent(Consumer, { onRender }),
    });

    expect(resolved()).toBeUndefined();
    expect(onRender).not.toHaveBeenCalled();

    pending.resolve(fakeDatabase());
    await flush(pending.promise);
    dispose();
  });

  it('provides the database and renders children once open resolves', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const db = fakeDatabase();
    const renders: unknown[] = [];

    const { resolved, dispose } = mount({
      databaseName: 'ready.db',
      children: () =>
        createComponent(Consumer, { onRender: value => renders.push(value) }),
    });
    pending.resolve(db);
    await flush(pending.promise);

    expect(resolved()).toBe('consumer-rendered');
    expect(renders).toEqual([db]);
    dispose();
  });

  it('closes the database on unmount', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);

    const { dispose } = mount({
      databaseName: 'closed.db',
      children: () => createComponent(Consumer, { onRender: noop }),
    });
    pending.resolve(fakeDatabase());
    await flush(pending.promise);
    dispose();

    expect(closeAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('closes the previous database before opening the next, on a prop change', async () => {
    const firstPending = deferred<IFakeDb>();
    const secondPending = deferred<IFakeDb>();
    openDatabaseAsyncMock
      .mockReturnValueOnce(firstPending.promise)
      .mockReturnValueOnce(secondPending.promise);

    const [databaseName, setDatabaseName] = createSignal('first.db');
    const { dispose } = mount({
      get databaseName(): string {
        return databaseName();
      },
      children: () => createComponent(Consumer, { onRender: noop }),
    });
    firstPending.resolve(fakeDatabase());
    await flush(firstPending.promise);
    expect(closeAsyncMock).not.toHaveBeenCalled();

    setDatabaseName('second.db');
    secondPending.resolve(fakeDatabase());
    await flush(secondPending.promise);

    expect(closeAsyncMock).toHaveBeenCalledTimes(1);
    expect(openDatabaseAsyncMock).toHaveBeenNthCalledWith(
      2,
      'second.db',
      expect.anything(),
      undefined,
    );

    dispose();
    expect(closeAsyncMock).toHaveBeenCalledTimes(2);
  });

  it('calls onError instead of propagating when open fails', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const failure = new Error('disk full');
    const onError = vi.fn();

    const { resolved, dispose } = mountCatching({
      databaseName: 'broken.db',
      onError,
      children: () => createComponent(Consumer, { onRender: noop }),
    });
    pending.reject(failure);
    await flush(pending.promise);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(resolved()).toBeUndefined();
    dispose();
  });

  it('propagates the open failure when no onError is given', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const failure = new Error('disk full');

    const { caught, dispose } = mountCatching({
      databaseName: 'broken-unhandled.db',
      children: () => createComponent(Consumer, { onRender: noop }),
    });
    pending.reject(failure);
    await flush(pending.promise);

    expect(caught()).toBe(failure);
    dispose();
  });
});

describe('useSQLiteContext', () => {
  it('throws when used outside a <SQLiteProvider>', () => {
    expect(() => useSQLiteContext()).toThrow(
      'useSQLiteContext must be used within a <SQLiteProvider>',
    );
  });
});
