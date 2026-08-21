// Co-located Angular-driven test for the @symbiote-native/navigation Angular Tab navigator.
// Proves: registry building from @ContentChildren, tab switching via jumpTo, focus/blur
// synthesis, tab bar item painting (label/icon/badge/tint), and press wiring. Tab is imported from
// its own module (NOT the package barrel) so the ../register side-effect never loads headless -
// Tab needs no react-native-screens ViewConfig at all (pure-JS UI).

import '@angular/compiler';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ViewChild,
  signal,
  type Signal,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  unmount,
  registerComposedComponent,
} from '@symbiote-native/angular';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Tab } from './index';
import type { ITabNavigatorHandle } from './index';
import { TabScreenDirective } from '../tab-screen.directive';
import { injectIsFocused } from '../injectors/inject-is-focused';
import { injectRoute } from '../injectors/inject-route';
import type { IRoute } from '../../core';

const ROOT_TAG = 5121;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const fabric = installFabric();
// On a real Metro build, adapters/angular's babel-register-composed.cjs auto-registers `Tab`
// as an anchor host by scanning the AOT-compiled @Component's selector - vitest never runs that
// pipeline, so this test drives the same self-registration entry point by hand (mirrors
// renderer.test.ts's 'RefApiDemo' convention). Without it, `<Tab>` falls through to a raw
// Fabric createNode('Tab') call instead of a non-painting anchor.
registerComposedComponent('Tab');

beforeEach(() => {
  fabric.reset();
  capturedFeedInstance = undefined;
  capturedProfileInstance = undefined;
});
afterEach(() => unmount(ROOT_TAG));

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

let capturedFeedInstance: FeedScreenComponent | undefined;
let capturedProfileInstance: ProfileScreenComponent | undefined;

@Component({
  selector: 'feed-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>feed</symbiote-text
    ><symbiote-text>{{ paramsLabel() }}</symbiote-text>`,
})
class FeedScreenComponent {
  // Real screens (e.g. examples/angular's TabHomeScreen) call injectIsFocused() - see the
  // regression test below for why this matters.
  readonly isFocused: Signal<boolean> = injectIsFocused();
  // Exposes the live route (including its generated key, which the setParams() test below needs
  // to target this exact route) - the same injectRoute() a real tab screen calls.
  readonly route: Signal<IRoute<unknown>> = injectRoute();

  paramsLabel(): string {
    const params = this.route().params;
    return params === undefined ? 'none' : JSON.stringify(params);
  }

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedFeedInstance = this;
  }
}

@Component({
  selector: 'profile-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>profile</symbiote-text>`,
})
class ProfileScreenComponent {
  readonly isFocused: Signal<boolean> = injectIsFocused();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedProfileInstance = this;
  }
}

let capturedHost: TabTestHost | undefined;

@Component({
  selector: 'tab-test-host',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  template: `
    <Tab #nav initialRouteName="Feed">
      <ng-template
        symbioteTabScreen
        name="Feed"
        [component]="feedComponent"
        [options]="feedOptions"
      ></ng-template>
      <ng-template
        symbioteTabScreen
        name="Profile"
        [component]="profileComponent"
        [options]="profileOptions"
      ></ng-template>
    </Tab>
  `,
})
class TabTestHost {
  @ViewChild('nav') nav!: Tab;

  feedComponent = FeedScreenComponent;
  profileComponent = ProfileScreenComponent;
  feedOptions: Record<string, unknown> = { title: 'Feed', tabBarBadge: 3 };
  profileOptions: Record<string, unknown> = { tabBarLabel: 'Me' };

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

async function mountTab(): Promise<ITabNavigatorHandle> {
  capturedHost = undefined;
  mount(ROOT_TAG, TabTestHost);
  await tick();
  const host = capturedHost;
  if (!host) throw new Error('TabTestHost never mounted');
  return host.nav;
}

let capturedToggleHost: TabToggleHost | undefined;

// A marker behind an @if: the Angular twin of the {#if} fixture in
// svelte/tabs/tabs.smoke.test.ts, and the only way to make @ContentChildren emit a `changes`
// notification after mount.
@Component({
  selector: 'tab-toggle-host',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  template: `
    <Tab #nav initialRouteName="Feed">
      <ng-template
        symbioteTabScreen
        name="Feed"
        [component]="feedComponent"
        [options]="feedOptions"
      ></ng-template>
      @if (isProfileRegistered()) {
        <ng-template
          symbioteTabScreen
          name="Profile"
          [component]="profileComponent"
          [options]="profileOptions"
        ></ng-template>
      }
    </Tab>
  `,
})
class TabToggleHost {
  @ViewChild('nav') nav!: Tab;

