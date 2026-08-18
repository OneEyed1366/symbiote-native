<script lang="ts">
  // Symbiote canary app entry: composes the native stack navigator
  // (@symbiote-native/navigation/svelte, driven by react-native-screens' RNSScreen/RNSScreenStack
  // native views) over the Expo-package demo surface. Menu is the initial route. Svelte twin of
  // examples/expo-vue-sfc/App.vue — `<Screen>` (not the dotted `Stack.Screen`) is the same marker
  // the barrel exports at the top level, so templates never need a dotted tag reference.
  //
  // The markers paint nothing: Svelte hands a component an opaque Snippet with no way to
  // enumerate it, so each <Screen> registers ITSELF with the Stack through context during its own
  // init (packages/navigation/src/svelte/screen-registry.ts). Authoring is unchanged, discovery is
  // inverted.
  import { Screen, Stack } from '@symbiote-native/navigation/svelte';
  import type { ISvelteScreenOptions } from '@symbiote-native/navigation/svelte';
  import { hide } from '@symbiote-native/splash-screen/svelte';
  import './App.css';

  import MenuScreen from './screens/MenuScreen.svelte';
  import SensorsScreen from './screens/SensorsScreen.svelte';
  import LocalAuthScreen from './screens/LocalAuthScreen.svelte';
  import HapticsScreen from './screens/HapticsScreen.svelte';
  import ClipboardScreen from './screens/ClipboardScreen.svelte';
  import BatteryScreen from './screens/BatteryScreen.svelte';
  import BrightnessScreen from './screens/BrightnessScreen.svelte';
  import CellularScreen from './screens/CellularScreen.svelte';
  import NetworkScreen from './screens/NetworkScreen.svelte';
  import DeviceScreen from './screens/DeviceScreen.svelte';
  import ApplicationScreen from './screens/ApplicationScreen.svelte';
  import CryptoScreen from './screens/CryptoScreen.svelte';
  import WebCryptoScreen from './screens/WebCryptoScreen.svelte';
  import SystemUiScreen from './screens/SystemUiScreen.svelte';
  import StoreReviewScreen from './screens/StoreReviewScreen.svelte';
  import KeepAwakeScreen from './screens/KeepAwakeScreen.svelte';
  import ScreenOrientationScreen from './screens/ScreenOrientationScreen.svelte';
  import LocalizationScreen from './screens/LocalizationScreen.svelte';
  import TrackingTransparencyScreen from './screens/TrackingTransparencyScreen.svelte';
  import SecureStoreScreen from './screens/SecureStoreScreen.svelte';
  import SharingScreen from './screens/SharingScreen.svelte';
  import WebBrowserScreen from './screens/WebBrowserScreen.svelte';
  import SmsScreen from './screens/SmsScreen.svelte';
  import { ROUTE_NAME } from './routes';
  import { LINE_COLOR } from './navigation-lines';

  // --ink / --chalk-bright from App.css. The native header is OS chrome, not a Fabric view, so it
  // never sees the class registry — these two have to be passed as literal colors.
  const HEADER_BACKGROUND_COLOR = '#0b1622';
  const HEADER_TITLE_COLOR = '#ffffff';

  // Every demo screen wears the same dark translucent header and differs only in title and tint
  // (its own line color, navigation-lines.ts). Vue's App.vue repeats the five shared fields per
  // <Screen>; one factory says the same thing once and keeps a tint typo from hiding in the noise.
  function demoScreenOptions(
    title: string,
    headerTintColor: string,
  ): ISvelteScreenOptions {
    return {
      title,
      headerShown: true,
      headerTintColor,
      headerTranslucent: true,
      headerTitleColor: HEADER_TITLE_COLOR,
      headerStyle: { backgroundColor: HEADER_BACKGROUND_COLOR },
      headerUserInterfaceStyle: 'dark',
    };
  }

  $effect(() => {
    hide();
  });
</script>

