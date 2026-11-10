import { defineComponent } from 'vue';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/vue';
import { HeaderTapView } from '../components/HeaderTapView';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { BACK_ARROW_SOURCE } from './header-views/back-arrow';
import { BackRecipes } from './header-views/BackRecipes';
import {
  headerOptionsOf,
  navBarFillOf,
  readHeaderViewsSettings,
  VIEW_KIND,
} from './header-views/header-views-settings';
import { LookRecipes } from './header-views/LookRecipes';
import { ViewRecipes } from './header-views/ViewRecipes';

// The route params hold the panel state, so every switch re-runs this resolver
export const headerViewsScreenOptions: IScreenOptionsResolver = ({
  route,
  navigation,
}) => {
  const settings = readHeaderViewsSettings(route.params);
  const tapped = (name: string) => () => navigation.setParams({ lastTap: name });
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
        ? () => (
            <HeaderTapView
              testID="header-views-left-view"
              label="Left"
              onPress={tapped('left')}
            />
          )
        : undefined,
    headerRight:
      settings.right === VIEW_KIND
        ? () => (
            <HeaderTapView
              testID="header-views-right-view"
              label="Right"
              onPress={tapped('right')}
            />
          )
        : undefined,
    headerTitle:
      settings.title === VIEW_KIND
        ? () => (
            <HeaderTapView
              testID="header-views-title-view"
              label="Custom title"
              onPress={tapped('title')}
            />
          )
        : undefined,
  };
};

// A scroll view first and nothing wrapping it, which a large title needs to collapse
export const HeaderViewsScreen = defineComponent(
  () => () => (
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
  ),
  { name: 'HeaderViewsScreen' },
);