  readonly isProfileRegistered = signal(true);
  feedComponent = FeedScreenComponent;
  profileComponent = ProfileScreenComponent;
  feedOptions: Record<string, unknown> = { title: 'Feed' };
  profileOptions: Record<string, unknown> = { tabBarLabel: 'Me' };

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedToggleHost = this;
  }
}

async function mountToggleTab(): Promise<TabToggleHost> {
  capturedToggleHost = undefined;
  mount(ROOT_TAG, TabToggleHost);
  await tick();
  const host = capturedToggleHost;
  if (!host) throw new Error('TabToggleHost never mounted');
  return host;
}

// Every raw text painted inside the bar items, in item order. One entry per registered screen for
// the toggle host, whose options carry no tabBarBadge - a badge paints a second text of its own.
function tabItemLabels(): string[] {
  const labels: string[] = [];
  const collect = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === 'RCTRawText' && typeof node.props.text === 'string')
        labels.push(node.props.text);
      collect(node.children);
    }
  };
  collect(tabItemNodes());
  return labels;
}

function tabItemNodes(): IFakeNode[] {
  const found: IFakeNode[] = [];
  const collect = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.props.accessibilityRole === 'tab') found.push(node);
      collect(node.children);
    }
  };
  collect(fabric.committed);
  return found;
}

