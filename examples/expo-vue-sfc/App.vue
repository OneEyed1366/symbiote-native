<script setup lang="ts">
import { onMounted } from 'vue';
import { Screen, Stack } from '@symbiote-native/navigation/vue';
import type { IVueScreenOptions } from '@symbiote-native/navigation/vue';
import { hide } from '@symbiote-native/splash-screen/vue';
import './App.css';
import './ExpoViews.css';

import MenuScreen from './screens/MenuScreen.vue';
import { SCREENS } from './screen-table';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import type { INavLine } from './navigation-lines';

// The native header is OS chrome and never sees the class registry, so its colors are literals
const HEADER_BACKGROUND_COLOR = '#0b1622';
const HEADER_TITLE_COLOR = '#ffffff';

const MENU_OPTIONS: IVueScreenOptions = {
  title: 'Expo Modules Demos',
  headerTranslucent: true,
  headerTitleColor: HEADER_TITLE_COLOR,
  headerStyle: { backgroundColor: HEADER_BACKGROUND_COLOR },
  headerUserInterfaceStyle: 'dark',
};

// Demo screens share one dark translucent header and differ only in title and line tint
function demoScreenOptions(title: string, line: INavLine): IVueScreenOptions {
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

onMounted(() => hide());
</script>

<template>
  <Stack :initial-route-name="ROUTE_NAME.Menu">
    <Screen :name="ROUTE_NAME.Menu" :component="MenuScreen" :options="MENU_OPTIONS" />
    <Screen
      v-for="screen in SCREENS"
      :key="screen.name"
      :name="screen.name"
      :component="screen.component"
      :options="demoScreenOptions(screen.title, screen.line)"
    />
  </Stack>
</template>
