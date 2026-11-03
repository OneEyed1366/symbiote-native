<script lang="ts" module>
  import type {
    INavigatorHandle,
    IScreenOptionsResolver,
  } from '@symbiote-native/navigation/svelte';
  import HeaderTapView from '../components/HeaderTapView.svelte';
  import { LINE_COLOR } from '../navigation-lines';
  import { BACK_ARROW_SOURCE } from './header-views/back-arrow';
  import {
    headerOptionsOf,
    navBarFillOf,
    readHeaderViewsSettings,
    VIEW_KIND,
  } from './header-views/header-views-settings';

  // A header snippet takes no arguments and renders outside the screen scope
  // So the handle comes from this cell, which the resolver refills on every run
  let tapTarget: INavigatorHandle | undefined;
  const tapped = (name: string) => () => tapTarget?.setParams({ lastTap: name });

  // The route params hold the panel state, so every switch re-runs this resolver
  export const headerViewsScreenOptions: IScreenOptionsResolver = ({
    route,
    navigation,
  }) => {
    const settings = readHeaderViewsSettings(route.params);
    tapTarget = navigation;
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
      headerLeft: settings.left === VIEW_KIND ? leftView : undefined,
      headerRight: settings.right === VIEW_KIND ? rightView : undefined,
      headerTitle: settings.title === VIEW_KIND ? titleView : undefined,
    };
  };
</script>

<script lang="ts">
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import BackRecipes from './header-views/BackRecipes.svelte';
  import LookRecipes from './header-views/LookRecipes.svelte';
  import ViewRecipes from './header-views/ViewRecipes.svelte';
</script>

{#snippet leftView()}
  <HeaderTapView
    testID="header-views-left-view"
    label="Left"
    onPress={tapped('left')}
  />
{/snippet}

{#snippet rightView()}
  <HeaderTapView
    testID="header-views-right-view"
    label="Right"
    onPress={tapped('right')}
  />
{/snippet}

{#snippet titleView()}
  <HeaderTapView
    testID="header-views-title-view"
    label="Custom title"
    onPress={tapped('title')}
  />
{/snippet}

<!-- A scroll view first and nothing wrapping it, which a large title needs to collapse -->
<scroll-view
  testID="header-views-scroll"
  class="screen"
  contentInsetAdjustmentBehavior="automatic"
>
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.HeaderViews}
      title="Header views"
      body="What fills the native header and how it looks. Each switch rewrites the route params and the header follows."
    />
    <ViewRecipes />
    <BackRecipes />
    <LookRecipes />
  </view>
</scroll-view>
