/**
 * Canary app entry: the native stack navigator over every demo screen, starting at Menu
 * Menu lists four sections, each opens a hub with its stops; Details is reached only by deep link
 *
 * @format
 */

import './App.css';
import './navigation.css';
import { defineComponent, onMounted, ref } from 'vue';
import { Stack, useLinkingIntegration } from '@symbiote-native/navigation/vue';
import type { INavigatorHandle } from '@symbiote-native/navigation/vue';
import { MenuScreen } from './screens/MenuScreen';
import { HUB_SCREENS } from './screens/SectionHubScreen';
import { CanaryScreen } from './screens/CanaryScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import {
  HeaderOptionsScreen,
  headerOptionsScreenOptions,
} from './screens/HeaderOptionsScreen';
import {
  SheetDemoScreen,
  sheetDemoScreenOptions,
} from './screens/SheetDemoScreen';
import { DEMO_SCREENS } from './screens/demo-screens';
import { HooksDemoScreen } from './screens/HooksDemoScreen';
import { ApiPlaygroundScreen } from './screens/ApiPlaygroundScreen';
import { BenchmarkScreen } from './screens/BenchmarkScreen';
import { ReanimatedScreen } from './screens/ReanimatedScreen';
import { StyleShowcaseScreen } from './screens/StyleShowcaseScreen';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import { hide } from '@symbiote-native/splash-screen/vue';

const App = defineComponent({
  name: 'App',
  setup() {
    const stackHandle = ref<INavigatorHandle | null>(null);

    onMounted(() => hide());

    // Takes the Ref of the Stack itself and reads `.value` in its own `onMounted`
    // Children mount first, so the Stack has filled `stackHandle` through `expose()` by then
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a Vue composable inside `setup()`
    useLinkingIntegration(APP_LINKING_CONFIG, stackHandle);

    return () => (
      <Stack ref={stackHandle} initialRouteName={ROUTE_NAME.Menu}>
        <Stack.Screen
          name={ROUTE_NAME.Menu}
          component={MenuScreen}
          options={{
            title: 'Navigation Demos',
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        {HUB_SCREENS.map(hub => (
          <Stack.Screen
            key={hub.name}
            name={hub.name}
            component={hub.component}
            options={hub.options}
          />
        ))}
        <Stack.Screen
          name={ROUTE_NAME.Canary}
          component={CanaryScreen}
          options={{
            title: 'Symbiote Canary',
            headerShown: true,
            headerTranslucent: true,
            headerTintColor: LINE_COLOR.primitives,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.Details}
          component={DetailsScreen}
          options={{
            title: 'Navigation Demo',
            headerTranslucent: true,
            headerTintColor: LINE_COLOR.primitives,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
            // Pinned, as the default animation resolved to a slower native transition
            stackAnimation: 'slide_from_right',
            transitionDuration: 300,
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.HeaderOptions}
          component={HeaderOptionsScreen}
          options={headerOptionsScreenOptions}
        />
        {DEMO_SCREENS.map(demo => (
          <Stack.Screen
            key={demo.name}
            name={demo.name}
            component={demo.component}
            options={demo.options}
          />
        ))}
        <Stack.Screen
          name={ROUTE_NAME.SheetDemo}
          component={SheetDemoScreen}
          options={sheetDemoScreenOptions}
        />
        <Stack.Screen
          name={ROUTE_NAME.HooksDemo}
          component={HooksDemoScreen}
          options={{
            title: 'Hooks Demo',
            headerShown: true,
            headerTintColor: LINE_COLOR.introspection,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.ApiPlayground}
          component={ApiPlaygroundScreen}
          options={{
            title: 'API Playground',
            headerShown: true,
            headerTintColor: LINE_COLOR.introspection,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.Reanimated}
          component={ReanimatedScreen}
          options={{
            title: 'Reanimated',
            headerShown: true,
            headerTintColor: LINE_COLOR.performance,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.Benchmark}
          component={BenchmarkScreen}
          options={{
            title: 'Benchmark',
            headerShown: true,
            headerTintColor: LINE_COLOR.performance,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.StyleShowcase}
          component={StyleShowcaseScreen}
          options={{
            title: 'Styling showcase',
            headerShown: true,
            headerTintColor: LINE_COLOR.styling,
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
