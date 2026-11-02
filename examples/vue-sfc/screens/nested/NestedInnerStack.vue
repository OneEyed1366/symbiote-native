<script setup lang="ts">
import { Screen, Stack } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../../navigation-lines';
import InnerDetailScreen from './InnerDetailScreen.vue';
import InnerRootScreen from './InnerRootScreen.vue';
import { useNestedPanel } from './nested-panel';
import { innerStackStyleOf } from './nested-settings';

const INNER_HEADER = {
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#13243a' },
  headerUserInterfaceStyle: 'dark',
} as const;

const { settings } = useNestedPanel();
</script>

<template>
  <Stack :native-container-style="innerStackStyleOf(settings)">
    <Screen
      name="InnerRoot"
      :component="InnerRootScreen"
      :options="{ title: 'Inner stack', ...INNER_HEADER }"
    />
    <Screen
      name="InnerDetail"
      :component="InnerDetailScreen"
      :options="{ title: 'Inner detail', ...INNER_HEADER }"
    />
  </Stack>
</template>
