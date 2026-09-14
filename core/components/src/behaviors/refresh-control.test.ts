// RefreshControl as an engine-node behavior. Two independent claims, and the first is the one the
// tier audit filed this primitive as impossible over.
//
// 1. PLACEMENT. `.claude/rules/host-primitive-tier.md`'s "SECOND disqualifier" reads: a host
//    behavior is per-NODE, so it cannot own a decision another component makes about where that
//    node goes — and RefreshControl's position IS chosen by the ScrollView, differently per
//    platform. That is no longer a disqualifier: the ScrollView states the placement as data
//    (`claimedChildren`) and the ENGINE moves the node. Both platforms are asserted below on the
//    committed tree, with a bare `refresh-control` node the behavior is attached to — no wrapper
//    anywhere — which is the whole point.
//
// 2. THE CONTROLLED HANDSHAKE. Native spins on the gesture before JS approves; when the app's
//    `refreshing` disagrees with what native last reported, JS commands it back down
//    (`RefreshControl.js:145-166`). Asserted on the recorder's `commands`, never on `node.props`.
//
// HEADLESS NOTE, the same one `scroll-view/wrap-android.test.ts` records: the intrinsic ->
// native-name table resolves to the iOS build under vitest, so the refresh node serializes as
// `PullToRefreshView` on both platforms rather than `AndroidSwipeRefreshLayout`. Every placement
// assertion keys off node ROLE — who is whose parent, in which order — never the native name, so
// the substitution does not weaken them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names/index.ios';
import {
  registerRefreshControlBehavior,
  REFRESH_CONTROL_TAG,
} from './refresh-control';
import { registerScrollViewBehavior as registerIosScrollView } from './scroll-view/index.ios';
import { registerScrollViewBehavior as registerAndroidScrollView } from './scroll-view/index.android';
import { SCROLL_VIEW_TAG } from './scroll-view/shared';

const fabric = installFabric();
let nextRootTag = 9700;

// PRODUCTION SHAPE: an adapter resolves the intrinsic through `descriptorFor` and hands
// `createElement` the FABRIC name plus the tag. Passing the TAG as the name would make the
// registry key match by accident and leave every case here green over a registration that can
// never fire in an app (`.claude/rules/test-harness-false-greens.md` §11).
const REFRESH = descriptorFor(REFRESH_CONTROL_TAG).component;
const SCROLL = descriptorFor(SCROLL_VIEW_TAG).component;
const CONTENT = descriptorFor('scroll-content').component;

function makeRefresh(): ISymbioteNode {
  return createElement(REFRESH, false, REFRESH_CONTROL_TAG);
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined) {
    throw new Error(
      `no "${name}" listener installed — the behavior did not attach`,
    );
  }
  return listener;
}

function refreshEvent(node: ISymbioteNode): ISymbioteEvent {
  return {
    type: 'topRefresh',
    target: node,
    currentTarget: node,
    nativeEvent: {},
    stopPropagation: () => {},
  };
}

function commandsNamed(
  name: string,
): ReadonlyArray<{ args: readonly unknown[] }> {
  return fabric.commands.filter(entry => entry.commandName === name);
}

// A prop write requested from an event handler publishes on the microtask boundary, and so does
// the behavior's own deferred divergence check — both are stale until this resolves.
const flush = (): Promise<void> => Promise.resolve();

beforeEach(() => {
  fabric.reset();
  registerRefreshControlBehavior();
});

afterEach(() => {
  clearHostBehaviors();
});

