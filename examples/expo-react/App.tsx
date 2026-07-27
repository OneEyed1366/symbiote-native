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
    </Stack>
  );
}

export default App;
