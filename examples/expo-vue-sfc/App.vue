<!--
  Symbiote canary app entry: composes the native stack navigator (@symbiote-native/navigation/vue,
  driven by react-native-screens' RNSScreen/RNSScreenStack native views) over the Expo-package demo
  surface — Menu, Sensors, Local auth. Menu is the initial route. Vue SFC twin of
  .examples/react/App.tsx: `<Screen>` (not the dotted `Stack.Screen`) is the same marker every
  ./screens SFC imports standalone — @symbiote-native/navigation/vue exports it at the top level
  (screen.ts) precisely so templates never need a dotted tag reference.
-->
<script setup lang="ts">
import { onMounted } from 'vue';
import { Screen, Stack } from '@symbiote-native/navigation/vue';
import { hide } from '@symbiote-native/splash-screen/vue';
import './App.css';

import MenuScreen from './screens/MenuScreen.vue';
import SensorsScreen from './screens/SensorsScreen.vue';
import LocalAuthScreen from './screens/LocalAuthScreen.vue';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';

onMounted(() => hide());
</script>

<template>
  <Stack :initial-route-name="ROUTE_NAME.Menu">
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
      :name="ROUTE_NAME.Sensors"
      :component="SensorsScreen"
      :options="{
        title: 'Sensors',
        headerShown: true,
        headerTranslucent: true,
        headerTintColor: LINE_COLOR.sensors,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.LocalAuth"
      :component="LocalAuthScreen"
      :options="{
        title: 'Local Auth',
        headerShown: true,
        headerTintColor: LINE_COLOR['local-auth'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
  </Stack>
</template>
