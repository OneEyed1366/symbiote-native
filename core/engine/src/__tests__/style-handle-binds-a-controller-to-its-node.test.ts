import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  registerStyleHandleClaim,
  routeProp,
} from '../index';
import { takeBatch } from '../mutation-buffer';
import { setTreeHost, treeHost } from '../tree-host';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 9_900;

type IHandle = { readonly initial: Record<string, unknown> };

function isHandle(part: unknown): part is IHandle {
  return typeof part === 'object' && part !== null && 'initial' in part;
}

const releases: Array<() => void> = [];

// Hands out a release spy per attach, so a test can tell which binding was let go
function claimingHandles() {
  const released = new Map<IHandle, ReturnType<typeof vi.fn>>();
  const attach = vi.fn((_node: unknown, handle: IHandle) => {
    const release = vi.fn();
    released.set(handle, release);
    return release;
  });
  releases.push(
    registerStyleHandleClaim({
      isHandle,
      initialOf: handle => (isHandle(handle) ? handle.initial : undefined),
      attach: (node, handle) =>
        isHandle(handle) ? attach(node, handle) : undefined,
    }),
  );
  return { attach, released };
}

function mountedNode(style?: unknown) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  if (style !== undefined) routeProp(node, 'style', style);
  surface.appendChild(node);
  return { surface, node };
}

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

