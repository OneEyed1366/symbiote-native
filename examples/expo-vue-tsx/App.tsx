/**
 * Symbiote canary app entry: composes the native stack navigator
 * (@symbiote-native/navigation/vue, driven by react-native-screens' RNSScreen/
 * RNSScreenStack native views) over the Expo-modules-core demo surface. Menu is the initial
 * route — a menu of buttons, one per Expo-SDK-ported @symbiote-native package (Sensors, Local
 * Auth, …). This app is the Expo-packages demo home — see ../vue-tsx for the full
 * @symbiote-native/navigation feature tour + every @symbiote-native/vue primitive.
 *
 * @format
 */

import './App.css';
import { defineComponent, onMounted } from 'vue';
import { Stack } from '@symbiote-native/navigation/vue';
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
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import { hide } from '@symbiote-native/splash-screen/vue';

const App = defineComponent({
  name: 'App',
  setup() {
    onMounted(() => hide());

    return () => (
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
      </Stack>
    );
  },
});

export default App;
