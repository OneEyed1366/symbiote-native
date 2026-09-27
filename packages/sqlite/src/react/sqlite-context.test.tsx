// Co-located React-driven test for <SQLiteProvider>/useSQLiteContext.
//
// No renderer is linked into this package (no react-dom / react-test-renderer /
// @symbiote-native/react — those are declared by every OTHER package's package.json, not this
// one yet: `packages/sqlite/package.json` ships no React runtime deps besides `react` itself).
// `@symbiote-native/react`'s own `mount`/`unmount` (the pattern every sibling package's React
// tests use, e.g. `packages/sensors/src/react/hooks/**`) additionally needs
// `@symbiote-native/engine` + `@symbiote-native/test-utils`'s fake Fabric slot, which this
// package doesn't depend on either — and SQLiteProvider never renders a host primitive anyway
// (Context.Provider, `null`, or plain function children), so pulling in the whole Fabric stack
// would be the wrong tool even if it were linked.
//
// So this file drives React itself with the SMALLEST renderer that can run hooks/effects/context
// at all: `react-reconciler` (the same package `adapters/react/src/host-config.ts` builds its
// real host config from) in mutation mode, with every host-mutation method stubbed as a no-op or
// a throw — this tree creates zero host instances, so those methods are never actually called.
// `react-reconciler` + `@types/react-reconciler` are real dependencies elsewhere in this monorepo
// (`adapters/react/package.json`, catalog-pinned) but aren't yet linked into this package's own
// `node_modules`. Until `packages/sqlite/package.json` adds them, resolving this import needs the
// local `node_modules/react-reconciler` (+ `node_modules/@types/react-reconciler`) symlink this
// task added by hand, mirroring exactly what pnpm's own hoisted linker does for `adapters/react`
// — see the task's final report for why `package.json` itself was left untouched.
import { act, Component, createContext, type ReactNode } from 'react';
import createReconciler from 'react-reconciler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SQLiteProvider, useSQLiteContext } from './sqlite-context';
import type { SQLiteDatabase } from '../core';

