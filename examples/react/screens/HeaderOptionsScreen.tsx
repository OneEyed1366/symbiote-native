import type { IScreenOptionsResolver } from '@symbiote-native/navigation/react';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import {
  headerChromeOptionsOf,
  readHeaderOptionsSettings,
  searchBarOptionsOf,
} from './header-options/header-options-settings';
import { HeaderRecipes } from './header-options/HeaderRecipes';
import { searchBarRef } from './header-options/search-bar-ref';
import {
  SearchEventRecipes,
  SearchLayoutRecipes,
} from './header-options/SearchRecipes';

// Registered on the root Stack.Screen as a resolver: the panel switches live in the route params,
// and the bar button, menu and search callbacks write what they heard back into the same params
export const headerOptionsScreenOptions: IScreenOptionsResolver = ({
  route,
  navigation,
}) => {
  const settings = readHeaderOptionsSettings(route.params);
  return {
    title: 'Header Options',
    headerShown: true,
    headerTintColor: LINE_COLOR.presentation,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    // The large title has its own appearance, left unset it is system white
    headerLargeStyle: { backgroundColor: '#0b1622' },
    // The search field takes its chrome from this trait, not from the colours above
    headerUserInterfaceStyle: 'dark',
    ...headerChromeOptionsOf(settings, lastHeaderAction =>
      navigation.setParams({ lastHeaderAction }),
    ),
    headerSearchBarOptions: {
      ...searchBarOptionsOf(settings),
      ref: searchBarRef,
      onChangeText: lastSearchText => navigation.setParams({ lastSearchText }),
      onSearchButtonPress: lastSearchSubmitted =>
        navigation.setParams({ lastSearchSubmitted }),
      onFocus: () => navigation.setParams({ lastSearchBarEvent: 'focused' }),
      onBlur: () => navigation.setParams({ lastSearchBarEvent: 'blurred' }),
      onCancelButtonPress: () =>
        navigation.setParams({ lastSearchBarEvent: 'cancel pressed' }),
      onClose: () =>
        navigation.setParams({ lastSearchBarEvent: 'closed (Android)' }),
      onOpen: () =>
        navigation.setParams({ lastSearchBarEvent: 'opened (Android)' }),
    },
  };
};

// The scroll view is the first child of the screen, so the large title can collapse with it
export function HeaderOptionsScreen() {
  return (
    <scroll-view
      testID="header-options-scroll"
      className="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view className="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.HeaderOptions}
          title="Header options"
          body="The native header: large title, bar buttons and menus, and the search bar with every knob and event."
        />
        <HeaderRecipes />
        <SearchLayoutRecipes />
        <SearchEventRecipes />
      </view>
    </scroll-view>
  );
}
