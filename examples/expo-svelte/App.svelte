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
  import './ExpoViews.css';

  import MenuScreen from './screens/MenuScreen.svelte';
  import { SCREENS } from './screen-table';
  import { ROUTE_NAME } from './routes';
  import { LINE_COLOR } from './navigation-lines';
  import type { INavLine } from './navigation-lines';

  // --ink / --chalk-bright from App.css. The native header is OS chrome, not a Fabric view, so it
  // never sees the class registry — these two have to be passed as literal colors.
  const HEADER_BACKGROUND_COLOR = '#0b1622';
  const HEADER_TITLE_COLOR = '#ffffff';

  // Every demo screen wears the same dark translucent header and differs only in title and tint
  // (its own line color, navigation-lines.ts)
  function demoScreenOptions(title: string, line: INavLine): ISvelteScreenOptions {
    return {
      title,
      headerShown: true,
      headerTintColor: LINE_COLOR[line],
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
      title: 'Expo Modules Demos',
      headerTranslucent: true,
      headerTitleColor: HEADER_TITLE_COLOR,
      headerStyle: { backgroundColor: HEADER_BACKGROUND_COLOR },
      headerUserInterfaceStyle: 'dark',
    }}
  />
  {#each SCREENS as screen (screen.name)}
    <Screen
      name={screen.name}
      component={screen.component}
      options={demoScreenOptions(screen.title, screen.line)}
    />
  {/each}
</Stack>