const { openDatabaseAsyncMock, closeAsyncMock } = vi.hoisted(() => ({
  openDatabaseAsyncMock: vi.fn(),
  closeAsyncMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('../core', () => ({ openDatabaseAsync: openDatabaseAsyncMock }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

//#region Minimal react-reconciler harness (see header)

const NO_EVENT_PRIORITY = 0;
const DEFAULT_EVENT_PRIORITY = 32;
const LEGACY_ROOT = 0;
let currentPriority = NO_EVENT_PRIORITY;
const noop = (): void => {};

function unsupported(what: string): () => never {
  return () => {
    throw new Error(
      `test harness: ${what} is unsupported — this tree must render no host elements`,
    );
  };
}

const reconciler = createReconciler<
  string, // Type
  Record<string, unknown>, // Props
  Record<string, never>, // Container
  never, // Instance
  never, // TextInstance
  never, // SuspenseInstance
  unknown, // HydratableInstance
  unknown, // FormInstance
  null, // PublicInstance
  null, // HostContext
  unknown, // ChildSet
  number, // TimeoutHandle
  number, // NoTimeout
  unknown // TransitionStatus
>({
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  noTimeout: -1,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  getRootHostContext: () => null,
  getChildHostContext: parentHostContext => parentHostContext,
  getPublicInstance: () => null,
  prepareForCommit: () => null,
  resetAfterCommit: () => {},
  preparePortalMount: () => {},
  clearContainer: () => {},
  shouldSetTextContent: () => false,
  createInstance: unsupported('createInstance'),
  createTextInstance: unsupported('createTextInstance'),
  appendInitialChild: () => {},
  appendChild: () => {},
  appendChildToContainer: () => {},
  insertBefore: () => {},
  insertInContainerBefore: () => {},
  removeChild: () => {},
  removeChildFromContainer: () => {},
  finalizeInitialChildren: () => false,
  commitUpdate: () => {},
  commitTextUpdate: () => {},
  resetTextContent: () => {},
  hideTextInstance: () => {},
  unhideTextInstance: () => {},
  hideInstance: () => {},
  unhideInstance: () => {},
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  detachDeletedInstance: () => {},
  getInstanceFromNode: () => null,
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,
  setCurrentUpdatePriority: priority => {
    currentPriority = priority;
  },
  getCurrentUpdatePriority: () => currentPriority,
  resolveUpdatePriority: () =>
    currentPriority !== NO_EVENT_PRIORITY
      ? currentPriority
      : DEFAULT_EVENT_PRIORITY,
  maySuspendCommit: () => false,
  NotPendingTransition: null,
  HostTransitionContext: createContext<unknown>(null),
  resetFormInstance: () => {},
  requestPostPaintCallback: () => {},
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
});

type IContainerHandle = ReturnType<typeof reconciler.createContainer>;

// A defensive backstop, matching production `mount()`/`unmount()` (adapters/react/src/render.ts),
// which never throw to their caller either — a render error with no boundary is reported via the
// `onUncaughtError` callback above, not by propagating out of this call.
function guarded(run: () => void): void {
  try {
    run();
  } catch {
    // already reported through onUncaughtError inside `run`.
  }
}

// Tracks every harness created by a test so `afterEach` can always unmount it — a `harness.
// unmount()` written at the end of a test body never runs when an `expect(...)` above it throws,
// and a root left mounted across tests corrupts react-reconciler's own module-level scheduler
// state for the NEXT test (see the header on `afterEach` below).
const liveHarnesses: Array<{ unmount: () => void }> = [];

function createHarness(
  onUncaughtError: (error: unknown, info: unknown) => void = noop,
) {
  let container: IContainerHandle | null = null;

  function mount(element: ReactNode): void {
    guarded(() => {
      container = reconciler.createContainer(
        {},
        LEGACY_ROOT,
        null,
        false,
        null,
        'sqlite-context-test',
        onUncaughtError,
        noop,
        noop,
        noop,
        null,
      );
      // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
      // (types lag — same suppression adapters/react/src/render.ts uses). No `act()` here,
      // matching production `mount()` (adapters/react/src/render.ts) — `act()` swallows the
      // reconciler's own `onUncaughtError` callback and re-throws instead, which this harness
      // does not want (see `guarded`'s comment).
      reconciler.updateContainerSync(element, container, null, noop);
      // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
      reconciler.flushSyncWork();
    });
  }

  // Re-renders the SAME root with a new element — unlike `mount()`, which always creates a
  // fresh container. Needed to observe a rerender's effect on `SQLiteProvider`'s own
  // `memo(..., propsAreEqual)` wrapper (whether it re-invokes `openDatabaseAsync`), which a
  // second, independent `mount()` call cannot exercise — that would just be a second, unrelated
  // root.
  function update(element: ReactNode): void {
    if (container == null) {
      mount(element);
      return;
    }
    guarded(() => {
      // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
      reconciler.updateContainerSync(element, container, null, noop);
      // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
      reconciler.flushSyncWork();
    });
  }

  function unmount(): void {
    if (container == null) return;
    guarded(() => {
      // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
      reconciler.updateContainerSync(null, container, null, noop);
      // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
      reconciler.flushSyncWork();
    });
    container = null;
  }

  const harness = { mount, update, unmount };
  liveHarnesses.push(harness);
  return harness;
}

// Lets a state update queued by a resolved/rejected promise (the effect's `await
// openDatabaseAsync(...)` continuation) actually commit before the next assertion. Takes the
// EXACT promise(s) the effect is awaiting — a fixed tick count guesses wrong across scenarios
// (see .claude/rules/test-harness-false-greens.md §23a: a settle sized in ticks, not in the
// thing it's actually waiting on, silently reads a half-finished state).
async function flush(...settled: Array<Promise<unknown>>): Promise<void> {
  try {
    await act(async () => {
      await Promise.allSettled(settled);
      await Promise.resolve();
      await Promise.resolve();
    });
  } catch {
    // see `guarded` above — already reported through onUncaughtError.
  }
}

//#endregion

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
// `closeAsync()` on it, and production code's own typing (`SQLiteDatabase`, from the
// UNMOCKED `../core` types) never sees this shape, so nothing here needs a cast.
type IFakeDb = { closeAsync: typeof closeAsyncMock };

function fakeDatabase(): IFakeDb {
  return { closeAsync: closeAsyncMock };
}

function Consumer({
  onRender,
}: {
  onRender: (db: SQLiteDatabase) => void;
}): null {
  onRender(useSQLiteContext());
  return null;
}

// Deliberately does NOT read context — used to prove SQLiteProvider rendered `null` rather than
// `children`. A `Consumer` would also read as "not rendered" if the provider rendered children
// too early (its `useSQLiteContext()` throws on a null context, swallowed with nothing pushed),
// which is a false green: see .claude/rules/test-harness-false-greens.md, break-tested here too.
function Marker({ onRender }: { onRender: () => void }): null {
  onRender();
  return null;
}

// A throw with no error boundary is only OBSERVABLE, in this harness, via `onUncaughtError` —
// and that path turned out to depend on whether `act()` had already handled a throw earlier in
// the same test run (react-reconciler's own module-level scheduler state, not this harness's).
// A real error boundary sidesteps it entirely: `componentDidCatch` fires synchronously as part
// of the ordinary commit, on an initial render OR an update, independent of `act()`.
class Boundary extends Component<
  { children: ReactNode; onCatch: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onCatch(
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

afterEach(() => {
  while (liveHarnesses.length > 0) liveHarnesses.pop()?.unmount();
  vi.resetAllMocks();
  closeAsyncMock.mockImplementation(() => Promise.resolve());
});

describe('<SQLiteProvider> — non-Suspense', () => {
  it('renders null while the database is opening', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    let renderCount = 0;
    const harness = createHarness();

    harness.mount(
      <SQLiteProvider databaseName="pending.db">
        <Marker onRender={() => renderCount++} />
      </SQLiteProvider>,
    );

    expect(renderCount).toBe(0);
    pending.resolve(fakeDatabase());
    await flush(pending.promise);
    expect(renderCount).toBe(1);
    harness.unmount();
  });

  it('provides the database and renders children once open resolves', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const db = fakeDatabase();
    const renders: SQLiteDatabase[] = [];
    const harness = createHarness();

    harness.mount(
      <SQLiteProvider databaseName="ready.db">
        <Consumer onRender={value => renders.push(value)} />
      </SQLiteProvider>,
    );
    pending.resolve(db);
    await flush(pending.promise);

    expect(renders).toEqual([db]);
    harness.unmount();
  });

  it('closes the database on unmount', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const harness = createHarness();

    harness.mount(
      <SQLiteProvider databaseName="closed.db">{null}</SQLiteProvider>,
    );
    pending.resolve(fakeDatabase());
    await flush(pending.promise);
    harness.unmount();

    expect(closeAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('calls onError instead of throwing when open fails', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const failure = new Error('disk full');
    const onError = vi.fn();
    const onUncaughtError = vi.fn();
    const harness = createHarness(onUncaughtError);

    harness.mount(
      <SQLiteProvider databaseName="broken.db" onError={onError}>
        {null}
      </SQLiteProvider>,
    );
    pending.reject(failure);
    await flush(pending.promise);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(onUncaughtError).not.toHaveBeenCalled();
    harness.unmount();
  });

  it('rethrows the open failure when no onError is given', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const failure = new Error('disk full');
    const caught: Error[] = [];
    const harness = createHarness();

    harness.mount(
      <Boundary onCatch={error => caught.push(error)}>
        <SQLiteProvider databaseName="broken-unhandled.db">
          {null}
        </SQLiteProvider>
      </Boundary>,
    );
    pending.reject(failure);
    await flush(pending.promise);

    expect(caught).toEqual([failure]);
    harness.unmount();
  });
});

describe('useSQLiteContext', () => {
  it('throws when used outside a <SQLiteProvider>', () => {
    function Bare(): null {
      useSQLiteContext();
      return null;
    }
    const caught: Error[] = [];
    const harness = createHarness();

    harness.mount(
      <Boundary onCatch={error => caught.push(error)}>
        <Bare />
      </Boundary>,
    );

    expect(caught.map(error => error.message)).toEqual([
      'useSQLiteContext must be used within a <SQLiteProvider>',
    ]);
    harness.unmount();
  });
});

describe('<SQLiteProvider useSuspense>', () => {
  it('throws synchronously when combined with onError', () => {
    const caught: Error[] = [];
    const harness = createHarness();

    harness.mount(
      <Boundary onCatch={error => caught.push(error)}>
        <SQLiteProvider databaseName="suspense.db" useSuspense onError={noop}>
          {null}
        </SQLiteProvider>
      </Boundary>,
    );

    expect(caught.map(error => error.message)).toEqual([
      'Cannot use `onError` with `useSuspense`, use error boundaries instead.',
    ]);
    expect(openDatabaseAsyncMock).not.toHaveBeenCalled();
    harness.unmount();
  });
});

// Cases below are ported from expo-sqlite's hooks-test.ios.tsx (.vendors/expo @ origin/sdk-57)
// — coverage not already exercised above. The Suspense-fallback and error-boundary-with-Suspense
// cases are skipped: this file's harness config disables commit suspension
// (`maySuspendCommit: () => false`, `startSuspendingCommit`/`suspendInstance` are no-ops — see
// the harness header), so `<SQLiteProviderSuspense>`'s `use()` call cannot be driven to a real
// pending state through it; exercising that path needs the full renderer this file's own header
// says was deliberately not linked in. `deepEqual` is not ported either — it is an unexported
// implementation detail of `propsAreEqual` below, not part of the public surface, and its
// behavior is what the dedup test below observes from the outside.
describe('<SQLiteProvider> re-render dedup', () => {
  it('does not re-open the database for a structurally-equal props object, but does for a real change', () => {
    const harness = createHarness();
    openDatabaseAsyncMock.mockReturnValue(new Promise<IFakeDb>(noop));

    harness.mount(
      <SQLiteProvider
        databaseName=":memory:"
        options={{ enableChangeListener: true }}
      >
        {null}
      </SQLiteProvider>,
    );
    expect(openDatabaseAsyncMock).toHaveBeenCalledTimes(1);

    // A NEW options object, deep-equal to the previous one — must not reopen.
    harness.update(
      <SQLiteProvider
        databaseName=":memory:"
        options={{ enableChangeListener: true }}
      >
        {null}
      </SQLiteProvider>,
    );
    expect(openDatabaseAsyncMock).toHaveBeenCalledTimes(1);

    // Dropping `options` entirely is a real prop change — must reopen.
    harness.update(
      <SQLiteProvider databaseName=":memory:">{null}</SQLiteProvider>,
    );
    expect(openDatabaseAsyncMock).toHaveBeenCalledTimes(2);

    // A different `databaseName` is also a real prop change — must reopen.
    harness.update(
      <SQLiteProvider databaseName="test.db">{null}</SQLiteProvider>,
    );
    expect(openDatabaseAsyncMock).toHaveBeenCalledTimes(3);

    harness.unmount();
  });
});

describe('<SQLiteProvider> onInit', () => {
  // why: this package's own openDatabaseAsync already invokes onInit internally before
  // resolving (see the file header) — unlike upstream, the PROVIDER never calls onInit itself.
  // So the deviation-correct assertion is that the provider forwards it through untouched,
  // not that the provider invokes it with the resolved db.
  it('forwards onInit to openDatabaseAsync rather than invoking it itself', async () => {
    const pending = deferred<IFakeDb>();
    openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);
    const onInit = vi.fn();
    const harness = createHarness();

    harness.mount(
      <SQLiteProvider databaseName=":memory:" onInit={onInit}>
        {null}
      </SQLiteProvider>,
    );
    pending.resolve(fakeDatabase());
    await flush(pending.promise);

    expect(openDatabaseAsyncMock).toHaveBeenCalledWith(
      ':memory:',
      expect.objectContaining({ onInit }),
      undefined,
    );
    expect(onInit).not.toHaveBeenCalled();
    harness.unmount();
  });
});
