<!-- Canary app entry: the native stack navigator over the demo screens, Menu first -->

<!-- Details has no menu row, the DeepLinking stop resolves to symbiotecanaryvuesfc://details -->

<!-- `<Screen>` is exported by the navigation package, so a template needs no dotted tag -->

<!-- The linking hook takes the Ref of the Stack, as children mount before `onMounted` runs -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  Screen,
  Stack,
  useLinkingIntegration,
} from '@symbiote-native/navigation/vue';
import type {
  INavigatorHandle,
  IScreenOptions,
} from '@symbiote-native/navigation/vue';
import { hide } from '@symbiote-native/splash-screen/vue';
import './App.css';

import MenuScreen from './screens/MenuScreen.vue';
import CanaryScreen from './screens/CanaryScreen.vue';
import DetailsScreen from './screens/DetailsScreen.vue';
import HeaderOptionsScreen from './screens/HeaderOptionsScreen.vue';
import { headerOptionsScreenOptions } from './screens/header-options-screen-options';
import SheetDemoScreen from './screens/SheetDemoScreen.vue';
import TabsDemoScreen from './screens/TabsDemoScreen.vue';
import DrawerDemoScreen from './screens/DrawerDemoScreen.vue';
import NestedNavigatorsScreen from './screens/NestedNavigatorsScreen.vue';
import HooksDemoScreen from './screens/HooksDemoScreen.vue';
import DeepLinkingScreen from './screens/DeepLinkingScreen.vue';
import StatePersistenceScreen from './screens/StatePersistenceScreen.vue';
import ApiPlaygroundScreen from './screens/ApiPlaygroundScreen.vue';
import BenchmarkScreen from './screens/BenchmarkScreen.vue';
import StyleShowcaseScreen from './screens/StyleShowcaseScreen.vue';
import ReanimatedScreen from './screens/ReanimatedScreen.vue';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';

// Registered below on the `SheetDemo` marker, as none of these fields need the live handle
const sheetDemoScreenOptions: IScreenOptions = {
  title: 'Sheet Demo',
  headerShown: true,
  // Not translucent, as `formSheet` has its own header height accounting in react-native-screens
  // An opaque `headerStyle` leaves that sizing path alone

  // The screen wraps its content in a `ScrollView`, the one child react-native-screens resizes
  // It has to be the first direct child of the wrapper, so the screen skips `SafeAreaView`
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  stackPresentation: 'formSheet',
  sheetAllowedDetents: [0.3, 0.6, 1],
  sheetGrabberVisible: true,
  sheetCornerRadius: 20,
  sheetInitialDetentIndex: 0,
};

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
      :name="ROUTE_NAME.SheetDemo"
      :component="SheetDemoScreen"
      :options="sheetDemoScreenOptions"
    />
    <Screen
      :name="ROUTE_NAME.TabsDemo"
      :component="TabsDemoScreen"
      :options="{
        title: 'Tabs Demo',
        headerShown: true,
        headerTintColor: LINE_COLOR.structure,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.DrawerDemo"
      :component="DrawerDemoScreen"
      :options="{
        title: 'Drawer Demo',
        headerShown: true,
        headerTintColor: LINE_COLOR.structure,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.NestedNavigators"
      :component="NestedNavigatorsScreen"
      :options="{
        title: 'Nested Navigators',
        headerShown: true,
        headerTintColor: LINE_COLOR.structure,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
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
      :name="ROUTE_NAME.DeepLinking"
      :component="DeepLinkingScreen"
      :options="{
        title: 'Deep Linking',
        headerShown: true,
        headerTintColor: LINE_COLOR.routing,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.StatePersistence"
      :component="StatePersistenceScreen"
      :options="{
        title: 'State Persistence',
        headerShown: true,
        headerTintColor: LINE_COLOR.routing,
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
        headerTintColor: LINE_COLOR.composition,
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
  </Stack>
</template>