describe('placement — chosen by the ScrollView, moved by the engine', () => {
  // Mounts the shape every adapter builds: the app's children go on the scroll view, and the
  // refresh control is one of them. Nothing here knows which platform is registered.
  function mountScrollView(): {
    refresh: ISymbioteNode;
    commit: () => IFakeNode;
  } {
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);
    const scroll = createElement(SCROLL, false, SCROLL_VIEW_TAG);
    const refresh = makeRefresh();
    // Children BEFORE the owner is attached — the order every adapter uses, and the one that
    // makes the owner unattached at claim time.
    appendChild(scroll, refresh);
    appendChild(scroll, createElement('RCTImageView'));
    appendChild(root, scroll);
    return {
      refresh,
      commit: () => {
        surface.commit();
        const latest = fabric.committed[fabric.committed.length - 1];
        const app = latest?.children[0]?.children[0];
        if (app === undefined)
          throw new Error('nothing committed under the root');
        return app;
      },
    };
  }

  it('iOS: commits the control as a SIBLING before the content view', () => {
    registerIosScrollView();
    const { commit } = mountScrollView();

    expect(fabric.serialize([commit()])).toBe(
      `${SCROLL}(${REFRESH}${CONTENT}(RCTImageView))`,
    );
  });

  it('Android: commits the control as the scroll view PARENT', () => {
    registerAndroidScrollView();
    const { commit } = mountScrollView();

    expect(fabric.serialize([commit()])).toBe(
      `${REFRESH}(${SCROLL}(${CONTENT}(RCTImageView)))`,
    );
  });

  // The claim is keyed on the child's FABRIC name and consulted only for children of a ScrollView,
  // so a control mounted anywhere else is an ordinary child. Without this the two platform cases
  // above would pass equally if the engine were moving every refresh-control it ever saw.
  it('leaves the control alone outside a ScrollView, on both platforms', () => {
    registerAndroidScrollView();
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);
    appendChild(root, makeRefresh());
    surface.commit();

    const latest = fabric.committed[fabric.committed.length - 1];
    const app = latest?.children[0]?.children[0];
    expect(fabric.serialize([app!])).toBe(REFRESH);
  });
});

describe('the controlled handshake', () => {
  // Returns the surface as well as the node: a prop write alone proves nothing about `afterCommit`,
  // which fires only on a commit that changed something. Two cases below were green over a mirror
  // seeded wrong until they started committing — the break-test caught it, not the run.
  function mountAlone(props: Readonly<Record<string, unknown>> = {}): {
    node: ISymbioteNode;
    commit: () => void;
  } {
    const surface = createSurface((nextRootTag += 1));
    const node = makeRefresh();
    for (const key of Object.keys(props)) routeProp(node, key, props[key]);
    surface.appendChild(node);
    surface.commit();
    return { node, commit: () => surface.commit() };
  }

  it('calls the app listener the adapter wrote as onRefresh', () => {
    const onRefresh = vi.fn();
    const { node } = mountAlone({ refreshing: false, onRefresh });

    listenerOf(node, 'refresh')(refreshEvent(node));

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  // why: THE product bug on four of five adapters. Native spun up on the gesture; the app's handler
  // left `refreshing` false, so nothing re-commits and the spinner has no other way back down.
  it('commands native back down when the handler leaves refreshing false', async () => {
    const { node } = mountAlone({ refreshing: false, onRefresh: () => {} });

    listenerOf(node, 'refresh')(refreshEvent(node));
    await flush();

    expect(
      commandsNamed('setNativeRefreshing').map(entry => entry.args),
    ).toEqual([[false]]);
  });

  it('sends nothing when the handler accepts and flips refreshing to true', async () => {
    const { node } = mountAlone({ refreshing: false });
    routeProp(node, 'onRefresh', () => routeProp(node, 'refreshing', true));

    listenerOf(node, 'refresh')(refreshEvent(node));
    await flush();

    expect(commandsNamed('setNativeRefreshing')).toEqual([]);
  });

  // why: the mirror is ABSENT until native reports, not `false`. An app driving the spinner on its
  // own initiative must not be corrected against a value native never claimed — which is what a
  // `false` seed would do here. The COMMIT is what makes this assertion mean anything: without it
  // `afterCommit` never runs and the row is green under any mirror at all.
  it('sends nothing for an app-driven flip with no preceding gesture', async () => {
    const { node, commit } = mountAlone({ refreshing: false });
    routeProp(node, 'refreshing', true);
    commit();
    await flush();

    expect(commandsNamed('setNativeRefreshing')).toEqual([]);
  });

  // why: the case the deferred check CANNOT cover, and the only reason `afterCommit` is registered.
  // Vue, Solid and Angular schedule their own updates on the microtask queue too, so an accepting
  // app's write can land AFTER the check — which then reads a stale `false` and stops a spinner the
  // app wanted running. The commit that carries the app's value is the beat that repairs it.
  it('repairs a snap-back the app contradicts on a later commit', async () => {
    const { node, commit } = mountAlone({
      refreshing: false,
      onRefresh: () => {},
    });

    listenerOf(node, 'refresh')(refreshEvent(node));
    await flush();

    routeProp(node, 'refreshing', true);
    commit();

    expect(
      commandsNamed('setNativeRefreshing').map(entry => entry.args),
    ).toEqual([[false], [true]]);
  });
});