// This adapter layer never throws on invalid navigation input - tabRouterReducer's jumpTo branch
// (core/tab-router-state/index.ts) is a total function (an unknown route name is a documented
// no-op), and the handle exposes no operation with a rejecting path. So there is no classic
// "Negative" group here; the Boundary describe below documents the no-op contract instead of
// inventing a throw that does not exist. Mirrors drawer.test.ts's identical framing.
describe('Angular Tab navigator', () => {
  describe('Positive - renders and reacts to the exposed navigator handle', () => {
    // why: like Drawer, a Tab only ever mounts the FOCUSED route's screen - mounting every route
    // up front would run every screen's lifecycle/effects even while hidden behind the bar,
    // wasting work and risking cross-screen side effects. The bar itself must mark exactly one
    // item selected, matching which screen is actually mounted.
    it("mounts only the initial route's content and marks it focused in the tab bar", async () => {
      await mountTab();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed'),
      ).toBeDefined();
      expect(
        findInTree(
          n => n.viewName === 'RCTRawText' && n.props.text === 'profile',
        ),
      ).toBeUndefined();
      const items = tabItemNodes();
      expect(items).toHaveLength(2);
      expect(items[0].props.accessibilityState).toEqual({ selected: true });
      expect(items[1].props.accessibilityState).toEqual({ selected: false });
    });

    // why: tabRouterReducer's jumpTo branch focuses by NAME (tab-actions' own JUMP_TO
    // convention, unlike the stack's by-key push/pop) - the imperative handle a caller uses from
    // outside the bar (e.g. a deep link) must move both the mounted screen and the bar's selected
    // item together, never one without the other.
    it('jumpTo() switches the mounted content and the focused tab bar item', async () => {
      const handle = await mountTab();
      handle.jumpTo('Profile');
      await tick();
      expect(
        findInTree(
          n => n.viewName === 'RCTRawText' && n.props.text === 'profile',
        ),
      ).toBeDefined();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed'),
      ).toBeUndefined();
      const items = tabItemNodes();
      expect(items[0].props.accessibilityState).toEqual({ selected: false });
      expect(items[1].props.accessibilityState).toEqual({ selected: true });
    });

    // why: a bar item must show SOMETHING even when the screen author didn't set tabBarLabel -
    // falling back to the route name (not a blank label) keeps every tab item legible, while an
    // explicit tabBarLabel/tabBarBadge must still win over that fallback when given.
    it('resolves tabBarLabel/title fallback and paints a badge', async () => {
      await mountTab();
      const items = tabItemNodes();
      // Feed: no tabBarLabel, falls back to title 'Feed'; badge '3' painted as a child text.
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'Feed'),
      ).toBeDefined();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === '3'),
      ).toBeDefined();
      // Profile: explicit tabBarLabel 'Me' wins over the route name.
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'Me'),
      ).toBeDefined();
      expect(items).toHaveLength(2);
    });

    // why: a tab bar item must be tappable exactly like any other pressable, not just
    // programmatically switchable via the imperative handle - onPress is synthesized by the
    // engine from a touchStart/touchEnd pair on the node (no direct native 'press' event, see
    // render-tabs.ts's own comment on ITabBarItemView.passthrough), so this proves the Angular
    // wiring reaches THAT synthesis, not just jumpTo() called directly.
    it('tapping a tab bar item calls jumpTo via the wired onPress passthrough', async () => {
      await mountTab();
      const items = tabItemNodes();
      const profileItem = items[1];
      const nativeEvent = {
        target: profileItem.tag,
        identifier: 1,
        pageX: 0,
        pageY: 0,
        locationX: 0,
        locationY: 0,
        timestamp: Date.now(),
      };
      fabric.fireEvent(
        profileItem.instanceHandle,
        'topTouchStart',
        nativeEvent,
      );
      fabric.fireEvent(profileItem.instanceHandle, 'topTouchEnd', nativeEvent);
      await tick();
      expect(
        findInTree(
          n => n.viewName === 'RCTRawText' && n.props.text === 'profile',
        ),
      ).toBeDefined();
    });

    // Regression test: focusedRouteEmitter() runs as a TEMPLATE EXPRESSION
    // ([emitter]="focusedRouteEmitter()"), evaluated inside Angular's reactive-read tracking
    // context for the current CD pass. It synchronously calls emitter.emit(FOCUS/BLUR), which
    // fan-out-calls every listener on that route's emitter synchronously too - including
    // injectIsFocused()'s `isFocused.set(...)`, since every real screen (TabHomeScreen,
    // TabSearchScreen, TabProfileScreen in examples/angular) calls injectIsFocused(). Angular
    // throws NG600 ("signal write during a template execution") the instant that set() runs
    // inside a tracked read - not gated behind ngDevMode, so this reproduces in every build,
    // not just dev. jumpTo() is exactly what a tab-bar tap fires (see the test above), so this
    // threw on literally every tab switch. drawer.ts's focusedRouteEmitter() has the identical
    // shape and its own regression test in drawer.test.ts.
    it('switching tabs does not throw when the newly-focused screen calls injectIsFocused()', async () => {
      const handle = await mountTab();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        handle.jumpTo('Profile');
        await tick();
        handle.jumpTo('Feed');
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
    // FOCUS event fires to zero listeners and is lost forever - isFocused stays false permanently,
    // exactly as reported ("focused: false", never changes, even after switching tabs back to it).
    it('the initially-focused screen actually observes isFocused() becoming true', async () => {
      await mountTab();
      await tick();
      expect(capturedFeedInstance).toBeDefined();
      expect(capturedFeedInstance?.isFocused()).toBe(true);
    });

    // why: exactly one screen must ever read itself as focused at a time - a stale `true` left on
    // the outgoing screen would let it keep reacting to focus-only side effects after it is no
    // longer visible or mounted.
    it('switching tabs toggles isFocused() true/false on the exiting/entering screens', async () => {
      const handle = await mountTab();
      await tick();
      handle.jumpTo('Profile');
      await tick();
      expect(capturedFeedInstance?.isFocused()).toBe(false);
      expect(capturedProfileInstance).toBeDefined();
      expect(capturedProfileInstance?.isFocused()).toBe(true);
    });

    // why: tabRouterReducer's setParams branch MERGES onto the target route's existing params
    // (CommonActions.setParams semantics, core/tab-router-state/index.ts) - a screen updating one
    // field (e.g. a search query) must not blow away params a caller set elsewhere via jumpTo's
    // own optional params argument.
    it("setParams() merges into the focused route's params, observed live via injectRoute()", async () => {
      const handle = await mountTab();
      await tick();
      const key = capturedFeedInstance?.route().key;
      if (key === undefined)
        throw new Error('Feed route never registered a key');
      handle.setParams({ query: 'cats' }, key);
      await tick();
      expect(capturedFeedInstance?.paramsLabel()).toBe('{"query":"cats"}');
    });
  });

  describe('Boundary - invalid navigation input is absorbed safely, not thrown', () => {
    // why: tabRouterReducer's jumpTo branch returns the SAME state when the name isn't found
    // (`index === -1`, core/tab-router-state/index.ts) - a typo'd or stale route name must be a
    // safe no-op, not a crash and not a silent focus change to an arbitrary route.
    it('ignores jumpTo to an unregistered route name', async () => {
      const handle = await mountTab();
      handle.jumpTo('does-not-exist');
      await tick();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed'),
      ).toBeDefined();
      expect(
        findInTree(
          n => n.viewName === 'RCTRawText' && n.props.text === 'profile',
        ),
      ).toBeUndefined();
      const items = tabItemNodes();
      expect(items[0].props.accessibilityState).toEqual({ selected: true });
      expect(items[1].props.accessibilityState).toEqual({ selected: false });
    });

    // why: tabRouterReducer's setParams branch returns the SAME state when the key isn't found
    // (`index === -1`) - a stale route key (e.g. from a screen that already unmounted) must be a
    // safe no-op, not a crash and not a silent write onto an arbitrary route.
    it('ignores setParams() targeting an unregistered route key', async () => {
      const handle = await mountTab();
      await tick();
      handle.setParams({ query: 'cats' }, 'does-not-exist-key');
      await tick();
      expect(capturedFeedInstance?.paramsLabel()).toBe('none');
    });
  });

  describe('registry changes after mount', () => {
    // why: a <ng-template symbioteTabScreen> behind an @if is how an app gates a tab on a feature
    // flag or a permission; the route list is a projection of the registered markers, so the tab
    // has to disappear with its marker rather than linger as an item labelled with the raw route
    // name.
    it('drops the tab of a screen unregistered after mount', async () => {
      const host = await mountToggleTab();
      expect(tabItemLabels()).toEqual(['Feed', 'Me']);

      host.isProfileRegistered.set(false);
      await tick();

      expect(tabItemLabels()).toEqual(['Feed']);
    });

    // why: dropping the user's current tab because a DIFFERENT screen was removed would be a
    // worse bug than the stale item itself - focus follows the route NAME, and the params
    // setParams accumulated onto the surviving route must ride along with it.
    it('keeps the focused route and its params when an unrelated screen unregisters', async () => {
      const host = await mountToggleTab();
      const key = capturedFeedInstance?.route().key;
      if (key === undefined)
        throw new Error('Feed route never registered a key');
      host.nav.setParams({ query: 'cats' }, key);
      await tick();

      host.isProfileRegistered.set(false);
      await tick();

      expect(capturedFeedInstance?.route().key).toBe(key);
      expect(capturedFeedInstance?.paramsLabel()).toBe('{"query":"cats"}');
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed'),
      ).toBeDefined();
    });

    // why: when the FOCUSED screen is the one that unregisters there is no route left to stay on,
    // so the fallback has to be explicit - the first remaining tab, the same landing spot a
    // navigator with an unresolvable initialRouteName gets.
    it('falls back to the first remaining tab when the focused screen unregisters', async () => {
      const host = await mountToggleTab();
      host.nav.jumpTo('Profile');
      await tick();
      expect(
        findInTree(
          n => n.viewName === 'RCTRawText' && n.props.text === 'profile',
        ),
      ).toBeDefined();

      host.isProfileRegistered.set(false);
      await tick();

      expect(tabItemLabels()).toEqual(['Feed']);
      expect(
        findInTree(
          n => n.viewName === 'RCTRawText' && n.props.text === 'profile',
        ),
      ).toBeUndefined();
      expect(
        findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed'),
      ).toBeDefined();
    });
  });
});
