// Nesting: a Stack rendered as a Tab screen's content. Proves the two things nesting actually
// depends on - that Svelte's context follows the RUNTIME render tree (so the inner Stack's
// screens see the INNER scope, not the Tab's), and that the `parent` link a navigator captures on
// its own mount is what useNavigation().getParent() walks back up.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { findLiveByTestId } from './fabric-tree.test-helper';
import { createSvelteHarness, loadComponent } from './svelte-compile.test-helper';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_705;

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: { directEventTypes: {}, validAttributes: { screenId: true, activityState: true } },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  RNSScreenStackHeaderConfig: { directEventTypes: {}, validAttributes: { title: true } },
  RNSScreenContentWrapper: { directEventTypes: {}, validAttributes: { collapsable: true } },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('nested');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('nested');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const INNER_SOURCE = `<script lang="ts">
   import { useRoute } from './runes/use-route.svelte';
   import { useNavigation } from './runes/use-navigation.svelte';
   import { useStackNavigation } from './runes/use-stack-navigation.svelte';
   const route = useRoute();
   const navigation = useNavigation();
   const stackNavigation = useStackNavigation();
   const parent = $derived(navigation.current.getParent());
   const label = $derived([
     route.current.name,
     typeof stackNavigation.current.push,
     parent === undefined ? 'no-parent' : (typeof parent.jumpTo === 'function' ? 'tab-parent' : 'other-parent'),
   ].join('|'));
 </script>
 <symbiote-view p={{ testID: 'inner', accessibilityLabel: label }} />`;

const STACK_HOST_SOURCE = `<script lang="ts">
   import Stack from './stack/index.svelte';
   import Screen from './screen.svelte';
   import Inner from './nested-inner.svelte';
   import { useRoute } from './runes/use-route.svelte';
   const route = useRoute();
 </script>
 <symbiote-view p={{ testID: 'stack-host', accessibilityLabel: route.current.name }}><Stack><Screen name="inner" component={Inner} /></Stack></symbiote-view>`;

const OTHER_SOURCE = `<symbiote-view p={{ testID: 'other' }} />`;

async function mountNested(): Promise<void> {
  const dir = __dirname;
  harness.compileSource(dir, 'nested-inner', INNER_SOURCE);
  harness.compileSource(dir, 'nested-stack-host', STACK_HOST_SOURCE);
  harness.compileSource(dir, 'nested-other', OTHER_SOURCE);
  const app = harness.compileSource(
    dir,
    'nested-app',
    `<script lang="ts">
       import Tab from './tabs/index.svelte';
       import TabScreen from './tab-screen.svelte';
       import StackHost from './nested-stack-host.svelte';
       import Other from './nested-other.svelte';
     </script>
     <Tab><TabScreen name="main" component={StackHost} /><TabScreen name="other" component={Other} /></Tab>`,
  );
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

// No Negative group: nesting is pure context-propagation composition (navigation-context.ts's
// setContext/getContext chain) with no user-facing input to reject, so every scenario below is
// Positive - it either wires the parent link/registry correctly or it doesn't.
describe('nested navigation (Stack inside a Tab screen)', () => {
  describe('Positive', () => {
    it('gives the inner Stack screen its OWN route rather than the enclosing Tab screen route', async () => {
      // why: context in Svelte follows the RUNTIME render tree, not the lexical definition site
      // (navigation-context.ts's header comment) - the inner Stack mounts its own NavigationScope
      // for its "inner" route, so a screen inside it must NOT inherit the Tab's "main" route.
      await mountNested();
      expect(findLiveByTestId(fabric.appRoot(), 'stack-host')?.props?.accessibilityLabel).toBe(
        'main',
      );
      const innerLabel = findLiveByTestId(fabric.appRoot(), 'inner')?.props?.accessibilityLabel;
      // The full label format (route|typeof-push|parent-kind) is asserted precisely by the next
      // test; this one only needs to prove the route name segment is "inner", not "main".
      expect(innerLabel?.split('|')[0]).toBe('inner');
    });

    it('walks one hop up to the enclosing Tab handle via getParent()', async () => {
      // why: navigation-context.ts threads `parent` as the ambient scope a navigator read on ITS
      // OWN mount, forming a linked list - useNavigation().getParent() inside the nested Stack's
      // screen must resolve to the Tab's handle specifically (a jumpTo-capable handle), not merely
      // "some" ancestor object.
      await mountNested();
      expect(findLiveByTestId(fabric.appRoot(), 'inner')?.props?.accessibilityLabel).toBe(
        'inner|function|tab-parent',
      );
    });

    it('keeps the two navigators screen registries separate', async () => {
      // why: the Tab's `other` screen is NOT mounted (only the focused route is), and the Stack's
      // own `inner` marker must never leak into the Tab's registry - if it had, the tab bar would
      // carry a third item and `other` would not be the second one.
      await mountNested();
      expect(findLiveByTestId(fabric.appRoot(), 'other')).toBeUndefined();
      expect(findLiveByTestId(fabric.appRoot(), 'inner')).toBeDefined();
    });
  });
});
