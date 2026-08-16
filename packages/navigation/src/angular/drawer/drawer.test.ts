// Co-located Angular-driven test for the @symbiote-native/navigation Angular Drawer navigator.
// Proves: registry building from @ContentChildren, jumpTo focus switching, openDrawer/
// closeDrawer/toggleDrawer driving the isOpen state and the panel/overlay geometry reuse from
// core (drawerChildOrder/resolveDrawerGeometry), and drawer content projection via the
// `#drawerContent` TemplateRef. Drawer is imported from its own module (NOT the package barrel)
// so ../register never loads headless - Drawer needs no react-native-screens ViewConfig at all.

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, ViewChild, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Animated,
  mount,
  unmount,
  Dimensions,
  registerComposedComponent,
} from '@symbiote-native/angular';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Drawer } from './index';
import type { IDrawerNavigatorHandle } from './index';
import { DrawerScreenDirective } from '../drawer-screen.directive';
import { injectIsFocused } from '../injectors/inject-is-focused';

const ROOT_TAG = 5122;
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// Drawer reads the screen width off WindowDimensionsService (isSwipeStartInEdge) - headless has
// no DeviceInfo native module, so seed a concrete width once; every mount in this file reads this
// same cached value (Dimensions is a module-level singleton). Mirrors
// react/drawer.test.tsx's identical setup.
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

// On a real Metro build, adapters/angular's babel-register-composed.cjs auto-registers `Drawer`
// as an anchor host by scanning the AOT-compiled @Component's selector - vitest never runs that
// pipeline, so this test drives the same self-registration entry point by hand (mirrors
// renderer.test.ts's 'RefApiDemo' convention). Without it, `<Drawer>` falls through to a raw
// Fabric createNode('Drawer') call instead of a non-painting anchor.
registerComposedComponent('Drawer');

// rAF is not a Node global; Animated.timing (driven by every openDrawer/closeDrawer/toggleDrawer
// call) reads it at .start() time. Ported verbatim from react/drawer.test.tsx's own polyfill - no
// frame is ever awaited here since these tests assert on state-derived content, not animated
// frame values.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const cb = pendingFrames.get(id);
        if (cb !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          cb(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
  capturedHomeInstance = undefined;
  capturedSettingsInstance = undefined;
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function findInTree(
  predicate: (node: IFakeNode) => boolean,
  nodes = fabric.committed,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const found = findInTree(predicate, node.children);
    if (found) return found;
  }
  return undefined;
}

// The drawer's own root View, carrying panResponder.panHandlers via
// [symbioteHostProps]="rootPanHandlers()" (index.ts) - the responder props are consumed into the
// engine's event/listener registration on commit, so they never show up as literal keys in
// `.props` to search for. `mount()` always wraps the app in exactly one synthetic `box-none`
// AppContainer root (fabric.appRoot()'s own contract), so the Drawer's own root view - the first
// and only thing this test host renders - is that root's first child, mirroring
// react/drawer.test.tsx's identical `drawerRoot()`.
function drawerRootNode(): IFakeNode {
  return fabric.appRoot().children[0];
}

// The overlay is the one slot carrying `pointerEvents` ('auto' while open, 'none' while closed -
// overlayResponderPassthrough in index.ts) - the one stable, non-animated signal of state.isOpen
// this file reads, since the slide/opacity transforms themselves are driven by a real (unawaited)
// Animated.timing. Mirrors react/drawer.test.tsx's identical helper.
function overlayNode(): IFakeNode | undefined {
  return findInTree(
    node_ => node_.props.pointerEvents === 'auto' || node_.props.pointerEvents === 'none',
  );
}

function isOpenByOverlay(): boolean {
  return overlayNode()?.props.pointerEvents === 'auto';
}

const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
const TOUCH_ID = 1;

type ITouchFrame = { x: number; y: number; t: number };

// Fires a start -> N moves -> end touch sequence at the drawer root through the SAME fake-Fabric
// dispatch path a real device negotiates responders through (fabric.fireEvent), so PanResponder's
// callbacks receive a real, engine-constructed ISymbioteEvent - not a hand-built one. Mirrors
// react/drawer.test.tsx's `swipe()` helper verbatim (same fake-Fabric touch technique).
function swipe(path: readonly ITouchFrame[]): void {
  const node = drawerRootNode();
  const handle = node.instanceHandle;
  const tag = node.tag;
  const point = (frame: ITouchFrame): Record<string, unknown> => ({
    identifier: TOUCH_ID,
    pageX: frame.x,
    pageY: frame.y,
    timestamp: frame.t,
    target: handle,
  });
  const fire = (type: string, frame: ITouchFrame, isEnd: boolean): void => {
    const touch = point(frame);
    fabric.fireEvent(handle, type, {
      touches: isEnd ? [] : [touch],
      changedTouches: [touch],
      target: tag,
      timestamp: frame.t,
    });
  };
  const [start, ...rest] = path;
  fire(TOUCH_START, start, false);
  rest.forEach((frame, index) => {
    const isLast = index === rest.length - 1;
    fire(isLast ? TOUCH_END : TOUCH_MOVE, frame, isLast);
  });
}

// Clears the default swipeEdgeWidth (32) and swipeMinDistance (60) at position 'left' (screen
// width seeded to 375 above): a start near x=10 followed by a large horizontal move.
const OPEN_SWIPE: readonly ITouchFrame[] = [
  { x: 10, y: 400, t: 1_000 },
  { x: 130, y: 400, t: 1_050 }, // dx=120 (>=60), dt=50 -> vx=2.4 (>=0.5): both thresholds clear.
  { x: 130, y: 400, t: 1_060 },
];

// Same edge start, but the move never clears either threshold: dx=20 (<60), dt=100 -> vx=0.2
// (<0.5).
const UNDER_THRESHOLD_SWIPE: readonly ITouchFrame[] = [
  { x: 10, y: 400, t: 1_000 },
  { x: 30, y: 400, t: 1_100 },
  { x: 30, y: 400, t: 1_110 },
];

let capturedHomeInstance: HomeDrawerScreenComponent | undefined;
let capturedSettingsInstance: SettingsDrawerScreenComponent | undefined;

@Component({
  selector: 'home-drawer-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class HomeDrawerScreenComponent {
  // Real screens (e.g. examples/angular's DrawerHomeScreen) call injectIsFocused() - see the
  // regression test below for why this matters.
  readonly isFocused: Signal<boolean> = injectIsFocused();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHomeInstance = this;
  }
}

@Component({
  selector: 'settings-drawer-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>settings</symbiote-text>`,
})
class SettingsDrawerScreenComponent {
  readonly isFocused: Signal<boolean> = injectIsFocused();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedSettingsInstance = this;
  }
}

