// Smoke test for `SQLiteProvider` and `useSQLiteContext` over the real Svelte compiler and a
// real Fabric slot, mirroring `../react/sqlite-context.test.tsx` and its mocked module
// The `openDatabaseAsync` timing is controlled through deferred promises

// `@symbiote-native/svelte`, `@symbiote-native/engine` and `@symbiote-native/test-utils` are not
// dependencies of this package: `SQLiteProvider` renders no host primitive of its own
// They resolve through manual `node_modules` symlinks, like `react-reconciler` in the React twin

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { openDatabaseAsyncMock, closeAsyncMock } = vi.hoisted(() => ({
  openDatabaseAsyncMock: vi.fn(),
  closeAsyncMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('../core', () => ({ openDatabaseAsync: openDatabaseAsyncMock }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_820;
const fabric = installRecordingFabric();
const { appRoot, findLive } = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('sqlite-provider');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('sqlite-provider');
  vi.clearAllMocks();
  closeAsyncMock.mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

//#region Live-tree lookup, as `fabric.find()` returns a pre-clone node frozen at creation time
// Every assertion walks the live tree instead, as `findLiveByTestId` in
// `packages/navigation/src/svelte/fabric-tree.test-helper.ts` does

function findLiveByTestId(root: ISymbioteNode, testID: string) {
  return findLive(root, node => node.props.testID === testID);
}

//#endregion

type IDeferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): IDeferred<T> {
  const box: Pick<IDeferred<T>, 'resolve' | 'reject'> = {
    resolve: () => {},
    reject: () => {},
  };
  const promise = new Promise<T>((resolve, reject) => {
    box.resolve = resolve;
    box.reject = reject;
  });
  return { promise, resolve: box.resolve, reject: box.reject };
}

// A structural stand-in for the resolved database, as the provider only calls `closeAsync()`
// The typing of production code never sees this shape, so no cast is needed
type IFakeDb = { closeAsync: typeof closeAsyncMock };
function fakeDatabase(): IFakeDb {
  return { closeAsync: closeAsyncMock };
}

// Node only reports an unhandled rejection a macrotask after the promise settles, so the
// rejection + settle window has to run INSIDE `run()`. Copied (mechanism, not content) from
// packages/brightness/src/svelte/runes/use-permissions.test.ts's helper of the same name.
async function collectUnhandledRejections<T>(
  run: () => Promise<T>,
): Promise<[T, unknown[]]> {
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    const result = await run();
    await new Promise(resolve => setTimeout(resolve, 0));
    return [result, unhandled];
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

// Renders `db.closeAsync`'s typeof into its own accessibilityLabel — the only channel this
// black-box harness has into what the resolved context value actually is. A separate component
// (rather than an inline expression in the app source) so it mounts through the RUNTIME render
// tree under SQLiteProvider's `{@render children()}`, which is what makes context resolution see
// it (navigation-context.ts's header comment, verified against the real compiler there).
const CONSUMER_SOURCE = `<script lang="ts">
   import { useSQLiteContext } from './sqlite-context';
   const db = useSQLiteContext();
 </script>
 <symbiote-view p={{ testID: 'consumer', accessibilityLabel: typeof db.closeAsync }} />`;

function appSource(providerAttrs: string): string {
  return `<script lang="ts">
     import SQLiteProvider from './SQLiteProvider.svelte';
     import Consumer from './sqlite-provider-consumer.svelte';
   </script>
   <SQLiteProvider ${providerAttrs}><Consumer /></SQLiteProvider>`;
}

async function mountApp(providerAttrs: string): Promise<void> {
  const dir = __dirname;
  harness.compileSource(dir, 'sqlite-provider-consumer', CONSUMER_SOURCE);
  const app = harness.compileSource(
    dir,
    'sqlite-provider-app',
    appSource(providerAttrs),
  );
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

describe('<SQLiteProvider>', () => {
  describe('Positive', () => {
    it('renders nothing while the database is opening', async () => {
      const pending = deferred<IFakeDb>();
      openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);

      await mountApp('databaseName="pending.db"');

      expect(findLiveByTestId(appRoot(), 'consumer')).toBeUndefined();

      pending.resolve(fakeDatabase());
      await tick();
      await tick();
    });

    it('provides the database and renders children once open resolves', async () => {
      const pending = deferred<IFakeDb>();
      openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);

      await mountApp('databaseName="ready.db"');
      pending.resolve(fakeDatabase());
      await tick();
      await tick();

      expect(
        findLiveByTestId(appRoot(), 'consumer')?.props?.accessibilityLabel,
      ).toBe('function');
    });

    it('closes the database on unmount', async () => {
      const pending = deferred<IFakeDb>();
      openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);

      await mountApp('databaseName="closed.db"');
      pending.resolve(fakeDatabase());
      await tick();
      await tick();

      unmount(ROOT_TAG);
      await tick();

      expect(closeAsyncMock).toHaveBeenCalledTimes(1);
    });

    it('calls onError instead of propagating the failure when open fails', async () => {
      const pending = deferred<IFakeDb>();
      openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);

      const [, unhandled] = await collectUnhandledRejections(async () => {
        const app = harness.compileSource(
          __dirname,
          'sqlite-provider-onerror-app',
          `<script lang="ts">
             import SQLiteProvider from './SQLiteProvider.svelte';
             let message = $state('none');
           </script>
           <symbiote-view p={{ testID: 'error-sink', accessibilityLabel: message }} />
           <SQLiteProvider databaseName="broken.db" onError={(error: Error) => { message = error.message; }} />`,
        );
        mount(ROOT_TAG, await loadComponent(app));
        await tick();
        pending.reject(new Error('disk full'));
        await tick();
        await tick();
      });

      expect(unhandled).toEqual([]);
      expect(
        findLiveByTestId(appRoot(), 'error-sink')?.props?.accessibilityLabel,
      ).toBe('disk full');
    });

    it('lets the open failure propagate as an unhandled rejection when no onError is given', async () => {
      const pending = deferred<IFakeDb>();
      openDatabaseAsyncMock.mockReturnValueOnce(pending.promise);

      const [, unhandled] = await collectUnhandledRejections(async () => {
        await mountApp('databaseName="broken-unhandled.db"');
        pending.reject(new Error('disk full'));
        await tick();
        await tick();
      });

      expect(unhandled).toHaveLength(1);
      const [reason] = unhandled;
      expect(reason instanceof Error && reason.message).toBe('disk full');
    });
  });

  describe('useSQLiteContext', () => {
    it('throws when used outside a <SQLiteProvider>', async () => {
      const app = harness.compileSource(
        __dirname,
        'sqlite-context-bare',
        `<script lang="ts">
           import { useSQLiteContext } from './sqlite-context';
           useSQLiteContext();
         </script>`,
      );
      const Bare = await loadComponent(app);

      expect(() => mount(ROOT_TAG, Bare)).toThrow(
        'useSQLiteContext must be used within a <SQLiteProvider>',
      );
    });
  });
});
