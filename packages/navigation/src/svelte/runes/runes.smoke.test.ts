// The runes bucket, exercised inside a REAL Stack-mounted screen. Runes cannot be called from a
// plain test function - `$state`/`$effect` need Svelte's module compiler and a live component
// context, so every assertion here rides a compiled probe component that reports through a
// callback prop (the same shape splash-screen's own rune test uses).
//
// Coverage notes (Mode B closure - what this file deliberately does NOT re-prove):
// - useRoute / useNavigation / useIsFocused / useFocusEffect / useNavigationState all delegate
//   their "must be used inside a navigator" guard to the SAME centralized
//   `requireNavigationScope` (navigation-context.ts), which throws one shared error shape naming
//   only the calling rune. One representative orphan test (useRoute) exercises that shared guard;
//   re-testing it per rune would repeat the same assertion five times for no new information.
// - `useNavigation().getParent()` returning a DEFINED parent (as opposed to undefined at the
//   nesting root, covered here) needs an actual nested-navigator composition - that composition
//   is nested-navigation.smoke.test.ts's job, not this file's.
// - `useStackNavigation()`'s own "wrong navigator kind" throw is the same narrowing mechanism
//   exercised below for useTabNavigation/useDrawerNavigation, just mounted under a Stack (its
//   correct kind) rather than a mismatched one. Proving the mismatch case for it would need a
//   non-Stack root (Tab or Drawer) driving a Stack-only rune - out of this file's Stack-mounted
//   harness; the narrowing contract itself is already proven twice below (Tab, Drawer).
// - useFocusEffect's cleanup also runs on the mounting component's own unmount (its `$effect`
//   teardown calls `runCleanup()` unconditionally, not only on blur) - distinct from the
//   blur-triggered cleanup asserted below. Not asserted here: once the probe unmounts there is no
//   live DOM node left to read a report back through, and wiring an out-of-band signal past
//   unmount would grow this harness well beyond a smoke test's scope.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import type { INavigatorHandle } from '../../core';
import { findLive, findLiveByTestId } from '../fabric-tree.test-helper';
import { createSvelteHarness, loadComponent } from '../svelte-compile.test-helper';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_704;

