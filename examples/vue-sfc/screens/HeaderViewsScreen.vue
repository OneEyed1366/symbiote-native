<script lang="ts">
import { h } from 'vue';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/vue';
import HeaderTapView from '../components/HeaderTapView.vue';
import { LINE_COLOR } from '../navigation-lines';
import { BACK_ARROW_SOURCE } from './header-views/back-arrow';
import {
  headerOptionsOf,
  navBarFillOf,
  readHeaderViewsSettings,
  VIEW_KIND,
} from './header-views/header-views-settings';

// The route params hold the panel state, so every switch re-runs this resolver
export const headerViewsScreenOptions: IScreenOptionsResolver = ({
  route,
  navigation,
}) => {
  const settings = readHeaderViewsSettings(route.params);
  const tapView = (testID: string, label: string, name: string) => () =>
    h(HeaderTapView, {
      testID,
      label,
      onPress: () => navigation.setParams({ lastTap: name }),
    });
  return {
    title: 'Header views',
    headerShown: true,
    headerTintColor: LINE_COLOR.presentation,
    headerTitleColor: '#ffffff',
    headerStyle: navBarFillOf(settings),
    headerUserInterfaceStyle: 'dark',
    ...headerOptionsOf(settings),
    headerBackImageSource: settings.isBackImageCustom
      ? BACK_ARROW_SOURCE
      : undefined,
    headerLeft:
      settings.left === VIEW_KIND
        ? tapView('header-views-left-view', 'Left', 'left')
        : undefined,
    headerRight:
      settings.right === VIEW_KIND
        ? tapView('header-views-right-view', 'Right', 'right')
        : undefined,
    headerTitle:
      settings.title === VIEW_KIND
        ? tapView('header-views-title-view', 'Custom title', 'title')
        : undefined,
  };
};
</script>

<script setup lang="ts">
import ScreenHero from '../components/ScreenHero.vue';
import { ROUTE_NAME } from '../routes';
import BackRecipes from './header-views/BackRecipes.vue';
import LookRecipes from './header-views/LookRecipes.vue';
import ViewRecipes from './header-views/ViewRecipes.vue';
</script>

<template>
  <!-- A scroll view first and nothing wrapping it, which a large title needs to collapse -->
  <scroll-view
    testID="header-views-scroll"
    class="screen"
    contentInsetAdjustmentBehavior="automatic"
  >
    <view class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.HeaderViews"
        title="Header views"
        body="What fills the native header and how it looks. Each switch rewrites the route params and the header follows."
      />
      <ViewRecipes />
      <BackRecipes />
      <LookRecipes />
    </view>
  </scroll-view>
</template>
