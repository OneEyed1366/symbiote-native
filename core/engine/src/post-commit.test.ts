// The post-commit seam (./post-commit.ts, re-exported from the engine barrel) is public API for one
// reason: it is the only "a commit just reached completeRoot" signal that means the SAME thing under
// every adapter. React commits synchronously inside its own commit phase while Vue / Svelte /
// Angular schedule completeRoot on a microtask, so each framework's after-render hook fires at a
// different point relative to the native commit, and anything timing the commit path across adapters
// would be comparing four different quantities under one name.
//
// The unregister half is tested as hard as the register half: a hook belonging to a screen rather
// than to the process must be able to stop, or a mounted-and-gone consumer runs after every commit
// for the rest of the session and holds its whole closure alive.

import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  registerPostCommit,
  setProp,
  unregisterPostCommit,
} from './index';

const fabric = installFabric();
const ROOT_TAG = 91;
const surface = createSurface(ROOT_TAG);
const host = createElement('RCTView');

beforeEach(() => fabric.reset());

describe('post-commit hooks', () => {
  it('runs a registered hook after a commit', () => {
    let runs = 0;
    const hook = (): void => {
      runs += 1;
    };
    registerPostCommit(hook);
    surface.appendChild(host);
    surface.commit();
    unregisterPostCommit(hook);

    expect(runs).toBeGreaterThan(0);
  });

  it('runs the hook after completeRoot, not before it', () => {
    let completeRootsAtHook = -1;
    const hook = (): void => {
      completeRootsAtHook = fabric.counts.completeRoot;
    };
    registerPostCommit(hook);
    setProp(host, 'opacity', 0.5);
    surface.commit();
    unregisterPostCommit(hook);

    // The whole point of the seam: by the time it runs, the native commit has landed and fresh
    // Fabric tags exist. A hook that fired earlier would time the mutation phase alone.
    expect(completeRootsAtHook).toBe(fabric.counts.completeRoot);
    expect(completeRootsAtHook).toBeGreaterThan(0);
  });

  it('stops running a hook once it is unregistered', () => {
    let runs = 0;
    const hook = (): void => {
      runs += 1;
    };
    registerPostCommit(hook);
    setProp(host, 'opacity', 0.6);
    surface.commit();
    const runsWhileRegistered = runs;

    unregisterPostCommit(hook);
    appendChild(host, createElement('RCTView'));
    surface.commit();

    expect(runsWhileRegistered).toBeGreaterThan(0);
    expect(runs).toBe(runsWhileRegistered);
  });

  it('unregistering a hook that was never registered is a no-op', () => {
    expect(() => unregisterPostCommit(() => undefined)).not.toThrow();
  });
});