<Stack initialRouteName={ROUTE_NAME.Menu}>
  <Screen
    name={ROUTE_NAME.Menu}
    component={MenuScreen}
    options={{
      title: 'Navigation Demos',
      headerTranslucent: true,
      headerTitleColor: HEADER_TITLE_COLOR,
      headerStyle: { backgroundColor: HEADER_BACKGROUND_COLOR },
      headerUserInterfaceStyle: 'dark',
    }}
  />
  <Screen
    name={ROUTE_NAME.Sensors}
    component={SensorsScreen}
    options={demoScreenOptions('Sensors', LINE_COLOR.sensors)}
  />
  <Screen
    name={ROUTE_NAME.LocalAuth}
    component={LocalAuthScreen}
    options={demoScreenOptions('Local Auth', LINE_COLOR['local-auth'])}
  />
  <Screen
    name={ROUTE_NAME.Haptics}
    component={HapticsScreen}
    options={demoScreenOptions('Haptics', LINE_COLOR.haptics)}
  />
  <Screen
    name={ROUTE_NAME.Clipboard}
    component={ClipboardScreen}
    options={demoScreenOptions('Clipboard', LINE_COLOR.clipboard)}
  />
  <Screen
    name={ROUTE_NAME.Battery}
    component={BatteryScreen}
    options={demoScreenOptions('Battery', LINE_COLOR.battery)}
  />
  <Screen
    name={ROUTE_NAME.Brightness}
    component={BrightnessScreen}
    options={demoScreenOptions('Brightness', LINE_COLOR.brightness)}
  />
  <Screen
    name={ROUTE_NAME.Cellular}
    component={CellularScreen}
    options={demoScreenOptions('Cellular', LINE_COLOR.cellular)}
  />
  <Screen
    name={ROUTE_NAME.Network}
    component={NetworkScreen}
    options={demoScreenOptions('Network', LINE_COLOR.network)}
  />
  <Screen
    name={ROUTE_NAME.Device}
    component={DeviceScreen}
    options={demoScreenOptions('Device', LINE_COLOR.device)}
  />
  <Screen
    name={ROUTE_NAME.Application}
    component={ApplicationScreen}
    options={demoScreenOptions('Application', LINE_COLOR.application)}
  />
  <Screen
    name={ROUTE_NAME.Crypto}
    component={CryptoScreen}
    options={demoScreenOptions('Crypto', LINE_COLOR.crypto)}
  />
  <Screen
    name={ROUTE_NAME.StandardWebCrypto}
    component={WebCryptoScreen}
    options={demoScreenOptions('Web Crypto', LINE_COLOR['standard-web-crypto'])}
  />
  <Screen
    name={ROUTE_NAME.SystemUi}
    component={SystemUiScreen}
    options={demoScreenOptions('System UI', LINE_COLOR['system-ui'])}
  />
  <Screen
    name={ROUTE_NAME.StoreReview}
    component={StoreReviewScreen}
    options={demoScreenOptions('Store Review', LINE_COLOR['store-review'])}
  />
  <Screen
    name={ROUTE_NAME.KeepAwake}
    component={KeepAwakeScreen}
    options={demoScreenOptions('Keep Awake', LINE_COLOR['keep-awake'])}
  />
  <Screen
    name={ROUTE_NAME.ScreenOrientation}
    component={ScreenOrientationScreen}
    options={demoScreenOptions(
      'Screen Orientation',
      LINE_COLOR['screen-orientation'],
    )}
  />
  <Screen
    name={ROUTE_NAME.Localization}
    component={LocalizationScreen}
    options={demoScreenOptions('Localization', LINE_COLOR.localization)}
  />
  <Screen
    name={ROUTE_NAME.TrackingTransparency}
    component={TrackingTransparencyScreen}
    options={demoScreenOptions(
      'Tracking Transparency',
      LINE_COLOR['tracking-transparency'],
    )}
  />
  <Screen
    name={ROUTE_NAME.SecureStore}
    component={SecureStoreScreen}
    options={demoScreenOptions('Secure Store', LINE_COLOR['secure-store'])}
  />
  <Screen
    name={ROUTE_NAME.Sharing}
    component={SharingScreen}
    options={demoScreenOptions('Sharing', LINE_COLOR.sharing)}
  />
  <Screen
    name={ROUTE_NAME.WebBrowser}
    component={WebBrowserScreen}
    options={demoScreenOptions('Web Browser', LINE_COLOR['web-browser'])}
  />
  <Screen
    name={ROUTE_NAME.Sms}
    component={SmsScreen}
    options={demoScreenOptions('SMS', LINE_COLOR.sms)}
  />
</Stack>
