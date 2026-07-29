import { Component } from '@angular/core';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

type IMenuItem = {
  label: string;
  route: ITourRouteName;
  hint: string;
};

const MENU_ITEMS: readonly IMenuItem[] = [
  { label: 'Sensors', route: ROUTE_NAME.Sensors, hint: '@symbiote-native/sensors — Accelerometer, Gyroscope, Magnetometer, DeviceMotion, Pedometer' },
  { label: 'Local auth', route: ROUTE_NAME.LocalAuth, hint: '@symbiote-native/local-auth — FaceID/TouchID/fingerprint' },
  { label: 'Haptics', route: ROUTE_NAME.Haptics, hint: '@symbiote-native/haptics — impact/notification/selection vibration feedback' },
  { label: 'Clipboard', route: ROUTE_NAME.Clipboard, hint: '@symbiote-native/clipboard — read/write the system clipboard, with a live change listener' },
  { label: 'Battery', route: ROUTE_NAME.Battery, hint: '@symbiote-native/battery — live battery level, charging state, and low power mode' },
  { label: 'Brightness', route: ROUTE_NAME.Brightness, hint: '@symbiote-native/brightness — screen brightness get/set, Android system-brightness mode, permission gating' },
  { label: 'Cellular', route: ROUTE_NAME.Cellular, hint: '@symbiote-native/cellular — cellular generation, carrier/SIM info, permission gating' },
  { label: 'Network', route: ROUTE_NAME.Network, hint: '@symbiote-native/network — live network state, IP address, airplane mode' },
];

/**
 * Root menu for the Expo-modules-core demo surface: one row per Expo-SDK-ported
 * @symbiote-native package, each pushing its own dedicated demo screen onto the same root Stack.
 * Angular twin of ../../react/screens/MenuScreen.tsx.
 *
 * Rows are grouped into thematic "lines" (navigation-lines.ts's ROUTE_LINE_INFO) — a color +
 * 2-letter badge per line, carried through onto each demo screen's own line tag.
 */
@Component({
  selector: 'MenuScreen',
  standalone: true,
  imports: [Pressable, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="menu-scroll" class="screen" contentContainerStyle="scroll-content">
        <View class="menu-hero">
          <Text class="menu-eyebrow">EXPO MODULES DEMOS</Text>
          <Text class="menu-hero-title">Expo-SDK ports on a real native stack</Text>
          <Text class="menu-hero-subtitle">
            Each row below demos a different @symbiote-native package built on expo-modules-core.
          </Text>
        </View>
        @for (item of menuItems; track item.route) {
          <Pressable
            [testID]="'menu-row-' + item.route"
            [class]="rowClass(item)"
            (press)="navigation.push(item.route)"
          >
            <View [class]="badgeClass(item)">
              <Text class="menu-badge-text">{{ lineInfoFor(item).code }}</Text>
            </View>
            <View class="menu-row-copy">
              <Text class="menu-row-label">{{ item.label }}</Text>
              <Text [class]="hintClass(item)">{{ item.hint }}</Text>
            </View>
          </Pressable>
        }
      </ScrollView>
    </SafeAreaView>
  `,
})
export class MenuScreen {
  readonly navigation = injectStackNavigation();

  readonly menuItems = MENU_ITEMS;

  lineInfoFor(item: IMenuItem) {
    return ROUTE_LINE_INFO[item.route];
  }

  rowClass(item: IMenuItem): string {
    return `menu-row menu-row-${this.lineInfoFor(item).line}`;
  }

  badgeClass(item: IMenuItem): string {
    return `menu-badge menu-badge-${this.lineInfoFor(item).line}`;
  }

  hintClass(item: IMenuItem): string {
    return `menu-row-hint menu-row-hint-${this.lineInfoFor(item).line}`;
  }
}
