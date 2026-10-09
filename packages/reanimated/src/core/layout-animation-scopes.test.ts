import { createLiveTree } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  getNativeTag,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import * as core from 'react-native-reanimated/src/core';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { claimLayoutAnimationProps } from './layout-animations';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

vi.mock('react-native-reanimated/src/core', async importOriginal => ({
  ...(await importOriginal<typeof core>()),
  setShouldAnimateExitingForTag: vi.fn(),
}));

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const update = vi.mocked(updateLayoutAnimations);
const setShouldAnimateExiting = vi.mocked(core.setShouldAnimateExitingForTag);
let nextRootTag = 18_000;
const releases: Array<() => void> = [];

beforeEach(() => {
  update.mockClear();
  setShouldAnimateExiting.mockClear();
  releases.push(claimLayoutAnimationProps());
});

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });

function viewWith(props: Record<string, unknown> = {}): ISymbioteNode {
  const node = createElement('RCTView');
  for (const [key, value] of Object.entries(props)) {
    routeProp(node, key, value);
  }
  return node;
}

function surfaceWith(root: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(root);
  return surface;
}

function cancelled(): unknown[] {
  return update.mock.calls
    .filter(([, type, config]) => {
      return type === LayoutAnimationType.ENTERING && config === undefined;
    })
    .map(([id]) => id);
}

describe('a scope that skips entering', () => {
  it('cancels the entering animation of a node under it that was made in the same batch', () => {
    const child = viewWith({ entering: fade });
    const scope = viewWith({ layoutAnimationScope: { skipEntering: true } });
    appendChild(scope, child);

    surfaceWith(scope).commit();

    const registered = update.mock.calls[0]?.[0];
    expect(cancelled()).toEqual([registered]);
  });

  it('takes the native id off the node it cancelled', () => {
    const child = viewWith({ entering: fade });
    const scope = viewWith({ layoutAnimationScope: { skipEntering: true } });
    appendChild(scope, child);

    surfaceWith(scope).commit();

    expect(Object.hasOwn(live.nodeOf(child).payload, 'nativeID')).toBe(false);
  });

  it('reaches a node further down, not only a direct child', () => {
    const grandchild = viewWith({ entering: fade });
    const child = viewWith();
    const scope = viewWith({ layoutAnimationScope: { skipEntering: true } });
    appendChild(child, grandchild);
    appendChild(scope, child);

    surfaceWith(scope).commit();

    expect(cancelled()).toHaveLength(1);
  });

  it('lets a node that mounts later animate, once the scope has committed', () => {
    const scope = viewWith({ layoutAnimationScope: { skipEntering: true } });
    surfaceWith(scope).commit();
    const later = viewWith({ entering: fade });

    appendChild(scope, later);
    const surface = surfaceWith(viewWith());
    surface.commit();

    expect(cancelled()).toEqual([]);
  });
});

describe('a scope that is given its props again', () => {
  it('does not become new, so a node that mounts under it later still animates', () => {
    const scope = viewWith({ layoutAnimationScope: { skipEntering: true } });
    surfaceWith(scope).commit();

    routeProp(scope, 'layoutAnimationScope', { skipEntering: true });
    const later = viewWith({ entering: fade });
    appendChild(scope, later);
    surfaceWith(viewWith()).commit();

    expect(cancelled()).toEqual([]);
  });

  it('skips exiting by the props it has when it leaves, not the ones it was made with', () => {
    const child = viewWith();
    const scope = viewWith({ layoutAnimationScope: { skipExiting: true } });
    appendChild(scope, child);
    const root = viewWith();
    appendChild(root, scope);
    const surface = surfaceWith(root);
    surface.commit();

    routeProp(scope, 'layoutAnimationScope', { skipExiting: false });
    removeChild(root, scope);
    surface.commit();

    expect(setShouldAnimateExiting.mock.calls).toEqual([
      [getNativeTag(child), true],
    ]);
  });
});

describe('a scope that does not skip entering', () => {
  it('leaves the entering animation of a node under it alone', () => {
    const child = viewWith({ entering: fade });
    const scope = viewWith({ layoutAnimationScope: { skipEntering: false } });
    appendChild(scope, child);

    surfaceWith(scope).commit();

    expect(cancelled()).toEqual([]);
  });

  it('stays out of the committed payload', () => {
    const scope = viewWith({ layoutAnimationScope: { skipEntering: false } });

    surfaceWith(scope).commit();

    expect(
      Object.hasOwn(live.nodeOf(scope).payload, 'layoutAnimationScope'),
    ).toBe(false);
  });
});

describe('a scope that skips exiting', () => {
  it('tells native not to animate its children out when it leaves the tree', () => {
    const first = viewWith();
    const second = viewWith();
    const scope = viewWith({ layoutAnimationScope: { skipExiting: true } });
    appendChild(scope, first);
    appendChild(scope, second);
    const root = viewWith();
    appendChild(root, scope);
    const surface = surfaceWith(root);
    surface.commit();

    removeChild(root, scope);
    surface.commit();

    expect(setShouldAnimateExiting).toHaveBeenCalledWith(
      getNativeTag(first),
      false,
    );
    expect(setShouldAnimateExiting).toHaveBeenCalledWith(
      getNativeTag(second),
      false,
    );
  });

  it('does nothing while it stays in the tree', () => {
    const scope = viewWith({ layoutAnimationScope: { skipExiting: true } });
    appendChild(scope, viewWith());

    surfaceWith(scope).commit();

    expect(setShouldAnimateExiting).not.toHaveBeenCalled();
  });
});
