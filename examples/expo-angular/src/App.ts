/**
 * Symbiote canary app entry: composes the native stack navigator
 * (@symbiote-native/navigation/angular, driven by react-native-screens' RNSScreen/
 * RNSScreenStack native views) over the Expo-modules-core demo surface. Menu is the initial
 * route — a menu of buttons, one per Expo-SDK-ported @symbiote-native package (Sensors, Local
 * Auth, …). This app is the Expo-packages demo home — see ../angular for the full
 * @symbiote-native/navigation feature tour + every @symbiote-native/angular primitive.
 *
 * @format
 */

import { Component, OnInit } from '@angular/core';
import { Stack, ScreenDirective } from '@symbiote-native/navigation/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { hide } from '@symbiote-native/splash-screen/angular';
import { MenuScreen } from './screens/MenuScreen';
import { SensorsScreen } from './screens/SensorsScreen';
import { LocalAuthScreen } from './screens/LocalAuthScreen';
import { HapticsScreen } from './screens/HapticsScreen';
import { ClipboardScreen } from './screens/ClipboardScreen';
import { BatteryScreen } from './screens/BatteryScreen';
import { BrightnessScreen } from './screens/BrightnessScreen';
import { CellularScreen } from './screens/CellularScreen';
import { NetworkScreen } from './screens/NetworkScreen';
import { LINE_COLOR } from './navigation-lines';
// Static look lives in App.css — a plain global .css file, compiled at build time by
// @symbiote-native/css-parser and resolved at runtime through the shared style registry every
// adapter's class/className/addClass path shares.
import './App.css';

const DARK_HEADER_STYLE = { backgroundColor: '#0b1622' } as const;

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack initialRouteName="Menu">
      <ng-template symbioteScreen name="Menu" [component]="menuScreen" [options]="menuOptions"></ng-template>
      <ng-template symbioteScreen name="Sensors" [component]="sensorsScreen" [options]="sensorsOptions"></ng-template>
      <ng-template symbioteScreen name="LocalAuth" [component]="localAuthScreen" [options]="localAuthOptions"></ng-template>
      <ng-template symbioteScreen name="Haptics" [component]="hapticsScreen" [options]="hapticsOptions"></ng-template>
      <ng-template symbioteScreen name="Clipboard" [component]="clipboardScreen" [options]="clipboardOptions"></ng-template>
      <ng-template symbioteScreen name="Battery" [component]="batteryScreen" [options]="batteryOptions"></ng-template>
      <ng-template symbioteScreen name="Brightness" [component]="brightnessScreen" [options]="brightnessOptions"></ng-template>
      <ng-template symbioteScreen name="Cellular" [component]="cellularScreen" [options]="cellularOptions"></ng-template>
      <ng-template symbioteScreen name="Network" [component]="networkScreen" [options]="networkOptions"></ng-template>
    </Stack>
  `,
})
export class AppComponent implements OnInit {
  readonly menuScreen = MenuScreen;
  readonly sensorsScreen = SensorsScreen;
  readonly localAuthScreen = LocalAuthScreen;
  readonly hapticsScreen = HapticsScreen;
  readonly clipboardScreen = ClipboardScreen;
  readonly batteryScreen = BatteryScreen;
  readonly brightnessScreen = BrightnessScreen;
  readonly cellularScreen = CellularScreen;
  readonly networkScreen = NetworkScreen;

  readonly menuOptions: IAngularScreenOptions = {
    title: 'Expo Modules Demos',
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly sensorsOptions: IAngularScreenOptions = {
    title: 'Sensors',
    headerShown: true,
    headerTintColor: LINE_COLOR.sensors,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly localAuthOptions: IAngularScreenOptions = {
    title: 'Local Auth',
    headerShown: true,
    headerTintColor: LINE_COLOR['local-auth'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly hapticsOptions: IAngularScreenOptions = {
    title: 'Haptics',
    headerShown: true,
    headerTintColor: LINE_COLOR.haptics,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly clipboardOptions: IAngularScreenOptions = {
    title: 'Clipboard',
    headerShown: true,
    headerTintColor: LINE_COLOR.clipboard,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly batteryOptions: IAngularScreenOptions = {
    title: 'Battery',
    headerShown: true,
    headerTintColor: LINE_COLOR.battery,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly brightnessOptions: IAngularScreenOptions = {
    title: 'Brightness',
    headerShown: true,
    headerTintColor: LINE_COLOR.brightness,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly cellularOptions: IAngularScreenOptions = {
    title: 'Cellular',
    headerShown: true,
    headerTintColor: LINE_COLOR.cellular,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly networkOptions: IAngularScreenOptions = {
    title: 'Network',
    headerShown: true,
    headerTintColor: LINE_COLOR.network,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  ngOnInit(): void {
    hide();
  }
}
