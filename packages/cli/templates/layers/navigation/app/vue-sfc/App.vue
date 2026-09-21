<script setup>
import { Screen, Stack } from '@symbiote-native/navigation/vue';
import './App.css';

import MenuScreen from './MenuScreen.vue';
import DetailsScreen from './DetailsScreen.vue';
</script>

<template>
  <Stack initial-route-name="Menu">
    <Screen
      name="Menu"
      :component="MenuScreen"
      :options="{
        title: 'Home',
        headerTranslucent: true,
        headerTintColor: '#ffffff',
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      name="Details"
      :component="DetailsScreen"
      :options="{
        title: 'Details',
        headerTranslucent: true,
        headerTintColor: '#ffffff',
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
  </Stack>
</template>
