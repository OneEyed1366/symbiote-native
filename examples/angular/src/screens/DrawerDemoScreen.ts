import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  Drawer,
  DrawerScreenDirective,
  injectDrawerNavigation,
} from '@symbiote-native/navigation/angular';
import type {
  IAngularScreenOptions,
  IDrawerContentContext,
  IDrawerScreenOptions,
} from '@symbiote-native/navigation/angular';
import type { IRoute } from '@symbiote-native/navigation';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';
import { ScreenHero } from '../components/ScreenHero';
import { DrawerRecipes } from './drawer/DrawerRecipes';
import { drawerPanelProvider, injectDrawerPanel } from './drawer/drawer-panel';
import { drawerPropsOf } from './drawer/drawer-settings';

export const drawerDemoScreenOptions: IAngularScreenOptions = {
  title: 'Drawer Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

const DRAWER_STYLE = { backgroundColor: '#13243a' };

const homeOptions: IDrawerScreenOptions = {
  title: 'Home',
  drawerLabel: 'Home',
};

const settingsOptions: IDrawerScreenOptions = {
  title: 'Settings',
  drawerLabel: 'Settings',
};

@Component({
  selector: 'DrawerHomeScreen',
  standalone: true,
  imports: [DrawerRecipes, ScreenHero, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view
      testID="drawer-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Drawer"
          body="A swipeable drawer driven by the navigator's own gesture handler. Change its props below and swipe from the chosen edge."
        ></ScreenHero>
        <DrawerRecipes></DrawerRecipes>
      </view>
    </scroll-view>
  `,
})
export class DrawerHomeScreen {
  readonly route = ROUTE_NAME.DrawerDemo;
}

@Component({
  selector: 'DrawerSettingsScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <text class="section-label">Drawer demo · Settings</text>
        <ActionButton
          testID="drawer-close-from-settings"
          title="Close drawer"
          (press)="navigation.closeDrawer()"
          [color]="color"
        ></ActionButton>
      </view>
    </scroll-view>
  `,
})
export class DrawerSettingsScreen {
  readonly navigation = injectDrawerNavigation();
  readonly color = LINE_COLOR.structure;
}

// The panel lives here, above the Drawer, so its two screens share it and it outlives a switch
@Component({
  selector: 'DrawerDemoScreen',
  standalone: true,
  imports: [Drawer, DrawerScreenDirective, SYMBIOTE_ELEMENTS],
  providers: [drawerPanelProvider],
  template: `
    <Drawer
      initialRouteName="Home"
      [drawerType]="props().drawerType"
      [drawerPosition]="props().drawerPosition"
      [drawerWidth]="props().drawerWidth"
      [overlayColor]="props().overlayColor"
      [swipeEnabled]="props().swipeEnabled"
      [swipeEdgeWidth]="props().swipeEdgeWidth"
      [swipeMinDistance]="props().swipeMinDistance"
      [swipeMinVelocity]="props().swipeMinVelocity"
      [drawerStyle]="drawerStyle"
    >
      <ng-template
        symbioteDrawerScreen
        name="Home"
        [component]="drawerHomeScreen"
        [options]="homeOptions"
      ></ng-template>
      <ng-template
        symbioteDrawerScreen
        name="Settings"
        [component]="drawerSettingsScreen"
        [options]="settingsOptions"
      ></ng-template>
      <ng-template #drawerContent let-ctx>
        <safe-area-view
          testID="drawer-panel"
          class="section-tight drawer-panel"
        >
          <text class="section-label">Menu</text>
          @for (route of ctx.state.routes; track route.key) {
            <pressable
              [testID]="'drawer-menu-' + route.name"
              class="menu-row"
              (press)="ctx.navigation.jumpTo(route.name)"
            >
              <text class="menu-row-label">{{
                drawerLabelFor(ctx.descriptors, route)
              }}</text>
            </pressable>
          }
        </safe-area-view>
      </ng-template>
    </Drawer>
  `,
})
export class DrawerDemoScreen {
  private readonly settings = injectDrawerPanel().settings;

  readonly drawerHomeScreen = DrawerHomeScreen;
  readonly drawerSettingsScreen = DrawerSettingsScreen;
  readonly homeOptions = homeOptions;
  readonly settingsOptions = settingsOptions;
  readonly drawerStyle = DRAWER_STYLE;
  readonly props = computed(() => drawerPropsOf(this.settings()));

  drawerLabelFor(
    descriptors: IDrawerContentContext['$implicit']['descriptors'],
    route: IRoute<unknown>,
  ): string {
    return descriptors[route.key]?.options.drawerLabel ?? route.name;
  }
}