describe('an animated style handle in a node style', () => {
  it('publishes what the claim says the host sees in its place', () => {
    claimingHandles();
    const { surface, node } = mountedNode([
      { width: 10 },
      { initial: { opacity: 0.5 } },
    ]);
    surface.commit();

    const committed = live.nodeOf(node);
    expect(committed.payload.width).toBe(10);
    expect(committed.payload.opacity).toBe(0.5);
    expect(Object.hasOwn(committed.payload, 'initial')).toBe(false);
  });

  it('is bound only once the node has committed', () => {
    const { attach } = claimingHandles();
    const handle: IHandle = { initial: { opacity: 1 } };
    const { surface, node } = mountedNode(handle);

    expect(attach).not.toHaveBeenCalled();
    surface.commit();

    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(node, handle);
  });

  it('is bound straight away on a node that already committed', () => {
    const { attach } = claimingHandles();
    const { surface, node } = mountedNode();
    surface.commit();

    const handle: IHandle = { initial: { opacity: 1 } };
    routeProp(node, 'style', handle);

    expect(attach).toHaveBeenCalledWith(node, handle);
  });

  it('is bound once when the same handle is written again', () => {
    const { attach } = claimingHandles();
    const handle: IHandle = { initial: { opacity: 1 } };
    const { surface, node } = mountedNode(handle);
    surface.commit();

    routeProp(node, 'style', [handle, { width: 4 }]);
    routeProp(node, 'style', handle);

    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('is let go and replaced when another handle takes its place', () => {
    const { attach, released } = claimingHandles();
    const first: IHandle = { initial: { opacity: 1 } };
    const second: IHandle = { initial: { opacity: 0 } };
    const { surface, node } = mountedNode(first);
    surface.commit();

    routeProp(node, 'style', second);

    expect(released.get(first)).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenLastCalledWith(node, second);
  });

  it('is let go when the style stops carrying it', () => {
    const { released } = claimingHandles();
    const handle: IHandle = { initial: { opacity: 1 } };
    const { surface, node } = mountedNode(handle);
    surface.commit();

    routeProp(node, 'style', { width: 4 });

    expect(released.get(handle)).toHaveBeenCalledTimes(1);
  });

  it('is never bound when it is dropped before the node commits', () => {
    const { attach } = claimingHandles();
    const { surface, node } = mountedNode({ initial: { opacity: 1 } });

    routeProp(node, 'style', { width: 4 });
    surface.commit();

    expect(attach).not.toHaveBeenCalled();
  });

  it('is let go when its node leaves the tree', () => {
    const { released } = claimingHandles();
    const handle: IHandle = { initial: { opacity: 1 } };
    const { surface, node } = mountedNode(handle);
    surface.commit();

    surface.removeChild(node);
    surface.commit();

    expect(released.get(handle)).toHaveBeenCalledTimes(1);
  });

  it('is left alone for a style that holds no handle', () => {
    const { attach } = claimingHandles();
    const { surface } = mountedNode({ width: 10 });
    surface.commit();

    expect(attach).not.toHaveBeenCalled();
  });

  describe('merged with plain style keys into one record by the framework', () => {
    const MARKER = 'wornHandle';

    // A framework that flattens a style array copies every key of the handle into one record
    function merged(handle: IHandle, plain: Record<string, unknown>) {
      return { ...plain, ...handle, [MARKER]: handle };
    }

    function claimingMergedHandles() {
      const attach = vi.fn();
      releases.push(
        registerStyleHandleClaim({
          isHandle,
          initialOf: handle => (isHandle(handle) ? handle.initial : undefined),
          unwrap: record => {
            const handle: unknown = Reflect.get(record, MARKER);
            if (!isHandle(handle)) return undefined;
            const rest = Object.fromEntries(
              Object.entries(record).filter(
                ([key]) => key !== MARKER && !(key in handle),
              ),
            );
            return { handle, rest };
          },
          attach: (node, handle) => attach(node, handle),
        }),
      );
      return { attach };
    }

    it('keeps the plain keys, shows the starting values and leaves the handle keys out', () => {
      claimingMergedHandles();
      const handle: IHandle = { initial: { opacity: 0.5 } };
      const { surface, node } = mountedNode(merged(handle, { width: 10 }));
      surface.commit();

      const { payload } = live.nodeOf(node);
      expect(payload.width).toBe(10);
      expect(payload.opacity).toBe(0.5);
      expect(Object.hasOwn(payload, 'initial')).toBe(false);
      expect(Object.hasOwn(payload, MARKER)).toBe(false);
    });

    it('binds the handle itself, not the record that carried it', () => {
      const { attach } = claimingMergedHandles();
      const handle: IHandle = { initial: { opacity: 0.5 } };
      const { surface, node } = mountedNode(merged(handle, { width: 10 }));

      surface.commit();

      expect(attach).toHaveBeenCalledWith(node, handle);
    });

    it('is bound once when a new record carries the same handle', () => {
      const { attach } = claimingMergedHandles();
      const handle: IHandle = { initial: { opacity: 0.5 } };
      const { surface, node } = mountedNode(merged(handle, { width: 10 }));
      surface.commit();

      routeProp(node, 'style', merged(handle, { width: 20 }));

      expect(attach).toHaveBeenCalledTimes(1);
    });
  });

  describe('and its starting values', () => {
    function recordsWithOpacity(batchValues: readonly unknown[]) {
      return batchValues
        .filter(value => Array.isArray(value))
        .flat()
        .filter(
          part =>
            typeof part === 'object' && part !== null && 'opacity' in part,
        );
    }

    function registerCard() {
      registerRules([
        {
          tokens: ['card'],
          specificity: [0, 1, 0],
          order: 0,
          style: { padding: 10 },
        },
      ]);
    }

    afterEach(() => clearGlobalStyles());

    it('go to the host on the first publish only', () => {
      claimingHandles();
      registerCard();
      const { surface, node } = mountedNode();
      surface.commit();
      takeBatch();

      routeProp(node, 'style', { initial: { opacity: 0.5 } });
      expect(recordsWithOpacity(takeBatch().values).length).toBe(1);

      routeProp(node, 'className', 'card');

      expect(recordsWithOpacity(takeBatch().values).length).toBe(0);
    });

    it('are not handed out again for a handle that replaces the first', () => {
      claimingHandles();
      registerCard();
      const { surface, node } = mountedNode({ initial: { opacity: 0.5 } });
      surface.commit();
      takeBatch();

      routeProp(node, 'style', { initial: { opacity: 0.9 } });

      expect(recordsWithOpacity(takeBatch().values).length).toBe(0);
    });
  });

  it('stays in the payload once the claim is released', () => {
    const release = registerStyleHandleClaim({
      isHandle,
      initialOf: () => ({}),
      attach: () => undefined,
    });
    release();

    const { surface, node } = mountedNode({ initial: { opacity: 1 } });
    surface.commit();

    expect(Object.hasOwn(live.nodeOf(node).payload, 'initial')).toBe(true);
  });

  describe('when the Fabric family of its node is re-created', () => {
    // The host answers with a family generation that a test moves by hand
    function withGeneration(read: () => number | undefined, body: () => void) {
      const real = treeHost();
      if (real === undefined) throw new Error('no host installed');
      setTreeHost({
        ...real,
        committedRecordOf: handle => {
          const record = real.committedRecordOf(handle);
          return record === undefined
            ? undefined
            : { ...record, familyGeneration: read() };
        },
      });
      try {
        body();
      } finally {
        setTreeHost(real);
      }
    }

    it('is let go and bound again after the commit that changed it', () => {
      const { attach, released } = claimingHandles();
      const handle: IHandle = { initial: { opacity: 1 } };
      let generation = 1;

      withGeneration(
        () => generation,
        () => {
          const { surface, node } = mountedNode(handle);
          surface.commit();
          const firstRelease = released.get(handle);

          generation = 2;
          surface.commit();

          expect(firstRelease).toHaveBeenCalledTimes(1);
          expect(attach).toHaveBeenCalledTimes(2);
          expect(attach).toHaveBeenLastCalledWith(node, handle);
        },
      );
    });

    it('stays bound while the generation holds', () => {
      const { attach } = claimingHandles();
      withGeneration(
        () => 1,
        () => {
          const { surface } = mountedNode({ initial: { opacity: 1 } });
          surface.commit();
          surface.commit();

          expect(attach).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('stays bound on a host that reports no generation', () => {
      const { attach } = claimingHandles();
      withGeneration(
        () => undefined,
        () => {
          const { surface } = mountedNode({ initial: { opacity: 1 } });
          surface.commit();
          surface.commit();

          expect(attach).toHaveBeenCalledTimes(1);
        },
      );
    });
  });
});

describe('a claim that prepares the node a handle is worn by', () => {
  function claimingWithPrepare() {
    const prepare = vi.fn();
    releases.push(
      registerStyleHandleClaim({
        isHandle,
        initialOf: handle => (isHandle(handle) ? handle.initial : undefined),
        attach: () => undefined,
        prepare,
      }),
    );
    return prepare;
  }

  it('prepares the node once for a handle, before the node commits', () => {
    const prepare = claimingWithPrepare();
    const handle = { initial: { opacity: 1 } };
    const { surface, node } = mountedNode(handle);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(node, handle);

    surface.commit();
    routeProp(node, 'style', handle);
    surface.commit();

    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('prepares the node again for a handle that replaces it', () => {
    const prepare = claimingWithPrepare();
    const { surface, node } = mountedNode({ initial: { opacity: 1 } });
    surface.commit();

    routeProp(node, 'style', { initial: { opacity: 0 } });
    surface.commit();

    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
