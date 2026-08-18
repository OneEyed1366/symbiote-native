// Co-located Solid-driven pipeline test, the Solid twin of react/drawer/drawer.test.tsx and
// vue/drawer/drawer.test.ts. The drawer is a PURE-JS UI (PanResponder + Animated over
// symbiote-view), so there is no react-native-screens ViewConfig to inject.
//
// The router and the whole swipe/geometry math are core's own responsibility and are covered by
// core's suite. This file proves the Solid lifecycle: the slot tree is built from renderDrawer's
// Descriptor, the focused screen and the `drawerContent` render prop land in the right slots, the
// imperative handle drives open/close, and the two Solid-specific claims - the render prop takes an
// ACCESSOR and is called once, and a drawerType change is an explicit rebuild boundary rather than
// a shape-guard throw.
//
// No Negative group: the Drawer has no throwing guard of its own; an unregistered jumpTo name is a
// documented reducer no-op.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Dimensions, mount, unmount } from '@symbiote-native/solid';
import { Drawer } from './index';
import type { IDrawerNavigatorHandle } from './index';
import { useRoute } from '../primitives';

const ROOT_TAG = 7703;

// Drawer reads the screen width off createWindowDimensions() to resolve the swipe edge zone -
// headless has no DeviceInfo native module, so seed a concrete width once (Dimensions is a
// module-level singleton, so this covers every mount below).
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

// rAF is not a Node global; Animated.timing reads it at .start() time, which every
// openDrawer/closeDrawer/toggleDrawer call reaches.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;
Object.assign(globalThis, {
  requestAnimationFrame(callback: (time: number) => void): number {
    const id = nextFrameId++;
    pendingFrames.set(id, callback);
    setTimeout(() => {
      const pending = pendingFrames.get(id);
      if (pending === undefined) return;
      pendingFrames.delete(id);
      frameClock += 16;
      pending(frameClock);
    }, 0);
    return id;
  },
  cancelAnimationFrame(id: number): void {
    pendingFrames.delete(id);
  },
});

const fabric = installFabric();
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findAll(
  predicate: (node: IFakeNode) => boolean,
  nodes: readonly IFakeNode[] = fabric.committed,
): IFakeNode[] {
  const found: IFakeNode[] = [];
  for (const node of nodes) {
    if (predicate(node)) found.push(node);
    found.push(...findAll(predicate, node.children));
  }
  return found;
}

const texts = (): string[] =>
  findAll(node => typeof node.props.text === 'string').map(node =>
    String(node.props.text),
  );

// The overlay is the only node in this tree whose pointerEvents is toggled between 'auto' and
// 'none' - the engine's own root carries 'box-none', which is why this matches the two values
// rather than the key's presence.
const overlayNodes = (): IFakeNode[] =>
  findAll(
    node =>
      node.props.pointerEvents === 'auto' ||
      node.props.pointerEvents === 'none',
  );

const HomeScreen = () => <symbiote-text>home-content</symbiote-text>;
const SettingsScreen = () => <symbiote-text>settings-content</symbiote-text>;

