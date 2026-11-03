<script lang="ts">
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';
import {
  nestedOptionsOf,
  readNestedSettings,
} from './nested/nested-settings';

// Opaque, so the bar of the parent and the bar of the inner stack read as two bars
export const nestedNavigatorsScreenOptions: IScreenOptionsResolver = ({
  route,
}) => ({
  title: 'Nested Navigators',
  headerTintColor: LINE_COLOR.structure,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  ...nestedOptionsOf(readNestedSettings(route.params)),
});
</script>

<script setup lang="ts">
import { Tab, TabScreen } from '@symbiote-native/navigation/vue';
import NestedInfoScreen from './nested/NestedInfoScreen.vue';
import NestedInnerStack from './nested/NestedInnerStack.vue';
import NestedScreens from './nested/NestedScreens.vue';
import { NestedPanelContext } from './nested/nested-panel';
import { nestedTabOptionsOf } from './nested/nested-settings';
import { useRouteSettings } from './use-route-settings';

// The panel lives in the params of this route, the screen above both navigators owns it
const { settings, update } = useRouteSettings(readNestedSettings);
NestedPanelContext.provide({ settings, update });
</script>

<template>
  <Tab initial-route-name="NestedHome">
    <TabScreen
      name="NestedHome"
      :component="NestedScreens"
      :options="nestedTabOptionsOf('NestedHome')"
    />
    <TabScreen
      name="NestedInner"
      :component="NestedInnerStack"
      :options="nestedTabOptionsOf('NestedInner')"
    />
    <TabScreen
      name="NestedInfo"
      :component="NestedInfoScreen"
      :options="nestedTabOptionsOf('NestedInfo')"
    />
  </Tab>
</template>
