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
import { SCREENS } from './screen-table';
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
        {SCREENS.map(screen => (
          <Stack.Screen
            key={screen.name}
            name={screen.name}
            component={screen.component}
            options={{
              title: screen.title,
              headerShown: true,
              headerTintColor: LINE_COLOR[screen.line],
              headerTranslucent: true,
              headerTitleColor: '#ffffff',
              headerStyle: { backgroundColor: '#0b1622' },
              headerUserInterfaceStyle: 'dark',
            }}
          />
        ))}
      </Stack>
    );
  },
});

export default App;