let capturedHost: DrawerTestHost | undefined;

@Component({
  selector: 'drawer-test-host',
  standalone: true,
  imports: [Drawer, DrawerScreenDirective],
  template: `
    <Drawer #nav initialRouteName="Home">
      <ng-template
        symbioteDrawerScreen
        name="Home"
        [component]="homeComponent"
        [options]="homeOptions"
      ></ng-template>
      <ng-template
        symbioteDrawerScreen
        name="Settings"
        [component]="settingsComponent"
      ></ng-template>
      <ng-template #drawerContent let-ctx>
        <symbiote-text
          >{{ ctx.state.routes.length }} routes, focused index {{ ctx.state.index }}</symbiote-text
        >
      </ng-template>
    </Drawer>
  `,
})
class DrawerTestHost {
  @ViewChild('nav') nav!: Drawer;

  homeComponent = HomeDrawerScreenComponent;
  settingsComponent = SettingsDrawerScreenComponent;
  homeOptions: Record<string, unknown> = { title: 'Home', drawerLabel: 'Home' };

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

async function mountDrawer(): Promise<IDrawerNavigatorHandle> {
  capturedHost = undefined;
  mount(ROOT_TAG, DrawerTestHost);
  await tick();
  const host = capturedHost;
  if (!host) throw new Error('DrawerTestHost never mounted');
  return host.nav;
}

// This adapter layer never throws on invalid navigation input - drawerRouterReducer's jumpTo
// branch is a total function (an unknown route name is a documented no-op, see
// core/drawer-router-state/index.ts), and the handle exposes no operation with a rejecting path.
// So there is no classic "Negative" group here; the boundary describe below documents the no-op
// contract instead of inventing a throw that does not exist.
describe('Angular Drawer navigator', () => {
  describe('Positive - renders and reacts to the exposed navigator handle', () => {
    // why: createInitialDrawerRouterState resolves `initialRouteName` to that route's index and
    // always starts closed - a caller must be able to mount directly onto a non-default screen
    // (deep-link) without the panel appearing over it.
    it('mounts closed, with the initial route focused', async () => {
      await mountDrawer();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeDefined();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'settings'),
      ).toBeUndefined();
      expect(isOpenByOverlay()).toBe(false);
    });

    // why: drawerRouterReducer's jumpTo branch focuses by NAME and closes the drawer in the same
    // action - selecting a destination is itself the dismissal gesture, so a plain focus without
    // also closing would leave the panel covering the just-selected screen.
    it('jumpTo() switches the focused/mounted screen and closes the drawer', async () => {
      const handle = await mountDrawer();
      handle.openDrawer();
      await tick();
      handle.jumpTo('Settings');
      await tick();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'settings'),
      ).toBeDefined();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeUndefined();
      expect(isOpenByOverlay()).toBe(false);
    });

