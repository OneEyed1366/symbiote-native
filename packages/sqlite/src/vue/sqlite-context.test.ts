// Co-located Vue-driven test for SQLiteProvider/useSQLiteContext.
//
// Deviation from this repo's usual Vue-adapter test pattern (packages/navigation's
// composables.test.ts, packages/clipboard's use-clipboard.test.ts): those mount through
// `@symbiote-native/vue`'s `mount()`/`unmount()` onto the Fabric fake-slot from
// `@symbiote-native/test-utils`. This package's own package.json intentionally does not declare
// either as a dependency (shared across five sibling adapter builds landing concurrently — see
// the package's top-of-file scope note), and this repo's pnpm-workspace.yaml deliberately does
// NOT hoist workspace packages to a shared root node_modules (`publicHoistPattern` covers only
// `*react-native*`), so neither package is resolvable from here without editing package.json.
// SQLiteProvider renders no native view of its own (only pass-through slot content), so a real
// Fabric mount buys nothing here anyway — a minimal `@vue/runtime-core` `createRenderer` (the
// same primitive `@symbiote-native/vue`'s own renderer is built on, and the shape of Vue's own
// `runtime-test`/`runtime-dom` packages) drives the exact same setup/watch/onUnmounted/provide
// lifecycle with no native dependency at all.

import { createRenderer, defineComponent, h } from '@vue/runtime-core';
import type { App, Component, RendererOptions } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLiteProvider, useSQLiteContext } from './sqlite-context';

type IFakeNode = {
  type: string;
  props: Record<string, unknown>;
  children: IFakeNode[];
  parent: IFakeNode | null;
  text?: string;
};

function createNode(type: string): IFakeNode {
  return { type, props: {}, children: [], parent: null };
}

const nodeOps: RendererOptions<IFakeNode, IFakeNode> = {
  createElement: tag => createNode(String(tag)),
  createText: text => {
    const node = createNode('#text');
    node.text = text;
    return node;
  },
  createComment: () => createNode('#comment'),
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (node, text) => {
    node.children = [];
    node.text = text;
  },
  insert: (child, parent, anchor) => {
    const index = anchor !== null ? parent.children.indexOf(anchor) : -1;
    if (index > -1) parent.children.splice(index, 0, child);
    else parent.children.push(child);
    child.parent = parent;
  },
  remove: child => {
    const parent = child.parent;
    if (parent === null) return;
    const index = parent.children.indexOf(child);
    if (index > -1) parent.children.splice(index, 1);
  },
  parentNode: node => node.parent,
  nextSibling: node => {
    const parent = node.parent;
    if (parent === null) return null;
    return parent.children[parent.children.indexOf(node) + 1] ?? null;
  },
  patchProp: (el, key, _prev, next) => {
    el.props[key] = next;
  },
};

const { createApp } = createRenderer<IFakeNode, IFakeNode>(nodeOps);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let currentApp: App | null = null;
let currentRoot: IFakeNode | null = null;

function mountRoot(
  RootComponent: Component,
  onError: (error: unknown) => void,
): IFakeNode {
  currentRoot = createNode('#root');
  currentApp = createApp(RootComponent);
  currentApp.config.errorHandler = onError;
  currentApp.mount(currentRoot);
  return currentRoot;
}

afterEach(() => {
  currentApp?.unmount();
  currentApp = null;
  currentRoot = null;
});

