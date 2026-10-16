/**
 * Canary app entry: the native stack navigator over the demo screens, Menu first
 * Details has no menu row, the DeepLinking stop resolves to it (symbiotecanaryvuetsx://details/:id)
 *
 * @format
 */

import './App.css';
import { defineComponent, onMounted, ref } from 'vue';
import { Stack, useLinkingIntegration } from '@symbiote-native/navigation/vue';
import type { INavigatorHandle } from '@symbiote-native/navigation/vue';
import { MenuScreen } from './screens/MenuScreen';
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
import { TabsDemoScreen } from './screens/TabsDemoScreen';
import { DrawerDemoScreen } from './screens/DrawerDemoScreen';
import { NestedNavigatorsScreen } from './screens/NestedNavigatorsScreen';
import { HooksDemoScreen } from './screens/HooksDemoScreen';
import { DeepLinkingScreen } from './screens/DeepLinkingScreen';
import { StatePersistenceScreen } from './screens/StatePersistenceScreen';
import { ApiPlaygroundScreen } from './screens/ApiPlaygroundScreen';
import { BenchmarkScreen } from './screens/BenchmarkScreen';
import { StyleShowcaseScreen } from './screens/StyleShowcaseScreen';
import { ReanimatedScreen } from './screens/ReanimatedScreen';
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
        <Stack.Screen
          name={ROUTE_NAME.SheetDemo}
          component={SheetDemoScreen}
          options={sheetDemoScreenOptions}
        />
        <Stack.Screen
          name={ROUTE_NAME.TabsDemo}
          component={TabsDemoScreen}
          options={{
            title: 'Tabs Demo',
            headerShown: true,
            headerTintColor: LINE_COLOR.structure,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.DrawerDemo}
          component={DrawerDemoScreen}
          options={{
            title: 'Drawer Demo',
            headerShown: true,
            headerTintColor: LINE_COLOR.structure,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.NestedNavigators}
          component={NestedNavigatorsScreen}
          options={{
            title: 'Nested Navigators',
            headerShown: true,
            headerTintColor: LINE_COLOR.structure,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
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
          name={ROUTE_NAME.DeepLinking}
          component={DeepLinkingScreen}
          options={{
            title: 'Deep Linking',
            headerShown: true,
            headerTintColor: LINE_COLOR.routing,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.StatePersistence}
          component={StatePersistenceScreen}
          options={{
            title: 'State Persistence',
            headerShown: true,
            headerTintColor: LINE_COLOR.routing,
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
            headerTintColor: LINE_COLOR.framework,
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
      </Stack>
    );
  },
});

export default App;
