<!-- Canary app entry: the native stack navigator over every demo screen, starting at Menu -->
<!-- Menu lists four sections, each opens a hub with its stops; Details is reached by deep link -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  Screen,
  Stack,
  useLinkingIntegration,
} from '@symbiote-native/navigation/vue';
import type { INavigatorHandle } from '@symbiote-native/navigation/vue';
import { hide } from '@symbiote-native/splash-screen/vue';
import './App.css';
import './navigation.css';

import MenuScreen from './screens/MenuScreen.vue';
import CanaryScreen from './screens/CanaryScreen.vue';
import DetailsScreen from './screens/DetailsScreen.vue';
import HeaderOptionsScreen, {
  headerOptionsScreenOptions,
} from './screens/HeaderOptionsScreen.vue';
import SheetDemoScreen, {
  sheetDemoScreenOptions,
} from './screens/SheetDemoScreen.vue';
import HooksDemoScreen from './screens/HooksDemoScreen.vue';
import ApiPlaygroundScreen from './screens/ApiPlaygroundScreen.vue';
import BenchmarkScreen from './screens/BenchmarkScreen.vue';
import StyleShowcaseScreen from './screens/StyleShowcaseScreen.vue';
import ReanimatedScreen from './screens/ReanimatedScreen.vue';
import { DEMO_SCREENS } from './screens/demo-screens';
import { HUB_SCREENS } from './screens/hub-screens';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';

// The linking hook takes the Ref of the Stack, as children mount before `onMounted` runs
const stackHandle = ref<INavigatorHandle | null>(null);
useLinkingIntegration(APP_LINKING_CONFIG, stackHandle);

onMounted(() => hide());
</script>

<template>
  <Stack ref="stackHandle" :initial-route-name="ROUTE_NAME.Menu">
    <Screen
      :name="ROUTE_NAME.Menu"
      :component="MenuScreen"
      :options="{
        title: 'Navigation Demos',
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      v-for="hub in HUB_SCREENS"
      :key="hub.name"
      :name="hub.name"
      :component="hub.component"
      :options="hub.options"
    />
    <Screen
      :name="ROUTE_NAME.Canary"
      :component="CanaryScreen"
      :options="{
        title: 'Symbiote Canary',
        headerShown: true,
        headerTranslucent: true,
        headerTintColor: LINE_COLOR.primitives,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Details"
      :component="DetailsScreen"
      :options="{
        title: 'Navigation Demo',
        headerTranslucent: true,
        headerTintColor: LINE_COLOR.primitives,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
        stackAnimation: 'slide_from_right',
        transitionDuration: 300,
      }"
    />
    <Screen
      :name="ROUTE_NAME.HeaderOptions"
      :component="HeaderOptionsScreen"
      :options="headerOptionsScreenOptions"
    />
    <Screen
      v-for="demo in DEMO_SCREENS"
      :key="demo.name"
      :name="demo.name"
      :component="demo.component"
      :options="demo.options"
    />
    <Screen
      :name="ROUTE_NAME.SheetDemo"
      :component="SheetDemoScreen"
      :options="sheetDemoScreenOptions"
    />
    <Screen
      :name="ROUTE_NAME.HooksDemo"
      :component="HooksDemoScreen"
      :options="{
        title: 'Hooks Demo',
        headerShown: true,
        headerTintColor: LINE_COLOR.introspection,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.ApiPlayground"
      :component="ApiPlaygroundScreen"
      :options="{
        title: 'API Playground',
        headerShown: true,
        headerTintColor: LINE_COLOR.introspection,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Reanimated"
      :component="ReanimatedScreen"
      :options="{
        title: 'Reanimated',
        headerShown: true,
        headerTintColor: LINE_COLOR.performance,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Benchmark"
      :component="BenchmarkScreen"
      :options="{
        title: 'Benchmark',
        headerShown: true,
        headerTintColor: LINE_COLOR.performance,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.StyleShowcase"
      :component="StyleShowcaseScreen"
      :options="{
        title: 'Styling showcase',
        headerShown: true,
        headerTintColor: LINE_COLOR.styling,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
  </Stack>
</template>
