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
import { ROUTE_NAME } from './routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from './navigation-lines';
import { SCREENS } from './screen-registry';
import { hide } from '@symbiote-native/splash-screen/react';
import './App.css';
import './ExpoViews.css';

const HEADER_BACKGROUND = '#0b1622';
const HEADER_TITLE_COLOR = '#ffffff';

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
          headerTitleColor: HEADER_TITLE_COLOR,
          headerStyle: { backgroundColor: HEADER_BACKGROUND },
          headerUserInterfaceStyle: 'dark',
        }}
      />
      {SCREENS.map(({ route, component, title }) => (
        <Stack.Screen
          key={route}
          name={route}
          component={component}
          options={{
            title,
            headerShown: true,
            headerTintColor: LINE_COLOR[ROUTE_LINE_INFO[route].line],
            headerTranslucent: true,
            headerTitleColor: HEADER_TITLE_COLOR,
            headerStyle: { backgroundColor: HEADER_BACKGROUND },
            headerUserInterfaceStyle: 'dark',
          }}
        />
      ))}
    </Stack>
  );
}

export default App;
