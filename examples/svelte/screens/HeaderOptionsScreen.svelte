<script lang="ts" module>
  import type { IScreenOptionsResolver } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';
  import {
    headerChromeOptionsOf,
    readHeaderOptionsSettings,
    searchBarOptionsOf,
  } from './header-options/header-options-settings';
  import { searchBarRef } from './header-options/search-bar-ref';

  // The panel switches live in the route params, the bar button, menu and search callbacks
  // write what they heard back into the same params
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
        onChangeText: lastSearchText =>
          navigation.setParams({ lastSearchText }),
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
</script>

<script lang="ts">
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import HeaderRecipes from './header-options/HeaderRecipes.svelte';
  import SearchRecipes from './header-options/SearchRecipes.svelte';
</script>

<!-- The scroll view is the first child of the screen, so the large title can collapse with it -->
<scroll-view
  testID="header-options-scroll"
  class="screen"
  contentInsetAdjustmentBehavior="automatic"
>
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.HeaderOptions}
      title="Header options"
      body="The native header: large title, bar buttons and menus, and the search bar with every knob and event."
    />
    <HeaderRecipes />
    <SearchRecipes />
  </view>
</scroll-view>