function findByType(root: IFakeNode, type: string): IFakeNode | undefined {
  for (const child of root.children) {
    if (child.type === type) return child;
    const nested = findByType(child, type);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

const closeAsyncMock = vi.fn(() => Promise.resolve());
function fakeDatabase(id: string) {
  return { id, closeAsync: closeAsyncMock };
}

const openDatabaseAsyncMock = vi.fn();
vi.mock('../core', () => ({
  openDatabaseAsync: (...args: unknown[]) => openDatabaseAsyncMock(...args),
}));

beforeEach(() => {
  openDatabaseAsyncMock.mockReset();
  closeAsyncMock.mockClear();
});

describe('SQLiteProvider / useSQLiteContext (Vue)', () => {
  describe('Positive', () => {
    // why: matches upstream's "render nothing until ready" contract — a consumer must never see
    // the slot mount before the database exists to hand it, or useSQLiteContext would resolve to
    // a database that isn't open yet.
    it('renders nothing while the database is still opening', async () => {
      let deferredResolve: ((db: unknown) => void) | undefined;
      openDatabaseAsyncMock.mockReturnValue(
        new Promise(resolve => {
          deferredResolve = resolve;
        }),
      );

      const root = mountRoot(
        defineComponent({
          setup: () => () =>
            h(SQLiteProvider, { databaseName: 'test.db' }, () =>
              h('symbiote-text', {}, 'child'),
            ),
        }),
        () => {},
      );
      await tick();

      expect(findByType(root, 'symbiote-text')).toBeUndefined();
      deferredResolve?.(fakeDatabase('db-1'));
      await tick();
    });

    // why: once open() resolves, the database must be reachable from the slot via
    // useSQLiteContext, and only then — proving provide()/render are sequenced together, not
    // provide-then-render-eagerly.
    it('provides the database and renders the slot once open resolves', async () => {
      const db = fakeDatabase('db-1');
      openDatabaseAsyncMock.mockResolvedValue(db);
      let captured: unknown;
      const ChildProbe = defineComponent(() => {
        captured = useSQLiteContext();
        return () => h('symbiote-text', {}, 'child');
      });

      const root = mountRoot(
        defineComponent({
          setup: () => () =>
            h(SQLiteProvider, { databaseName: 'test.db' }, () => h(ChildProbe)),
        }),
        () => {},
      );
      await tick();
      await tick();

      expect(findByType(root, 'symbiote-text')).toBeDefined();
      expect(captured).toBe(db);
      expect(openDatabaseAsyncMock).toHaveBeenCalledWith(
        'test.db',
        { onInit: undefined },
        undefined,
      );
    });

    // why: an unmounted provider must not keep the native handle open — a leaked handle keeps
    // the file locked with nobody left to close it.
    it('closes the database on unmount', async () => {
      const db = fakeDatabase('db-1');
      openDatabaseAsyncMock.mockResolvedValue(db);

      mountRoot(
        defineComponent({
          setup: () => () =>
            h(SQLiteProvider, { databaseName: 'test.db' }, () => null),
        }),
        () => {},
      );
      await tick();
      await tick();

      currentApp?.unmount();
      currentApp = null;
      await tick();

      expect(closeAsyncMock).toHaveBeenCalledTimes(1);
    });

    // why: onError must be called INSTEAD of an unhandled rejection — matches upstream's
    // `onError` escape hatch — and the slot must stay unrendered since no database ever opened.
    it('calls onError instead of throwing when opening fails and onError is provided', async () => {
      const failure = new Error('open failed');
      openDatabaseAsyncMock.mockRejectedValue(failure);
      const onError = vi.fn();

      const root = mountRoot(
        defineComponent({
          setup: () => () =>
            h(SQLiteProvider, { databaseName: 'test.db', onError }, () =>
              h('symbiote-text', {}, 'child'),
            ),
        }),
        () => {},
      );
      await tick();
      await tick();

      expect(onError).toHaveBeenCalledWith(failure);
      expect(findByType(root, 'symbiote-text')).toBeUndefined();
    });
  });

  describe('Negative', () => {
    // why: a component reading the database outside any provider must fail loudly at the call
    // site, matching upstream's `useSQLiteContext must be used within a <SQLiteProvider>`.
    it('useSQLiteContext throws when rendered outside a SQLiteProvider', () => {
      const OrphanScreen = defineComponent(() => {
        useSQLiteContext();
        return () => h('symbiote-text', {}, 'orphan');
      });
      const reportedError = vi.fn();

      mountRoot(OrphanScreen, error => reportedError(error));

      expect(reportedError).toHaveBeenCalled();
      expect(String(reportedError.mock.calls[0]?.[0])).toMatch(
        /useSQLiteContext must be used within a <SQLiteProvider>/,
      );
    });

    // why: matches upstream's default — with no onError, an open failure must propagate rather
    // than be swallowed. Vue routes an async watch callback's rejection through
    // app.config.errorHandler (see sqlite-context.ts's own comment on this), so a throw inside
    // the watcher IS the Vue-idiomatic rethrow, not a silently dropped rejection.
    it('propagates the error when opening fails and onError is omitted', async () => {
      const failure = new Error('open failed');
      openDatabaseAsyncMock.mockRejectedValue(failure);
      const reportedError = vi.fn();

      mountRoot(
        defineComponent({
          setup: () => () =>
            h(SQLiteProvider, { databaseName: 'test.db' }, () => null),
        }),
        error => reportedError(error),
      );
      await tick();
      await tick();

      expect(reportedError).toHaveBeenCalled();
      expect(String(reportedError.mock.calls[0]?.[0])).toMatch(/open failed/);
    });
  });
});
