// headerSearchBarOptions.ref (SearchBarCommands: focus/blur/clearText/setText/cancelSearch/
// toggleCancelButton) lives on the OPTIONS object, which the Stack resolves while building this
// route's screen props — one step ahead of mounting the screen component, and in a scope that has
// no owner at all. A module-scope cell is what lets both halves share ONE object: the resolver
// hands the navigator a callback that fills it, HeaderOptionsScreen.tsx's buttons read `.current`
// back to drive the search bar imperatively. Fine for a single demo screen instance; a
// multi-instance screen would need the cell threaded through some other shared owner instead.
//
// THE SOLID DIVERGENCE: ISolidSearchBarOptions.ref is a CALLBACK, not a container.
// React passes a `RefObject`, Vue a `Ref`, Svelte a plain `{ current }` cell — Solid's own spelling
// of "hand me the thing once it exists" is `ref={fn}`, so the cell is filled by the callback below
// rather than handed over directly. Copying the Svelte shape verbatim (`ref: searchBarRef`) is a
// type error, which is the one trap in this file that does NOT fail silently.
//
// A plain cell, not a signal: nothing renders off it, the buttons only read it at press time. A
// signal would buy reactivity no one consumes.

import type { ISearchBarCommands } from '@symbiote-native/navigation';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/solid';
import { LINE_COLOR } from '../navigation-lines';

export const searchBarRef: { current: ISearchBarCommands | null } = {
  current: null,
};

// App.css's ground / card colors, matching App.tsx's own HEADER_BACKGROUND.
const HEADER_BACKGROUND = '#0b1020';
const SEARCH_FIELD_BACKGROUND = '#151c33';

// Registered on the root Stack's <Stack.Screen options={headerOptionsScreenOptions}> (App.tsx) — a
// RESOLVER function, not a plain object, so its bar-button/menu onPress handlers close over the
// LIVE navigation handle and round-trip the pressed action back onto the route via setParams(),
// which HeaderOptionsScreen.tsx reads through useRoute() to display.
//
// This stays live under Solid for a reason that is the navigator's, not this file's: the Stack
// re-invokes the resolver from the memo that builds each route's render plan, and that memo depends
// on the route object — so a setParams() mints a new route under the same key and the resolver runs
// again with it. Precomputing the returned object here (calling the resolver once and exporting the
// result) would hand the header a frozen bag while still typechecking.
export const headerOptionsScreenOptions: IScreenOptionsResolver = ({
  navigation,
}) => ({
  title: 'Header Options',
  headerShown: true,
  headerTranslucent: true,
  headerLargeTitle: true,
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: HEADER_BACKGROUND },
  // headerStyle.backgroundColor only colors the collapsed/compact header — react-native-screens
  // tracks the large-title (scroll-edge) appearance separately, defaulting to system white if left
  // unset. Same color as headerStyle so the header reads as one continuous dark bar whether the
  // large title is expanded or collapsed.
  headerLargeStyle: { backgroundColor: HEADER_BACKGROUND },
  // System chrome bundled into the header (the search field's own blur/backdrop, chiefly) follows
  // this OS-level trait rather than any individual color prop above — left 'unspecified' it renders
  // as a stray light band regardless of headerStyle/headerLargeStyle.
  headerUserInterfaceStyle: 'dark',
  headerLeftBarButtonItems: [
    {
      type: 'button',
      title: 'Info',
      onPress: () =>
        navigation.setParams({ lastHeaderAction: 'left bar button: Info' }),
    },
  ],
  headerRightBarButtonItems: [
    {
      type: 'menu',
      title: 'More',
      menu: {
        title: 'Actions',
        items: [
          {
            type: 'action',
            title: 'Share',
            onPress: () =>
              navigation.setParams({ lastHeaderAction: 'menu: Share' }),
          },
          {
            type: 'action',
            title: 'Delete',
            destructive: true,
            onPress: () =>
              navigation.setParams({ lastHeaderAction: 'menu: Delete' }),
          },
        ],
      },
    },
  ],
  headerSearchBarOptions: {
    placeholder: 'Search demo…',
    autoCapitalize: 'none',
    placement: 'automatic',
    ref: commands => {
      searchBarRef.current = commands;
    },
    // Left unset, the search field defaults to a light/system background — a stark white band
    // against this screen's dark theme (its container tint follows headerStyle fine, only the FIELD
    // itself doesn't). barTintColor is the field's own bg (iOS); textColor/tintColor are the typed
    // text + cursor/Cancel-button tint; hintTextColor/headerIconColor are the Android-only twins,
    // harmless to set here too.
    barTintColor: SEARCH_FIELD_BACKGROUND,
    textColor: '#ffffff',
    tintColor: LINE_COLOR.presentation,
    hintTextColor: '#7f8db3',
    headerIconColor: LINE_COLOR.presentation,
    onChangeText: text => navigation.setParams({ lastSearchText: text }),
    onSearchButtonPress: text =>
      navigation.setParams({ lastSearchSubmitted: text }),
    onFocus: () => navigation.setParams({ lastSearchBarEvent: 'focused' }),
    onBlur: () => navigation.setParams({ lastSearchBarEvent: 'blurred' }),
    onCancelButtonPress: () =>
      navigation.setParams({ lastSearchBarEvent: 'cancel pressed' }),
    onClose: () =>
      navigation.setParams({ lastSearchBarEvent: 'closed (Android)' }),
    onOpen: () =>
      navigation.setParams({ lastSearchBarEvent: 'opened (Android)' }),
  },
});
