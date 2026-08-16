// Root-cause repro for the 2026-08-13 sticky-header crash (`effect_update_depth_exceeded`).
// The production sticky-header.svelte was reverted to a plain-JS-number pin (see its own module
// comment) after a native-props-driven rewrite (rendering through a real Animated.View, matching
// React's ScrollViewStickyHeader.js) crashed on-device with an unbounded synchronous reconcile
// loop. core/engine/src/animated/animated-props-reconcile-repro.test.ts already proved the graph
// mechanics alone (AnimatedProps/AnimatedStyle/AnimatedTransform detach cascade over a shared
// long-lived interpolation) do NOT leak or loop in isolation — so the loop must come from the
// Svelte-side reactive wiring specifically. This test reconstructs the CRASHING sticky-header
// shape as a throwaway fixture (inlined here, never touching the reverted production file) and
// drives it exactly like a real fast scroll would (many AnimatedValue.setValue calls), to catch
// the loop directly in a debuggable headless environment instead of a device LogBox.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_777;
const COMPONENTS_DIR = join(__dirname, '..');
const MODULES_ANIMATED_DIR = join(COMPONENTS_DIR, '..', 'modules', 'animated');
const ANIMATED_VIEW_OUT = join(MODULES_ANIMATED_DIR, '.smoke-repro-animated-view.mjs');
const STICKY_HEADER_OUT = join(__dirname, '.smoke-repro-sticky-header-native-driven.mjs');
const ROOT_OUT = join(__dirname, '.smoke-repro-root.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let createAnimatedNodeCalls: number;

beforeEach(() => {
  fabric.reset();
  createAnimatedNodeCalls = 0;
  Object.assign(globalThis, {
    nativeModuleProxy: {
      NativeAnimatedTurboModule: {
        createAnimatedNode: () => {
          createAnimatedNodeCalls++;
        },
        connectAnimatedNodes: () => {},
        disconnectAnimatedNodes: () => {},
        connectAnimatedNodeToView: () => {},
        disconnectAnimatedNodeFromView: () => {},
        restoreDefaultValues: () => {},
        dropAnimatedNode: () => {},
        startAnimatingNode: () => {},
        stopAnimation: () => {},
        setAnimatedNodeValue: () => {},
        setAnimatedNodeOffset: () => {},
        flattenAnimatedNodeOffset: () => {},
        extractAnimatedNodeOffset: () => {},
        startListeningToAnimatedNodeValue: () => {},
        stopListeningToAnimatedNodeValue: () => {},
        getValue: () => {},
        addAnimatedEventToView: () => {},
        removeAnimatedEventFromView: () => {},
      },
    },
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(ANIMATED_VIEW_OUT, { force: true });
  rmSync(STICKY_HEADER_OUT, { force: true });
  rmSync(ROOT_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

// The EXACT shape sticky-header.svelte carried right before the revert (2026-08-13): the pinned
// translateY rides as the raw AnimatedInterpolation node in style.transform on a real
// AnimatedView, with the SAME interpolation's .addListener() driving the debounced
// passthroughAnimatedPropExplicitValues sync. Reconstructed verbatim from that commit, minus the
// dlog calls (irrelevant to the repro) — kept in a throwaway fixture, never the production file.
const CRASHING_STICKY_HEADER_SOURCE = `<script lang="ts">
  import {
    createInitialStickyState,
    reduceSticky,
    readLayoutNumber,
    STICKY_HEADER_Z_INDEX,
  } from '@symbiote-native/components';
  import { AnimatedValue, Platform, type AnimatedInterpolation, type ISymbioteEvent } from '@symbiote-native/engine';
  import AnimatedView from '../../modules/animated/.smoke-repro-animated-view.mjs';

  let {
    nextHeaderLayoutY,
    scrollAnimatedValue: scrollAnimatedValueProp,
    inverted: invertedProp,
    scrollViewHeight: scrollViewHeightProp,
    children,
  } = $props();

  const scrollAnimatedValue = scrollAnimatedValueProp ?? new AnimatedValue(0);
  const inverted = $derived(invertedProp);
  const scrollViewHeight = $derived(scrollViewHeightProp);

  const stickyState = createInitialStickyState();
  let version = $state(0);

  let animatedTranslateY = $state.raw(
    scrollAnimatedValue.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] }),
  );
  let listenerId;
  let debounceTimer;

  function inputs() {
    return { os: Platform.OS, inverted, scrollViewHeight, nextHeaderLayoutY };
  }

  function runEffects(effects) {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'rebuild-interpolation': {
          if (listenerId !== undefined) animatedTranslateY.removeListener(listenerId);
          const next = scrollAnimatedValue.interpolate({
            inputRange: effect.inputRange,
            outputRange: effect.outputRange,
          });
          listenerId = next.addListener(({ value }) => {
            if (typeof value === 'number') dispatch({ kind: 'animated-tick', value });
          });
          animatedTranslateY = next;
          break;
        }
        case 'schedule-debounce':
          if (debounceTimer !== undefined) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            dispatch({ kind: 'debounce-fired', value: effect.value });
          }, effect.delay);
          break;
        case 'apply-passthrough':
          version += 1;
          break;
        case 'record-header-y':
          break;
      }
    }
  }

  function dispatch(action) {
    runEffects(reduceSticky(stickyState, action, inputs()).effects);
  }

  $effect(() => {
    void inverted;
    void scrollViewHeight;
    void nextHeaderLayoutY;
    dispatch({ kind: 'inputs-changed' });
  });

  function handleLayout(event) {
    const y = readLayoutNumber(event, 'y');
    const height = readLayoutNumber(event, 'height');
    dispatch({
      kind: 'layout',
      y: y ?? stickyState.layoutY,
      height: height ?? stickyState.layoutHeight,
    });
  }

  const passthroughAnimatedPropExplicitValues = $derived.by(() => {
    void version;
    return stickyState.translateY !== null
      ? { style: { transform: [{ translateY: stickyState.translateY }] } }
      : null;
  });

  const bag = $derived.by(() => ({
    style: { transform: [{ translateY: animatedTranslateY }], zIndex: STICKY_HEADER_Z_INDEX },
    onLayout: handleLayout,
    collapsable: false,
    passthroughAnimatedPropExplicitValues,
  }));
</script>

<AnimatedView {...bag}>
  {@render children?.()}
</AnimatedView>
`;

async function loadMountable(): Promise<Component> {
  const animatedViewSource = readFileSync(
    join(MODULES_ANIMATED_DIR, 'AnimatedView.svelte'),
    'utf8',
  );
  compileToFile(animatedViewSource, 'AnimatedView.svelte', ANIMATED_VIEW_OUT);

  compileToFile(
    CRASHING_STICKY_HEADER_SOURCE,
    'StickyHeaderNativeDriven.svelte',
    STICKY_HEADER_OUT,
  );

  compileToFile(
    `<script>
       import ScrollViewStickyHeader from './.smoke-repro-sticky-header-native-driven.mjs';
       let { scrollAnimatedValue } = $props();
     </script>
     <ScrollViewStickyHeader {scrollAnimatedValue}>
       <symbiote-text>section</symbiote-text>
     </ScrollViewStickyHeader>`,
    'ReproRoot.svelte',
    ROOT_OUT,
  );

  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ReproRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

// Regression group, not Positive/Negative: this file's whole job is proving a SPECIFIC fixed crash
// (Svelte's effect_update_depth_exceeded, root-caused to reduceSticky's 'layout' case unconditionally
// emitting 'rebuild-interpolation' on every onLayout, even a redundant one) does not come back. The
// `.not.toThrow()` assertions ARE the product contract here — the crash IS a JS throw, so "did it
// throw" is the correct question for this file specifically (unlike a generic "did it crash" smoke,
// which the coverage-sweep discipline otherwise bans as too weak to prove anything).
describe('sticky-header native-driven shape — reconstructed pre-revert repro', () => {
  // why: reconstructs the EXACT pre-revert shape (native-driven AnimatedInterpolation in
  // style.transform + the same interpolation's addListener driving the debounced passthrough) and
  // drives it with a real measure + a fast scroll burst — the precise sequence a real device
  // delivers during a drag gesture, and the sequence that crashed on-device 2026-08-13.
  it('survives a real onLayout measure followed by a fast scroll burst without effect_update_depth_exceeded', async () => {
    const { AnimatedValue } = await import('@symbiote-native/engine');
    const scrollAnimatedValue = new AnimatedValue(0);
    const ReproRoot = await loadMountable();
    mount(ROOT_TAG, ReproRoot, { scrollAnimatedValue });
    await tick();
    await tick();

    const stickyHost = fabric.find(node => node.viewName === 'RCTView' && node.props.zIndex === 10);
    expect(stickyHost).toBeDefined();

    // Measure the header (RN's real onLayout), matching how it always gets its first real
    // input/output range before any scroll happens.
    fabric.fireEvent(stickyHost?.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 40, width: 100, height: 24 },
    });
    await tick();

    // A fast scroll gesture: many rapid, real value changes on the SAME shared AnimatedValue —
    // exactly what a real device delivers via onScroll -> Animated.event during a drag.
    expect(() => {
      for (let offset = 0; offset < 200; offset += 2) {
        scrollAnimatedValue.setValue(offset);
      }
    }).not.toThrow();

    await tick();
    await tick();
  });

  // why: the actual crashing condition needed the native-driven path LIVE (a settled debounced
  // translateY, not just measured-but-still-JS-only) before a redundant-geometry relayout burst
  // could provoke the unbounded rebuild ping-pong — this proves the reducer's
  // `alreadyAtThisGeometry` guard (sticky-header-reducer.ts) actually short-circuits that burst by
  // asserting zero NEW native nodes get minted, not merely that nothing throws.
  it('does not rebuild the interpolation graph on a burst of REDUNDANT identical-geometry layouts', async () => {
    const { AnimatedValue } = await import('@symbiote-native/engine');
    const scrollAnimatedValue = new AnimatedValue(0);
    const ReproRoot = await loadMountable();
    mount(ROOT_TAG, ReproRoot, { scrollAnimatedValue });
    await tick();
    await tick();

    const stickyHost = fabric.find(node => node.viewName === 'RCTView' && node.props.zIndex === 10);
    expect(stickyHost).toBeDefined();

    // Measure, then settle a real debounced translateY so `passthroughAnimatedPropExplicitValues`
    // goes non-null and `wantsNative` flips true — the ACTUAL crashing condition requires the
    // native-driven path to be live, not just measured-but-still-JS-only.
    fabric.fireEvent(stickyHost?.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 40, width: 100, height: 24 },
    });
    await tick();
    scrollAnimatedValue.setValue(50);
    // Real wall-clock wait past the host debounce (64ms iOS / 15ms Android) — `tick()`'s 0ms
    // setTimeout doesn't reach it; 'debounce-fired' only fires once this elapses for real.
    await new Promise(resolve => setTimeout(resolve, 100));

    const afterSettled = createAnimatedNodeCalls;
    expect(afterSettled).toBeGreaterThan(0);

    // Yoga legitimately re-fires onLayout with the SAME geometry (relayout passes, sibling
    // changes) — this is exactly the burst that, pre-fix, rebuilt the interpolation graph (fresh
    // AnimatedProps/AnimatedStyle/AnimatedTransform, fresh native connect) on every single one,
    // now that the native-driven path is live.
    expect(() => {
      for (let i = 0; i < 50; i++) {
        fabric.fireEvent(stickyHost?.instanceHandle, 'topLayout', {
          layout: { x: 0, y: 40, width: 100, height: 24 },
        });
      }
    }).not.toThrow();
    await tick();

    // No NEW native nodes should have been minted by the redundant burst — the reducer's
    // redundant-geometry guard (sticky-header-reducer.ts's `alreadyAtThisGeometry`) must have
    // short-circuited every one of them before reaching 'rebuild-interpolation'.
    expect(createAnimatedNodeCalls).toBe(afterSettled);
  });
});