function directEvent(registrationName: string): { registrationName: string } {
  return { registrationName };
}

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: {
    directEventTypes: {
      topAppear: directEvent('onAppear'),
      topDisappear: directEvent('onDisappear'),
      topDismissed: directEvent('onDismissed'),
    },
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  RNSScreenStackHeaderConfig: { directEventTypes: {}, validAttributes: { title: true } },
  RNSScreenContentWrapper: { directEventTypes: {}, validAttributes: { collapsable: true } },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('runes');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('runes');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

// Everything a screen can read, folded into one accessibilityLabel so a single live-tree read
// asserts the whole surface at once. Fields are APPENDED, never reordered, so the index/slice
// assertions below stay stable as the probe grows.
const PROBE_SOURCE = `<script lang="ts">
   import { useNavigation } from './use-navigation.svelte';
   import { useStackNavigation } from './use-stack-navigation.svelte';
   import { useNavigationState } from './use-navigation-state.svelte';
   import { useFocusEffect } from './use-focus-effect.svelte';
   import { useRoute } from './use-route.svelte';
   import { useIsFocused } from './use-is-focused.svelte';
   const navigation = useNavigation();
   const stackNavigation = useStackNavigation();
   const route = useRoute();
   const routeCount = useNavigationState(state => state.routes.length);
   const focused = useIsFocused();
   let focusRuns = $state(0);
   let cleanupRuns = $state(0);
   useFocusEffect(() => {
     focusRuns += 1;
     return () => { cleanupRuns += 1; };
   });
   const label = $derived([
     route.current.name + ':' + String(route.current.params ?? 'none'),
     String(routeCount.current),
     String(focusRuns),
     String(cleanupRuns),
     typeof stackNavigation.current.push,
     typeof navigation.current.addListener,
     String(navigation.current.getParent() === undefined),
     String(focused.current),
   ].join('|'));
 </script>
 <symbiote-view testID="probe" accessibilityLabel={label} />`;

// Generic "narrowing rune meets the wrong navigator kind" probe: every `use<Kind>Navigation` rune
// shares the exact same throw-on-access mechanism (use-stack/tab/drawer-navigation.svelte.ts),
// differing only in which kind it narrows to and which error message it names - one template
// proves the mechanism for each kind mounted below (Tab, Drawer) instead of duplicating the probe
// body per kind.
function mismatchProbeSource(hookFile: string, hookName: string): string {
  return `<script lang="ts">
   import { ${hookName} } from './${hookFile}';
   const narrowed = ${hookName}();
   let message = $state('no error');
   $effect(() => {
     try {
       void narrowed.current;
     } catch (error) {
       message = error instanceof Error ? error.message : 'unknown';
     }
   });
 </script>
 <symbiote-view testID="mismatch" accessibilityLabel={message} />`;
}

async function mountWithScreen(variant: string, screenSource: string): Promise<unknown> {
  const dir = __dirname;
  await harness.compileSource(dir, `${variant}-screen`, screenSource);
  const app = await harness.compileSource(
    dir,
    `${variant}-app`,
    `<script lang="ts">
       import Stack from '../stack/index.svelte';
       import Screen from '../screen.svelte';
       import Probe from './${variant}-screen.svelte';
       let { onReady }: { onReady?: (handle: unknown) => void } = $props();
       let navigator = $state.raw<unknown>(null);
       $effect(() => { if (navigator !== null) onReady?.(navigator); });
     </script>
     <Stack bind:this={navigator}><Screen name="home" component={Probe} /><Screen name="details" component={Probe} /></Stack>`,
  );
  let handle: unknown = null;
  mount(ROOT_TAG, await loadComponent(app), {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  return handle;
}

function isStackHandle(value: unknown): value is INavigatorHandle {
  return typeof value === 'object' && value !== null && 'push' in value;
}

function probeLabel(testID: string): string {
  const label = findLiveByTestId(fabric.appRoot(), testID)?.props?.accessibilityLabel;
  return typeof label === 'string' ? label : '';
}

describe('navigation runes (real compiled components)', () => {
  describe('Positive', () => {
    it('exposes route, navigation, narrowed handle, navigation state and focus to a mounted screen', async () => {
      // why: every rune (useRoute/useNavigation/useStackNavigation/useNavigationState/
      // useIsFocused) must resolve to real, live values for a screen mounted under a real
      // navigator - this is the single assertion that proves the whole bucket wires up correctly
      // end to end, not just in isolation. focusRuns/cleanupRuns/isFocused all read as
      // not-yet-focused here because useFocusEffect/useIsFocused only react to the
      // NAVIGATION_EVENT_FOCUS/_BLUR emitter events, which this mount alone does not trigger (the
      // native screen's topAppear hasn't fired yet - see the focus/blur test below).
      await mountWithScreen('surface', PROBE_SOURCE);
      // name:params | routeCount | focusRuns | cleanupRuns | typeof push | typeof addListener | rootScope | isFocused
      expect(probeLabel('probe')).toBe('home:none|1|0|0|function|function|true|false');
    });

    it('runs useFocusEffect and flips useIsFocused together on native focus/blur', async () => {
      // why: useFocusEffect.svelte.ts and useIsFocused.svelte.ts both subscribe to the SAME
      // route-scoped FOCUS/BLUR emitter events, driven here by the native screen's
      // topAppear/topDisappear - a screen becoming focused must see BOTH its focus effect fire
      // exactly once AND useIsFocused() flip to true in the same tick, and both must unwind
      // together on blur (effect's cleanup runs, isFocused flips back to false), or a consumer
      // relying on one and not the other would desync.
      await mountWithScreen('focus', PROBE_SOURCE);
      const screen = findLive(fabric.appRoot(), 'RNSScreen');
      expect(screen).toBeDefined();
      if (screen === undefined) return;

      fabric.fireEvent(screen.instanceHandle, 'topAppear', {});
      await tick();
      await tick();
      const focusedFields = probeLabel('probe').split('|');
      expect(focusedFields.slice(2, 4)).toEqual(['1', '0']);
      expect(focusedFields[7]).toBe('true');

      fabric.fireEvent(screen.instanceHandle, 'topDisappear', {});
      await tick();
      await tick();
      const blurredFields = probeLabel('probe').split('|');
      expect(blurredFields.slice(2, 4)).toEqual(['1', '1']);
      expect(blurredFields[7]).toBe('false');
    });

    it('re-runs useNavigationState when the router broadcasts a new state', async () => {
      // why: useNavigationState re-subscribes to NAVIGATION_EVENT_STATE and must re-run the
      // selector for EVERY mounted screen when the router state changes - not just the screen
      // that triggered the push. Both routes stay mounted on a Stack, so the FIRST screen's
      // selector (routes.length) must also see the new count.
      const handle = await mountWithScreen('state', PROBE_SOURCE);
      expect(probeLabel('probe').split('|')[1]).toBe('1');
      if (!isStackHandle(handle)) throw new Error('Stack did not expose a navigator handle');

      handle.push('details');
      await tick();
      await tick();
      expect(probeLabel('probe').split('|')[1]).toBe('2');
    });

    it('re-reads the route through the scope getter after setParams', async () => {
      // why: useRoute's boxed getter must reflect a setParams-produced route object for the SAME
      // route key without a remount - the scope value is a getter specifically so a param update
      // reaches an already-mounted screen (navigation-context.ts's header comment).
      const handle = await mountWithScreen('params', PROBE_SOURCE);
      if (!isStackHandle(handle)) throw new Error('Stack did not expose a navigator handle');
      expect(probeLabel('probe').split('|')[0]).toBe('home:none');

      handle.setParams('updated');
      await tick();
      await tick();
      expect(probeLabel('probe').split('|')[0]).toBe('home:updated');
    });
  });

  describe('Negative', () => {
    it('throws a named error when useTabNavigation meets a Stack ancestor', async () => {
      // why: useTabNavigation() must reject a Stack-mounted screen with a NAMED, kind-specific
      // error rather than silently returning the wrong handle shape (which would let callers
      // invoke e.g. `.jumpTo` on a handle that doesn't actually have it) or returning undefined.
      await mountWithScreen(
        'mismatch-tab',
        mismatchProbeSource('use-tab-navigation.svelte', 'useTabNavigation'),
      );
      expect(probeLabel('mismatch')).toContain('nearest navigator is not a Tab');
    });

    it('throws a named error when useDrawerNavigation meets a Stack ancestor', async () => {
      // why: same narrowing contract as useTabNavigation above, proven here for the third kind so
      // the mechanism is shown to generalize across all narrowing runes - not just the one kind
      // the original test happened to cover.
      await mountWithScreen(
        'mismatch-drawer',
        mismatchProbeSource('use-drawer-navigation.svelte', 'useDrawerNavigation'),
      );
      expect(probeLabel('mismatch')).toContain('nearest navigator is not a Drawer');
    });

    it('throws when a rune is used outside any navigator', async () => {
      // why: requireNavigationScope's guard is what stops a rune from silently reading `undefined`
      // scope fields when a component is mounted outside any Stack/Tab/Drawer - the error must
      // name which navigator kinds are valid hosts, not just say "no scope".
      const dir = __dirname;
      const app = await harness.compileSource(
        dir,
        'orphan-app',
        `<script lang="ts">
         import { useRoute } from './use-route.svelte';
         let message = 'no error';
         try {
           useRoute();
         } catch (error) {
           message = error instanceof Error ? error.message : 'unknown';
         }
       </script>
       <symbiote-view testID="orphan" accessibilityLabel={message} />`,
      );
      mount(ROOT_TAG, await loadComponent(app));
      await tick();
      await tick();
      expect(probeLabel('orphan')).toContain(
        'useRoute must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>',
      );
    });
  });
});