describe('Solid Drawer navigator', () => {
  describe('Positive', () => {
    // why: the baseline - the focused screen lands in the content slot, the app's own drawer
    // content lands in the panel slot, and both come from a registry that filled in AFTER the
    // navigator's body ran.
    it('mounts the focused screen and the drawer panel content', async () => {
      mount(ROOT_TAG, () => (
        <Drawer
          initialRouteName="Home"
          drawerContent={() => <symbiote-text>panel</symbiote-text>}
        >
          <Drawer.Screen name="Home" component={HomeScreen} />
          <Drawer.Screen name="Settings" component={SettingsScreen} />
        </Drawer>
      ));
      await flush();

      expect(texts()).toContain('home-content');
      expect(texts()).toContain('panel');
      expect(texts()).not.toContain('settings-content');
    });

    // why: opening is what the whole navigator exists for, and the only headless-observable effect
    // of it is the overlay becoming touchable - the slide itself is an Animated transform.
    it('openDrawer makes the overlay accept touches, closeDrawer releases them', async () => {
      let handle: IDrawerNavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Drawer ref={h => (handle = h)} initialRouteName="Home">
          <Drawer.Screen name="Home" component={HomeScreen} />
        </Drawer>
      ));
      await flush();
      expect(overlayNodes()[0].props.pointerEvents).toBe('none');

      handle?.openDrawer();
      await flush();
      expect(overlayNodes()[0].props.pointerEvents).toBe('auto');

      handle?.closeDrawer();
      await flush();
      expect(overlayNodes()[0].props.pointerEvents).toBe('none');
    });

    // why: jumpTo swaps the focused screen (and closes the drawer) - the drawer's only routing move.
    it('jumpTo swaps the mounted screen', async () => {
      let handle: IDrawerNavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Drawer ref={h => (handle = h)} initialRouteName="Home">
          <Drawer.Screen name="Home" component={HomeScreen} />
          <Drawer.Screen name="Settings" component={SettingsScreen} />
        </Drawer>
      ));
      await flush();

      handle?.jumpTo('Settings');
      await flush();

      expect(texts()).toContain('settings-content');
      expect(texts()).not.toContain('home-content');
    });

    // why: an unregistered name is a documented reducer no-op - fail closed, do not blank the UI.
    it('ignores a jumpTo to an unregistered route', async () => {
      let handle: IDrawerNavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Drawer ref={h => (handle = h)} initialRouteName="Home">
          <Drawer.Screen name="Home" component={HomeScreen} />
        </Drawer>
      ));
      await flush();

      handle?.jumpTo('Nope');
      await flush();

      expect(texts()).toContain('home-content');
    });
  });

  describe('Solid reactivity', () => {
    // why: the render prop takes an ACCESSOR, called ONCE and untracked
    // (.claude/rules/solid-descriptor-bridge.md §4). If it were called per change - or handed a
    // value snapshot - the whole panel subtree would be replaced on every drawer state change,
    // which mid-gesture is exactly how a responder grant is lost. Both halves are asserted: the
    // prop is invoked once, and its content still updates.
    it('calls drawerContent once and keeps its content live', async () => {
      let handle: IDrawerNavigatorHandle | null = null;
      let calls = 0;
      mount(ROOT_TAG, () => (
        <Drawer
          ref={h => (handle = h)}
          initialRouteName="Home"
          drawerContent={slot => {
            calls += 1;
            return (
              <symbiote-text>
                {slot().state.isOpen ? 'panel-open' : 'panel-closed'}
              </symbiote-text>
            );
          }}
        >
          <Drawer.Screen name="Home" component={HomeScreen} />
        </Drawer>
      ));
      await flush();
      expect(calls).toBe(1);
      expect(texts()).toContain('panel-closed');

      handle?.openDrawer();
      await flush();

      expect(calls).toBe(1);
      expect(texts()).toContain('panel-open');
    });

    // why: renderDrawer's slot ORDER and its animated-ness both follow drawerType, so the Descriptor
    // is a different TREE, not the same tree with new props. Without the explicit rebuild boundary
    // this either paints the wrong slot's props or throws descriptorToSolid's shape guard.
    it('rebuilds the slot tree when drawerType changes', async () => {
      const [isPermanent, setIsPermanent] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Drawer
          initialRouteName="Home"
          drawerType={isPermanent() ? 'permanent' : 'front'}
          drawerContent={() => <symbiote-text>panel</symbiote-text>}
        >
          <Drawer.Screen name="Home" component={HomeScreen} />
        </Drawer>
      ));
      await flush();
      // 'front' carries an overlay; 'permanent' has none and is not animated at all.
      expect(overlayNodes()).not.toHaveLength(0);

      setIsPermanent(true);
      await flush();

      expect(overlayNodes()).toHaveLength(0);
      expect(texts()).toContain('home-content');
      expect(texts()).toContain('panel');
    });

    // why: the same central hazard as Stack's and Tab's - a screen body runs once, so useRoute()
    // has to read through the live scope for a later route object to reach it.
    it('a route change reaches the mounted screen through useRoute()', async () => {
      let handle: IDrawerNavigatorHandle | null = null;
      const NameScreen = () => {
        const route = useRoute();
        return <symbiote-text>{`route:${route().name}`}</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Drawer ref={h => (handle = h)} initialRouteName="Home">
          <Drawer.Screen name="Home" component={NameScreen} />
          <Drawer.Screen name="Settings" component={NameScreen} />
        </Drawer>
      ));
      await flush();
      expect(texts()).toContain('route:Home');

      handle?.jumpTo('Settings');
      await flush();

      expect(texts()).toContain('route:Settings');
    });
  });
});
