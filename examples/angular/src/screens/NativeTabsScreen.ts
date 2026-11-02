import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  NativeTab,
  NativeTabScreenDirective,
} from '@symbiote-native/navigation/angular';
import type {
  IAngularScreenOptions,
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
} from '@symbiote-native/navigation/angular';
import { LINE_COLOR } from '../navigation-lines';
import { ConfigTab } from './native-tabs/ConfigTab';
import { FeedTab } from './native-tabs/FeedTab';
import {
  badgeValueOf,
  injectNativeTabsDemo,
  nativeTabsDemoProvider,
} from './native-tabs/native-tabs-demo';
import { InboxTab, LockedTab, SearchTab } from './native-tabs/PlainTab';

export const nativeTabsScreenOptions: IAngularScreenOptions = {
  title: 'Native tabs',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

// Log the four lifecycle callbacks of a tab under its name
function lifecycleLog(logEvent: (line: string) => void, name: string) {
  return {
    onWillAppear: () => logEvent(`${name}: onWillAppear`),
    onDidAppear: () => logEvent(`${name}: onDidAppear`),
    onWillDisappear: () => logEvent(`${name}: onWillDisappear`),
    onDidDisappear: () => logEvent(`${name}: onDidDisappear`),
  };
}

// The tab bar fills the screen, so the control panel is the first tab instead of a header
// The settings sit in this component's providers, so every tab mounted below reads the same ones
@Component({
  selector: 'NativeTabsScreen',
  standalone: true,
  imports: [NativeTab, NativeTabScreenDirective, SYMBIOTE_ELEMENTS],
  providers: [nativeTabsDemoProvider],
  template: `
    <NativeTab
      initialRouteName="Config"
      [host]="host()"
      [bottomAccessory]="accessory"
    >
      <ng-template
        symbioteNativeTabScreen
        name="Config"
        [component]="configTab"
        [options]="configOptions"
      ></ng-template>
      <ng-template
        symbioteNativeTabScreen
        name="Feed"
        [component]="feedTab"
        [options]="feedOptions()"
      ></ng-template>
      <ng-template
        symbioteNativeTabScreen
        name="Inbox"
        [component]="inboxTab"
        [options]="inboxOptions()"
      ></ng-template>
      <ng-template
        symbioteNativeTabScreen
        name="Locked"
        [component]="lockedTab"
        [options]="lockedOptions()"
      ></ng-template>
      <ng-template
        symbioteNativeTabScreen
        name="Search"
        [component]="searchTab"
        [options]="searchOptions"
      ></ng-template>
    </NativeTab>
    <!-- Native asks for one view per environment and shows the one that fits the bar state -->
    <ng-template #accessory let-environment>
      <view testID="native-tabs-accessory-strip" class="accessory">
        <text class="info-text">Now playing · {{ environment }}</text>
      </view>
    </ng-template>
  `,
})
export class NativeTabsScreen {
  private readonly demo = injectNativeTabsDemo();
  private readonly settings = this.demo.settings;

  readonly configTab = ConfigTab;
  readonly feedTab = FeedTab;
  readonly inboxTab = InboxTab;
  readonly lockedTab = LockedTab;
  readonly searchTab = SearchTab;

  readonly host = computed<INativeTabsViewHostOptions>(() => {
    const settings = this.settings();
    return {
      tabBarHidden: settings.isBarHidden,
      colorScheme: settings.scheme,
      direction: settings.direction,
      onTabSelected: event =>
        this.demo.logEvent(
          `selected ${event.selectedScreenKey.slice(0, 6)} by ${event.actionOrigin}`,
        ),
      onTabSelectionPrevented: event =>
        this.demo.logEvent(`prevented ${event.preventedScreenKey.slice(0, 6)}`),
      ios: {
        tabBarMinimizeBehavior: settings.minimize,
        tabBarControllerMode: settings.controllerMode,
        tabBarSidebarPreferredPlacement: settings.sidebarPlacement,
        tabBarTintColor: settings.isTinted ? LINE_COLOR.routing : undefined,
        bottomAccessoryHidden: !settings.isAccessoryShown,
      },
    };
  });

  readonly configOptions: INativeTabsViewScreenOptions = {
    title: 'Config',
    tabBarItemTestID: 'native-tabs-item-config',
    ios: {
      icon: { type: 'sfSymbol', name: 'gearshape' },
      selectedIcon: { type: 'sfSymbol', name: 'gearshape.fill' },
    },
    ...lifecycleLog(this.demo.logEvent, 'Config'),
  };

  readonly feedOptions = computed<INativeTabsViewScreenOptions>(() => ({
    title: 'Feed',
    tabBarItemTestID: 'native-tabs-item-feed',
    specialEffects: {
      repeatedTabSelection: { scrollToTop: this.settings().isScrollToTop },
    },
    ios: {
      icon: { type: 'sfSymbol', name: 'list.bullet' },
      selectedIcon: { type: 'sfSymbol', name: 'list.bullet.rectangle.fill' },
    },
    ...lifecycleLog(this.demo.logEvent, 'Feed'),
  }));

  readonly inboxOptions = computed<INativeTabsViewScreenOptions>(() => ({
    title: 'Inbox',
    badgeValue: badgeValueOf(this.settings().badge),
    tabBarItemTestID: 'native-tabs-item-inbox',
    ios: {
      icon: { type: 'sfSymbol', name: 'tray' },
      selectedIcon: { type: 'sfSymbol', name: 'tray.fill' },
    },
    ...lifecycleLog(this.demo.logEvent, 'Inbox'),
  }));

  readonly lockedOptions = computed<INativeTabsViewScreenOptions>(() => ({
    title: 'Locked',
    preventNativeSelection: this.settings().isLocked,
    tabBarItemTestID: 'native-tabs-item-locked',
    ios: {
      icon: { type: 'sfSymbol', name: 'lock' },
      selectedIcon: { type: 'sfSymbol', name: 'lock.open.fill' },
    },
    ...lifecycleLog(this.demo.logEvent, 'Locked'),
  }));

  readonly searchOptions: INativeTabsViewScreenOptions = {
    title: 'Search',
    tabBarItemTestID: 'native-tabs-item-search',
    ios: {
      role: 'search',
      icon: { type: 'sfSymbol', name: 'magnifyingglass' },
    },
    ...lifecycleLog(this.demo.logEvent, 'Search'),
  };
}
