/**
 * Symbiote canary app entry: composes the native stack navigator
 * (@symbiote-native/navigation/react, driven by react-native-screens' RNSScreen/
 * RNSScreenStack native views) over the Expo-modules-core demo surface. Menu is the initial
 * route — a menu of buttons, one per Expo-SDK-ported @symbiote-native package (Sensors, Local
 * Auth, …). This app is the Expo-packages demo home — see ../react for the full
 * @symbiote-native/navigation feature tour + every @symbiote-native/react primitive.
 *
 * @format
 */

import { useEffect } from 'react';
import { Stack } from '@symbiote-native/navigation/react';
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
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import { hide } from '@symbiote-native/splash-screen/react';
import './App.css';

function App() {
  useEffect(() => {
    hide();
  }, []);

  return (
    <Stack initialRouteName={ROUTE_NAME.Menu}>
      <Stack.Screen
        name={ROUTE_NAME.Menu}
        component={MenuScreen}
        options={{
          title: 'Expo Modules Demos',
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Sensors}
        component={SensorsScreen}
        options={{
          title: 'Sensors',
          headerShown: true,
          headerTintColor: LINE_COLOR.sensors,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.LocalAuth}
        component={LocalAuthScreen}
        options={{
          title: 'Local Auth',
          headerShown: true,
          headerTintColor: LINE_COLOR['local-auth'],
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Haptics}
        component={HapticsScreen}
        options={{
          title: 'Haptics',
          headerShown: true,
          headerTintColor: LINE_COLOR.haptics,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Clipboard}
        component={ClipboardScreen}
        options={{
          title: 'Clipboard',
          headerShown: true,
          headerTintColor: LINE_COLOR.clipboard,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Battery}
        component={BatteryScreen}
        options={{
          title: 'Battery',
          headerShown: true,
          headerTintColor: LINE_COLOR.battery,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Brightness}
        component={BrightnessScreen}
        options={{
          title: 'Brightness',
          headerShown: true,
          headerTintColor: LINE_COLOR.brightness,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Cellular}
        component={CellularScreen}
        options={{
          title: 'Cellular',
          headerShown: true,
          headerTintColor: LINE_COLOR.cellular,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Network}
        component={NetworkScreen}
        options={{
          title: 'Network',
          headerShown: true,
          headerTintColor: LINE_COLOR.network,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Device}
        component={DeviceScreen}
        options={{
          title: 'Device',
          headerShown: true,
          headerTintColor: LINE_COLOR.device,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Application}
        component={ApplicationScreen}
        options={{
          title: 'Application',
          headerShown: true,
          headerTintColor: LINE_COLOR.application,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Crypto}
        component={CryptoScreen}
        options={{
          title: 'Crypto',
          headerShown: true,
          headerTintColor: LINE_COLOR.crypto,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.StandardWebCrypto}
        component={WebCryptoScreen}
        options={{
          title: 'Web Crypto',
          headerShown: true,
          headerTintColor: LINE_COLOR['standard-web-crypto'],
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.SystemUi}
        component={SystemUiScreen}
        options={{
          title: 'System UI',
          headerShown: true,
          headerTintColor: LINE_COLOR['system-ui'],
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.StoreReview}
        component={StoreReviewScreen}
        options={{
          title: 'Store Review',
          headerShown: true,
          headerTintColor: LINE_COLOR['store-review'],
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.KeepAwake}
        component={KeepAwakeScreen}
        options={{
          title: 'Keep Awake',
          headerShown: true,
          headerTintColor: LINE_COLOR['keep-awake'],
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.ScreenOrientation}
        component={ScreenOrientationScreen}
        options={{
          title: 'Screen Orientation',
          headerShown: true,
          headerTintColor: LINE_COLOR['screen-orientation'],
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.Localization}
        component={LocalizationScreen}
        options={{
          title: 'Localization',
          headerShown: true,
          headerTintColor: LINE_COLOR.localization,
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      <Stack.Screen
        name={ROUTE_NAME.TrackingTransparency}
        component={TrackingTransparencyScreen}
        options={{
          title: 'Tracking Transparency',
          headerShown: true,
          headerTintColor: LINE_COLOR['tracking-transparency'],
          headerTranslucent: true,
          headerTitleColor: '#ffffff',
          headerStyle: { backgroundColor: '#0b1622' },
          headerUserInterfaceStyle: 'dark',
        }}
      />
    </Stack>
  );
}

export default App;
