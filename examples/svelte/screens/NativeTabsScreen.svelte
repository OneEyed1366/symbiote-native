<script lang="ts" module>
  import type { ISvelteScreenOptions } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';

  export const nativeTabsScreenOptions: ISvelteScreenOptions = {
    title: 'Native tabs',
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
  };
</script>

<script lang="ts">
  import { NativeTab } from '@symbiote-native/navigation/svelte';
  import ConfigTab from './native-tabs/ConfigTab.svelte';
  import FeedTab from './native-tabs/FeedTab.svelte';
  import PlainTab from './native-tabs/PlainTab.svelte';
  import {
    badgeValueOf,
    provideNativeTabsDemo,
  } from './native-tabs/native-tabs-demo.svelte';

  // The tab bar fills the screen, so the control panel is the first tab instead of a header
  const demo = provideNativeTabsDemo();

  function sfSymbol(name: string) {
    return { type: 'sfSymbol', name } as const;
  }

  // Log the four lifecycle callbacks of a tab under its name
  function lifecycleLog(name: string) {
    return {
      onWillAppear: () => demo.logEvent(`${name}: onWillAppear`),
      onDidAppear: () => demo.logEvent(`${name}: onDidAppear`),
      onWillDisappear: () => demo.logEvent(`${name}: onWillDisappear`),
      onDidDisappear: () => demo.logEvent(`${name}: onDidDisappear`),
    };
  }
</script>

<NativeTab
  initialRouteName="Config"
  tabBarHidden={demo.settings.isBarHidden}
  colorScheme={demo.settings.scheme}
  direction={demo.settings.direction}
  onTabSelected={event =>
    demo.logEvent(
      `selected ${event.selectedScreenKey.slice(0, 6)} by ${event.actionOrigin}`,
    )}
  onTabSelectionPrevented={event =>
    demo.logEvent(`prevented ${event.preventedScreenKey.slice(0, 6)}`)}
  ios={{
    tabBarMinimizeBehavior: demo.settings.minimize,
    tabBarControllerMode: demo.settings.controllerMode,
    tabBarSidebarPreferredPlacement: demo.settings.sidebarPlacement,
    tabBarTintColor: demo.settings.isTinted ? LINE_COLOR.routing : undefined,
    bottomAccessoryHidden: !demo.settings.isAccessoryShown,
  }}
>
  <NativeTab.Screen
    name="Config"
    component={ConfigTab}
    options={{
      title: 'Config',
      tabBarItemTestID: 'native-tabs-item-config',
      ios: {
        icon: sfSymbol('gearshape'),
        selectedIcon: sfSymbol('gearshape.fill'),
      },
      ...lifecycleLog('Config'),
    }}
  />
  <NativeTab.Screen
    name="Feed"
    component={FeedTab}
    options={{
      title: 'Feed',
      tabBarItemTestID: 'native-tabs-item-feed',
      specialEffects: {
        repeatedTabSelection: { scrollToTop: demo.settings.isScrollToTop },
      },
      ios: {
        icon: sfSymbol('list.bullet'),
        selectedIcon: sfSymbol('list.bullet.rectangle.fill'),
      },
      ...lifecycleLog('Feed'),
    }}
  />
  <NativeTab.Screen
    name="Inbox"
    component={PlainTab}
    options={{
      title: 'Inbox',
      badgeValue: badgeValueOf(demo.settings.badge),
      tabBarItemTestID: 'native-tabs-item-inbox',
      ios: { icon: sfSymbol('tray'), selectedIcon: sfSymbol('tray.fill') },
      ...lifecycleLog('Inbox'),
    }}
  />
  <NativeTab.Screen
    name="Locked"
    component={PlainTab}
    options={{
      title: 'Locked',
      preventNativeSelection: demo.settings.isLocked,
      tabBarItemTestID: 'native-tabs-item-locked',
      ios: { icon: sfSymbol('lock'), selectedIcon: sfSymbol('lock.open.fill') },
      ...lifecycleLog('Locked'),
    }}
  />
  <NativeTab.Screen
    name="Search"
    component={PlainTab}
    options={{
      title: 'Search',
      tabBarItemTestID: 'native-tabs-item-search',
      ios: { role: 'search', icon: sfSymbol('magnifyingglass') },
      ...lifecycleLog('Search'),
    }}
  />
  <!-- Native asks for one view per environment and shows the one that fits the bar state -->
  {#snippet bottomAccessory(environment)}
    <view testID="native-tabs-accessory-strip" class="accessory">
      <text class="info-text">{`Now playing · ${environment}`}</text>
    </view>
  {/snippet}
</NativeTab>
