// The sticky pin rides the UI THREAD, like every wrapper's ScrollView already does.
//
// WHY THIS FILE EXISTS. `sticky.test.ts` proves the pin's math and its registration; neither can
// see WHERE the offset comes from, because a JS-fed value and a natively-fed one produce the same
// committed transform in a headless run. The difference is only visible on a device — and it was:
// during a flick the header was not painted at all and snapped into place once scrolling stopped,
// which is the JS thread being the animation's clock.
//
// The behavior used to hardcode `nativeStickyAvailable: false` and feed `scrollValue` from its own
// `onScroll` listener. Every adapter's wrapper calls `attachStickyScroll` instead
// (react `useNativeStickyScrollAttach`, solid, angular, svelte), so this was the wrapper fold the
// tag path silently lost — the sixth surface of `.claude/rules/adapter-parity-audit.md`, with a
// native attach in place of a prop fold.
//
// Both arms are here on purpose: "no native call" is produced equally by a correct JS fallback and
// by a probe that never ran, and only the positive arm on the same harness tells them apart.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '../../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  getNativeTag,
  removeChild,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { registerScrollViewBehavior } from './index';
import { SCROLL_VIEW_TAG } from './shared';
import { STICKY_HEADER_TAG } from './sticky';

const fabric = installFabric();
let nextRootTag = 9860;

interface INativeCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

let nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

// Only the two event methods are recorded by name; the rest of the surface has to be present or
// the module reads as unavailable and the whole point of the positive arm is lost.
function installNativeAnimated(): void {
  const surface = [
    'createAnimatedNode',
    'connectAnimatedNodes',
    'disconnectAnimatedNodes',
    'connectAnimatedNodeToView',
    'disconnectAnimatedNodeFromView',
    'restoreDefaultValues',
    'dropAnimatedNode',
    'startAnimatingNode',
    'stopAnimation',
    'setAnimatedNodeValue',
    'setAnimatedNodeOffset',
    'flattenAnimatedNodeOffset',
    'extractAnimatedNodeOffset',
    'startListeningToAnimatedNodeValue',
    'stopListeningToAnimatedNodeValue',
    'getValue',
    'addAnimatedEventToView',
    'removeAnimatedEventFromView',
  ];
  const module: Record<string, unknown> = {};
  for (const name of surface) module[name] = record(name);
  Object.assign(globalThis, {
    nativeModuleProxy: { NativeAnimatedTurboModule: module },
  });
}

function removeNativeAnimated(): void {
  Reflect.deleteProperty(globalThis, 'nativeModuleProxy');
}

function callsTo(method: string): readonly INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function mountSticky(): {
  owner: ISymbioteNode;
  header: ISymbioteNode;
  commit: () => void;
} {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const owner = createElement(
    descriptorFor(SCROLL_VIEW_TAG).component,
    false,
    SCROLL_VIEW_TAG,
  );
  const header = createElement(
    descriptorFor(STICKY_HEADER_TAG).component,
    false,
    STICKY_HEADER_TAG,
  );
  appendChild(header, createElement('RCTText'));
  appendChild(owner, header);
  appendChild(root, owner);
  surface.commit();
  return { owner, header, commit: () => surface.commit() };
}

beforeEach(() => {
  nativeCalls = [];
  registerScrollViewBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  removeNativeAnimated();
  fabric.reset();
});

describe('the sticky scroll offset is attached natively', () => {
  // FIRST on purpose. `isNativeAnimatedAvailable` caches the module once it has resolved one, and
  // never re-probes, so a fake installed by any earlier case in this file would still be live here
  // — the negative arm has to run before the module has ever existed.
  it('makes no native call at all without the module', () => {
    removeNativeAnimated();
    mountSticky();

    expect(callsTo('addAnimatedEventToView')).toHaveLength(0);
    expect(nativeCalls).toEqual([]);
  });

  it('attaches onScroll to the shared value at the scroll view s tag', () => {
    installNativeAnimated();
    const { owner } = mountSticky();

    const attaches = callsTo('addAnimatedEventToView');
    expect(attaches).toHaveLength(1);
    expect(attaches[0]?.args[0]).toBe(getNativeTag(owner));
    expect(attaches[0]?.args[1]).toBe('onScroll');
  });

  it('detaches when the last sticky header leaves', () => {
    installNativeAnimated();
    const { owner, header, commit } = mountSticky();
    expect(callsTo('addAnimatedEventToView')).toHaveLength(1);

    // `removeChild` only NOMINATES the behavior for teardown; the commit sweep is what runs it.
    removeChild(owner, header);
    commit();

    expect(callsTo('removeAnimatedEventFromView')).toHaveLength(1);
  });
});
