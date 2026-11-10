<script lang="ts">
import type { IVueScreenOptions } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';

export const nativeTabsScreenOptions: IVueScreenOptions = {
  title: 'Native tabs',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};
</script>

<script setup lang="ts">
import { NativeTab, NativeTabScreen } from '@symbiote-native/navigation/vue';
import ConfigTab from './native-tabs/ConfigTab.vue';
import FeedTab from './native-tabs/FeedTab.vue';
import PlainTab from './native-tabs/PlainTab.vue';
import {
  badgeValueOf,
  provideNativeTabsDemo,
} from './native-tabs/native-tabs-demo';

// The tab bar fills the screen, so the control panel is the first tab instead of a header
const { settings, logEvent } = provideNativeTabsDemo();

function sfSymbol(name: string) {
  return { type: 'sfSymbol', name } as const;
}

// Log the four lifecycle callbacks of a tab under its name
function lifecycleLog(name: string) {
  return {
    onWillAppear: () => logEvent(`${name}: onWillAppear`),
    onDidAppear: () => logEvent(`${name}: onDidAppear`),
    onWillDisappear: () => logEvent(`${name}: onWillDisappear`),
    onDidDisappear: () => logEvent(`${name}: onDidDisappear`),
  };
}
</script>

<template>
  <NativeTab
    initial-route-name="Config"
    :tab-bar-hidden="settings.isBarHidden"
    :color-scheme="settings.scheme"
    :direction="settings.direction"
    :on-tab-selected="
      event =>
        logEvent(
          `selected ${event.selectedScreenKey.slice(0, 6)} by ${event.actionOrigin}`,
        )
    "
    :on-tab-selection-prevented="
      event => logEvent(`prevented ${event.preventedScreenKey.slice(0, 6)}`)
    "
    :ios="{
      tabBarMinimizeBehavior: settings.minimize,
      tabBarControllerMode: settings.controllerMode,
      tabBarSidebarPreferredPlacement: settings.sidebarPlacement,
      tabBarTintColor: settings.isTinted ? LINE_COLOR.routing : undefined,
      bottomAccessoryHidden: !settings.isAccessoryShown,
    }"
  >
    <NativeTabScreen
      name="Config"
      :component="ConfigTab"
      :options="{
        title: 'Config',
        tabBarItemTestID: 'native-tabs-item-config',
        ios: {
          icon: sfSymbol('gearshape'),
          selectedIcon: sfSymbol('gearshape.fill'),
        },
        ...lifecycleLog('Config'),
      }"
    />
    <NativeTabScreen
      name="Feed"
      :component="FeedTab"
      :options="{
        title: 'Feed',
        tabBarItemTestID: 'native-tabs-item-feed',
        specialEffects: {
          repeatedTabSelection: { scrollToTop: settings.isScrollToTop },
        },
        ios: {
          icon: sfSymbol('list.bullet'),
          selectedIcon: sfSymbol('list.bullet.rectangle.fill'),
        },
        ...lifecycleLog('Feed'),
      }"
    />
    <NativeTabScreen
      name="Inbox"
      :component="PlainTab"
      :options="{
        title: 'Inbox',
        badgeValue: badgeValueOf(settings.badge),
        tabBarItemTestID: 'native-tabs-item-inbox',
        ios: { icon: sfSymbol('tray'), selectedIcon: sfSymbol('tray.fill') },
        ...lifecycleLog('Inbox'),
      }"
    />
    <NativeTabScreen
      name="Locked"
      :component="PlainTab"
      :options="{
        title: 'Locked',
        preventNativeSelection: settings.isLocked,
        tabBarItemTestID: 'native-tabs-item-locked',
        ios: { icon: sfSymbol('lock'), selectedIcon: sfSymbol('lock.open.fill') },
        ...lifecycleLog('Locked'),
      }"
    />
    <NativeTabScreen
      name="Search"
      :component="PlainTab"
      :options="{
        title: 'Search',
        tabBarItemTestID: 'native-tabs-item-search',
        ios: { role: 'search', icon: sfSymbol('magnifyingglass') },
        ...lifecycleLog('Search'),
      }"
    />
    <!-- Native asks for one view per environment and shows the one that fits the bar state -->
    <template #bottomAccessory="{ environment }">
      <view testID="native-tabs-accessory-strip" class="accessory">
        <text class="info-text">{{ `Now playing · ${environment}` }}</text>
      </view>
    </template>
  </NativeTab>
</template>
