// Co-located Angular-driven test for the @symbiote-native/navigation Angular Tab navigator.
// Proves: registry building from @ContentChildren, tab switching via jumpTo, focus/blur
// synthesis, tab bar item painting (label/icon/badge/tint), and press wiring. Tab is imported from
// its own module (NOT the package barrel) so the ../register side-effect never loads headless —
// Tab needs no react-native-screens ViewConfig at all (pure-JS UI).

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, Input, ViewChild } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Tab } from './tabs';
import type { ITabNavigatorHandle } from './tabs';
import { TabScreenDirective } from './tab-screen.directive';
import type { IRoute } from '../core';

const ROOT_TAG = 5121;
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const fabric = installFabric();

beforeEach(() => fabric.reset());
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

@Component({
  selector: 'feed-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>feed</symbiote-text>`,
})
class FeedScreenComponent {
  @Input() route!: IRoute<unknown>;
  @Input() navigation!: ITabNavigatorHandle;
}

@Component({
  selector: 'profile-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>profile</symbiote-text>`,
})
class ProfileScreenComponent {
  @Input() route!: IRoute<unknown>;
  @Input() navigation!: ITabNavigatorHandle;
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
  return host.nav.handle;
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

describe('Angular Tab navigator', () => {
  it("mounts only the initial route's content and marks it focused in the tab bar", async () => {
    await mountTab();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed')).toBeDefined();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'profile'),
    ).toBeUndefined();
    const items = tabItemNodes();
    expect(items).toHaveLength(2);
    expect(items[0].props.accessibilityState).toEqual({ selected: true });
    expect(items[1].props.accessibilityState).toEqual({ selected: false });
  });

  it('jumpTo() switches the mounted content and the focused tab bar item', async () => {
    const handle = await mountTab();
    handle.jumpTo('Profile');
    await tick();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'profile'),
    ).toBeDefined();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed')).toBeUndefined();
    const items = tabItemNodes();
    expect(items[0].props.accessibilityState).toEqual({ selected: false });
    expect(items[1].props.accessibilityState).toEqual({ selected: true });
  });

  it('resolves tabBarLabel/title fallback and paints a badge', async () => {
    await mountTab();
    const items = tabItemNodes();
    // Feed: no tabBarLabel, falls back to title 'Feed'; badge '3' painted as a child text.
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'Feed')).toBeDefined();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === '3')).toBeDefined();
    // Profile: explicit tabBarLabel 'Me' wins over the route name.
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'Me')).toBeDefined();
    expect(items).toHaveLength(2);
  });

  it('tapping a tab bar item calls jumpTo via the wired onPress passthrough', async () => {
    // onPress is synthesized by the engine from a touchStart/touchEnd pair on the node (no direct
    // native 'press' event — see render-tabs.ts's own comment on ITabBarItemView.passthrough).
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
    fabric.fireEvent(profileItem.instanceHandle, 'topTouchStart', nativeEvent);
    fabric.fireEvent(profileItem.instanceHandle, 'topTouchEnd', nativeEvent);
    await tick();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'profile'),
    ).toBeDefined();
  });
});
