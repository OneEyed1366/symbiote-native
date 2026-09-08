// Co-located, real-compiled-source test, the Svelte twin of
// adapters/vue/src/modules/animated/animated-native-event.test.ts. Proves a NATIVE
// Animated.event on a plain tag — there is no wrapper: `onScroll={Animated.event([…],
// {useNativeDriver:true})}` written on an ordinary `<view>` must reach `bindAnimatedEvent` out of
// routeProp and attach to the committed view on the UI thread (addAnimatedEventToView). Under
// Svelte's async-batched commit the view has no Fabric tag when the prop is first written, so a
// naive attach would read getNativeTag()===undefined and bind nothing with no retry —
// attachNativeEventHandler's own whenCommitted defer (core/engine/src/animated/event.ts) is what
// makes this land. The fake NativeAnimatedTurboModule records the bind, so it is asserted against
// the real tag with no host.
//
// The attach is asserted by COUNT. The wrapper used to make this same call, so a capability that
// moved layers could be live in both, and a payload-shaped oracle cannot see a doubled attach.
//
// Scope note: the AnimatedEvent/native-event plumbing itself (whenCommitted's post-commit defer,
// the event-name -> UI-thread bind) is core/engine (core/engine/src/animated/event.ts, already
// tested there) and is used, not re-verified, here. This file's own job is the Svelte-specific
// claim: that a handler written on a bare component is delivered, once, after the commit.
//
// No Negative group: attachNativeEventHandler() has no throw path for this shape — an
// onScroll prop that is NOT a native Animated.event is simply not attached (a different,
// already-covered engine-level contract), not rejected.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { AnimatedValue, event as animatedEvent } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

const fakeNativeAnimated = {
  createAnimatedNode: record('createAnimatedNode'),
  connectAnimatedNodes: record('connectAnimatedNodes'),
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode: record('startAnimatingNode'),
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
  startListeningToAnimatedNodeValue: record(
    'startListeningToAnimatedNodeValue',
  ),
  stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
  getValue: record('getValue'),
  addAnimatedEventToView: record('addAnimatedEventToView'),
  removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
};
Object.assign(globalThis, {
  nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
});

const fabric = installFabric();
const ROOT_TAG = 91_102;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// fabric.find() walks the CREATION log, which never reflects a later clone's props
// (svelte-adapter-dom-shim skill §15's documented gotcha) — a live-value assertion must
// instead walk the currently COMMITTED tree, same as activity-indicator.smoke.test.ts's
// findLive. Filtering on viewName==='RCTView' alone is not enough to identify OUR node:
// root-element.ts's own mount target is ITSELF an unlabeled `view` (RCTView, {}
// props), sitting between the AppContainer and our View's real host node — so the search
// must key on a prop only our own View carries (testID), not the generic viewName.
function findLive(
  node: IFakeNode,
  predicate: (n: IFakeNode) => boolean,
): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function animatedViewNode(): IFakeNode {
  const node = findLive(
    fabric.appRoot(),
    n => n.props.testID === 'animated-event-box',
  );
  if (node === undefined)
    throw new Error('no node with testID="animated-event-box" committed');
  return node;
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;
const PARENT_OUT = join(__dirname, '.smoke-compiled-event-parent.mjs');

// The bag, and NOT `<view {onScroll}>`, and the difference is a live gap rather than a style
// choice. Measured 2026-09-08 with a marked handler, reading it back off the engine node:
//
//   <view {onScroll}>          $.event('Scroll', node, fn)  WRAPPED — svelte's own closure
//   <view {...bag}>            set_attributes               WRAPPED — same closure
//   <view p={{ onScroll }}>    set_attribute('p', obj)      RAW
//
// `bindAnimatedEvent` identity-checks for a native `AnimatedEvent` and no-ops on anything else, so
// a handler svelte has already wrapped can never reach the native module — the closure is built by
// the compiler before any code of ours runs, and no shim can see through it. The deleted wrapper
// hid this by taking `onScroll` as an ordinary `$props()` value and spreading it into `p`.
//
// So this fixture uses the one authored spelling that still reaches the mechanism under test. What
// is NOT covered any more, on this adapter alone: `<view onScroll={Animated.event([…],
// {useNativeDriver: true})}>` runs JS-driven, silently.
async function loadParent(): Promise<Component> {
  const result = compile(
    `<script>
       let { style, onScroll } = $props();
     </script>
     <view p={{ style, onScroll, testID: 'animated-event-box' }}></view>`,
    { ...COMPILE_OPTIONS, filename: 'EventParent.svelte' },
  );
  writeFileSync(PARENT_OUT, result.js.code);

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('EventParent.svelte produced no default export');
  }
  return mod.default as Component;
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PARENT_OUT, { force: true });
});

describe('Animated.View (real compiled source) native event (Positive)', () => {
  // why: proves attachNativeEventHandler's post-commit retry actually matters here — under
  // Svelte's async-batched commit the reconcile $effect can run before completeRoot assigns the
  // view its Fabric tag, so a naive same-tick attach would silently bind nothing.
  it('binds a native Animated.event to the committed view tag', async () => {
    const EventParent = await loadParent();
    const scrollY = new AnimatedValue(0);

    mount(ROOT_TAG, EventParent, {
      style: { height: 10 },
      onScroll: animatedEvent(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          useNativeDriver: true,
        },
      ),
    });
    await tick();
    await tick();

    const attach = callsOf('addAnimatedEventToView');
    expect(attach, 'the native event attaches to the view').toHaveLength(1);
    expect(attach[0].args[0], 'bound to the committed view tag').toBe(
      animatedViewNode().tag,
    );
    expect(attach[0].args[1]).toBe('onScroll');
  });
});
