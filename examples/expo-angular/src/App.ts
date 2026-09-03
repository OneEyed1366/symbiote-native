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
import { DeviceScreen } from './screens/DeviceScreen';
import { ApplicationScreen } from './screens/ApplicationScreen';
import { CryptoScreen } from './screens/CryptoScreen';
import { WebCryptoScreen } from './screens/WebCryptoScreen';
import { SystemUiScreen } from './screens/SystemUiScreen';
import { StoreReviewScreen } from './screens/StoreReviewScreen';
import { KeepAwakeScreen } from './screens/KeepAwakeScreen';
import { ScreenOrientationScreen } from './screens/ScreenOrientationScreen';
import { LocalizationScreen } from './screens/LocalizationScreen';
import { TrackingTransparencyScreen } from './screens/TrackingTransparencyScreen';
import { SecureStoreScreen } from './screens/SecureStoreScreen';
import { SharingScreen } from './screens/SharingScreen';
import { WebBrowserScreen } from './screens/WebBrowserScreen';
import { SmsScreen } from './screens/SmsScreen';
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
      <ng-template
        symbioteScreen
        name="Menu"
        [component]="menuScreen"
        [options]="menuOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Sensors"
        [component]="sensorsScreen"
        [options]="sensorsOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="LocalAuth"
        [component]="localAuthScreen"
        [options]="localAuthOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Haptics"
        [component]="hapticsScreen"
        [options]="hapticsOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Clipboard"
        [component]="clipboardScreen"
        [options]="clipboardOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Battery"
        [component]="batteryScreen"
        [options]="batteryOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Brightness"
        [component]="brightnessScreen"
        [options]="brightnessOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Cellular"
        [component]="cellularScreen"
        [options]="cellularOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Network"
        [component]="networkScreen"
        [options]="networkOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Device"
        [component]="deviceScreen"
        [options]="deviceOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Application"
        [component]="applicationScreen"
        [options]="applicationOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Crypto"
        [component]="cryptoScreen"
        [options]="cryptoOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="StandardWebCrypto"
        [component]="webCryptoScreen"
        [options]="webCryptoOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="SystemUi"
        [component]="systemUiScreen"
        [options]="systemUiOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="StoreReview"
        [component]="storeReviewScreen"
        [options]="storeReviewOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="KeepAwake"
        [component]="keepAwakeScreen"
        [options]="keepAwakeOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="ScreenOrientation"
        [component]="screenOrientationScreen"
        [options]="screenOrientationOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Localization"
        [component]="localizationScreen"
        [options]="localizationOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="TrackingTransparency"
        [component]="trackingTransparencyScreen"
        [options]="trackingTransparencyOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="SecureStore"
        [component]="secureStoreScreen"
        [options]="secureStoreOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Sharing"
        [component]="sharingScreen"
        [options]="sharingOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="WebBrowser"
        [component]="webBrowserScreen"
        [options]="webBrowserOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        name="Sms"
        [component]="smsScreen"
        [options]="smsOptions"
      ></ng-template>
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
  readonly deviceScreen = DeviceScreen;
  readonly applicationScreen = ApplicationScreen;
  readonly cryptoScreen = CryptoScreen;
  readonly webCryptoScreen = WebCryptoScreen;
  readonly systemUiScreen = SystemUiScreen;
  readonly storeReviewScreen = StoreReviewScreen;
  readonly keepAwakeScreen = KeepAwakeScreen;
  readonly screenOrientationScreen = ScreenOrientationScreen;
  readonly localizationScreen = LocalizationScreen;
  readonly trackingTransparencyScreen = TrackingTransparencyScreen;
  readonly secureStoreScreen = SecureStoreScreen;
  readonly sharingScreen = SharingScreen;
  readonly webBrowserScreen = WebBrowserScreen;
  readonly smsScreen = SmsScreen;

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

  readonly deviceOptions: IAngularScreenOptions = {
    title: 'Device',
    headerShown: true,
    headerTintColor: LINE_COLOR.device,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly applicationOptions: IAngularScreenOptions = {
    title: 'Application',
    headerShown: true,
    headerTintColor: LINE_COLOR.application,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly cryptoOptions: IAngularScreenOptions = {
    title: 'Crypto',
    headerShown: true,
    headerTintColor: LINE_COLOR.crypto,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly webCryptoOptions: IAngularScreenOptions = {
    title: 'Web Crypto',
    headerShown: true,
    headerTintColor: LINE_COLOR['standard-web-crypto'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly systemUiOptions: IAngularScreenOptions = {
    title: 'System UI',
    headerShown: true,
    headerTintColor: LINE_COLOR['system-ui'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly storeReviewOptions: IAngularScreenOptions = {
    title: 'Store Review',
    headerShown: true,
    headerTintColor: LINE_COLOR['store-review'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly keepAwakeOptions: IAngularScreenOptions = {
    title: 'Keep Awake',
    headerShown: true,
    headerTintColor: LINE_COLOR['keep-awake'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly screenOrientationOptions: IAngularScreenOptions = {
    title: 'Screen Orientation',
    headerShown: true,
    headerTintColor: LINE_COLOR['screen-orientation'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly localizationOptions: IAngularScreenOptions = {
    title: 'Localization',
    headerShown: true,
    headerTintColor: LINE_COLOR.localization,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly trackingTransparencyOptions: IAngularScreenOptions = {
    title: 'Tracking Transparency',
    headerShown: true,
    headerTintColor: LINE_COLOR['tracking-transparency'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly secureStoreOptions: IAngularScreenOptions = {
    title: 'Secure Store',
    headerShown: true,
    headerTintColor: LINE_COLOR['secure-store'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly sharingOptions: IAngularScreenOptions = {
    title: 'Sharing',
    headerShown: true,
    headerTintColor: LINE_COLOR.sharing,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly webBrowserOptions: IAngularScreenOptions = {
    title: 'Web Browser',
    headerShown: true,
    headerTintColor: LINE_COLOR['web-browser'],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly smsOptions: IAngularScreenOptions = {
    title: 'SMS',
    headerShown: true,
    headerTintColor: LINE_COLOR.sms,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  ngOnInit(): void {
    hide();
  }
}