    // Regression test: jumpTo() used to read isOpen off the signal AFTER dispatch(), by which point
    // drawerRouterReducer had already flipped it to false - so the "was it open?" check always saw
    // false and never animated the panel closed, leaving it visually stuck open even though the
    // router state itself was already correct. Asserts on the actual Animated.timing call
    // (animateProgressTo's own entry point), not just the state-derived content used above, since
    // that's what the stuck-open bug never touched.
    it('jumpTo() animates the panel closed when the drawer was open', async () => {
      const handle = await mountDrawer();
      handle.openDrawer();
      await tick();
      const timingSpy = vi.spyOn(Animated, 'timing');
      handle.jumpTo('Settings');
      await tick();
      expect(timingSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 0 }),
      );
      // Left installed, this spy survives into every later test in the file - vi.spyOn hands back
      // the SAME mock for an already-spied property, call history included.
      timingSpy.mockRestore();
    });

    // why: openDrawer/closeDrawer/toggleDrawer are the exported imperative handle
    // (IDrawerNavigatorHandle) a caller uses from outside the gesture system (a menu button, a
    // header icon) - each must flip the SAME isOpen bit the gesture path drives, observable
    // through the overlay's pointerEvents (the one non-animated signal of isOpen).
    it('openDrawer()/closeDrawer()/toggleDrawer() drive the router state', async () => {
      const handle = await mountDrawer();
      expect(isOpenByOverlay()).toBe(false);

      handle.openDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(true);

      handle.closeDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(false);

      handle.toggleDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(true);

      handle.toggleDrawer();
      await tick();
      expect(isOpenByOverlay()).toBe(false);
    });

    // why: react/drawer.ts's `renderDrawerContent` render-prop becomes Angular's
    // `#drawerContent` TemplateRef+context - the drawer panel's app-authored menu needs the live
    // router state to label its entries and reflect the currently-focused route.
    it('projects drawer content via the #drawerContent template, reading live router state', async () => {
      await mountDrawer();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === '2 routes, focused index 0'),
      ).toBeDefined();
    });

    // why: render-drawer.ts's drawerChildOrder for the default 'front' type is
    // [content, overlay, panel] - Fabric paints later siblings on top, and 'front' relies on the
    // panel painting over the (currently invisible-but-present) dimming overlay. Verified two
    // ways: the overlay node itself exists with a defined pointerEvents (isDrawerOverlayVisible's
    // 'front' branch), and content's text commits before panel's in the serialized tree.
    it('reuses core geometry: content/overlay/panel slots paint in front-type order (content, overlay, panel)', async () => {
      await mountDrawer();
      expect(overlayNode()).toBeDefined();
      const serialized = fabric.serialize(fabric.committed);
      const contentIndex = serialized.indexOf('home');
      const panelIndex = serialized.indexOf('2 routes, focused index 0');
      expect(contentIndex).toBeGreaterThanOrEqual(0);
      expect(panelIndex).toBeGreaterThan(contentIndex);
    });
  });

  describe('Gesture - swipe simulated through the real PanResponder (fake-Fabric touch events)', () => {
    // why: shouldClaimDrawerSwipe/resolveSwipeIntent (core/drawer-options) are pure functions
    // already closed by drawer-options.test.ts - this proves the ANGULAR wiring (the
    // [symbioteHostProps]="rootPanHandlers()" binding, windowDimensions injection) actually
    // reaches them, which the pure-function tests alone cannot.
    it('a valid edge-swipe opens the drawer', async () => {
      await mountDrawer();
      expect(isOpenByOverlay()).toBe(false);
      swipe(OPEN_SWIPE);
      await tick();
      expect(isOpenByOverlay()).toBe(true);
    });

    // why: resolveSwipeIntent snaps back to the CURRENT state (not the opposite) when neither the
    // distance nor the velocity threshold clears - an accidental brush against the edge must not
    // open the drawer.
    it('a swipe that clears neither the distance nor velocity threshold snaps back closed', async () => {
      await mountDrawer();
      swipe(UNDER_THRESHOLD_SWIPE);
      await tick();
      expect(isOpenByOverlay()).toBe(false);
    });
  });

  describe('Boundary - invalid navigation input is absorbed safely, not thrown', () => {
    // why: drawerRouterReducer's jumpTo branch returns the SAME state when the name isn't found
    // (`index === -1`) - a typo'd or stale route name must be a safe no-op, not a crash and not a
    // silent focus change to an arbitrary route.
    // Regression: jumpTo() used to animate off a pre-dispatch `wasOpen` snapshot alone, so an
    // unmatched name - a reducer no-op that leaves isOpen true - still slid the panel shut. State
    // and animation then disagreed with nothing to recover them: the overlay stayed tappable over
    // an invisible panel. Asserts on the timing call itself, since the router state (correct all
    // along) never showed the bug.
    it('leaves the panel open when jumpTo names an unregistered route', async () => {
      const handle = await mountDrawer();
      handle.openDrawer();
      await tick();
      const timingSpy = vi.spyOn(Animated, 'timing');
      handle.jumpTo('does-not-exist');
      await tick();
      expect(timingSpy).not.toHaveBeenCalled();
      expect(isOpenByOverlay()).toBe(true);
      timingSpy.mockRestore();
    });

    it('ignores jumpTo to an unregistered route name', async () => {
      const handle = await mountDrawer();
      handle.jumpTo('does-not-exist');
      await tick();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home'),
      ).toBeDefined();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'settings'),
      ).toBeUndefined();
    });
  });

  describe('Positive - focusedRouteEmitter() and injectIsFocused() stay consistent', () => {
    // Regression test: focusedRouteEmitter() runs as a TEMPLATE EXPRESSION
    // ([emitter]="focusedRouteEmitter()"), inside Angular's reactive-read tracking context for the
    // current CD pass. It synchronously calls emitter.emit(FOCUS/BLUR), fan-out-calling every
    // listener on that route's emitter synchronously too - including injectIsFocused()'s
    // `isFocused.set(...)`, since every real screen calls injectIsFocused(). Angular throws NG600
    // ("signal write during a template execution") the instant that set() runs inside a tracked
    // read. jumpTo() is exactly what tapping a drawer menu item fires. tabs.ts's
    // focusedRouteEmitter() has the identical shape and its own regression test in tabs.test.ts.
    it('switching the focused screen does not throw when it calls injectIsFocused()', async () => {
      const handle = await mountDrawer();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        handle.jumpTo('Settings');
        await tick();
        handle.jumpTo('Home');
        await tick();
      } finally {
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
      }
    });

    // injectIsFocused() reads context.emitter at CALL time (during the screen's own constructor),
    // which runs as part of *ngComponentOutlet creating the screen - nested INSIDE the same
    // <ng-container [emitter]="focusedRouteEmitter()"> whose input evaluation is what actually
    // fires the FOCUS emit. If Angular evaluates the ng-container's OWN inputs (calling
    // focusedRouteEmitter(), firing FOCUS) before creating/refreshing the nested ngComponentOutlet
    // child (running the screen's constructor, registering the injectIsFocused() listener), the
    // FOCUS event fires to zero listeners and is lost forever - isFocused stays false permanently.
    it('the initially-focused screen actually observes isFocused() becoming true', async () => {
      await mountDrawer();
      await tick();
      expect(capturedHomeInstance).toBeDefined();
      expect(capturedHomeInstance?.isFocused()).toBe(true);
    });

    // why: exactly one screen must ever read itself as focused at a time - a stale `true` left on
    // the outgoing screen would let it keep reacting to focus-only side effects after it is no
    // longer visible.
    it('switching screens toggles isFocused() true/false on the exiting/entering screens', async () => {
      const handle = await mountDrawer();
      await tick();
      handle.jumpTo('Settings');
      await tick();
      expect(capturedHomeInstance?.isFocused()).toBe(false);
      expect(capturedSettingsInstance).toBeDefined();
      expect(capturedSettingsInstance?.isFocused()).toBe(true);
    });
  });
});
