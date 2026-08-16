// headerSearchBarOptions.ref (SearchBarCommands: focus/blur/clearText/setText/cancelSearch/
// toggleCancelButton) lives on the OPTIONS object, resolved by the Stack itself BEFORE
// HeaderOptionsScreen.svelte's own script runs — a different scope than the screen component
// below. A module-scope cell is what lets both share the SAME stable object: the resolver hands
// it to the navigator via ISvelteSearchBarOptions.ref, the screen's buttons read it back to drive
// the search bar imperatively. Fine for a single demo screen instance; a multi-instance screen
// would need the cell threaded through some other shared owner instead.
//
// A plain `{ current }` object, not a `$state` rune: nothing renders off it, the buttons only
// read `.current` at press time, so a `.svelte.ts` file with `$state` would buy reactivity nobody
// consumes. Svelte twin of examples/vue-sfc/screens/header-options-screen-options.ts's
// module-scope `ref`.

import type { ISearchBarCommands } from '@symbiote-native/navigation';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/svelte';
import { LINE_COLOR } from '../navigation-lines';

export const searchBarRef: { current: ISearchBarCommands | null } = { current: null };

// Registered on the root Stack's <Screen options={headerOptionsScreenOptions}> (App.svelte) — a
// resolver function (not a plain object) so its bar-button/menu onPress handlers can close over
// the LIVE navigation handle and round-trip the pressed action back onto the route via
// setParams(), which HeaderOptionsScreen.svelte then reads via useRoute() to display.
export const headerOptionsScreenOptions: IScreenOptionsResolver = ({ navigation }) => ({
  title: 'Header Options',
  headerShown: true,
  headerTranslucent: true,
  headerLargeTitle: true,
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#1a1a1a' },
  // headerStyle.backgroundColor only colors the collapsed/compact header — react-native-screens
  // tracks the large-title (scroll-edge) appearance separately, defaulting to system white if
  // left unset. Same color as headerStyle so the header reads as one continuous dark bar
  // whether the large title is expanded or collapsed.
  headerLargeStyle: { backgroundColor: '#1a1a1a' },
  // System chrome bundled into the header (the search field's own blur/backdrop, chiefly)
  // follows this OS-level trait rather than any individual color prop above — left
  // 'unspecified' it renders as a stray light band regardless of headerStyle/headerLargeStyle.
  headerUserInterfaceStyle: 'dark',
  headerLeftBarButtonItems: [
    {
      type: 'button',
      title: 'Info',
      onPress: () => navigation.setParams({ lastHeaderAction: 'left bar button: Info' }),
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
            onPress: () => navigation.setParams({ lastHeaderAction: 'menu: Share' }),
          },
          {
            type: 'action',
            title: 'Delete',
            destructive: true,
            onPress: () => navigation.setParams({ lastHeaderAction: 'menu: Delete' }),
          },
        ],
      },
    },
  ],
  headerSearchBarOptions: {
    placeholder: 'Search demo…',
    autoCapitalize: 'none',
    placement: 'automatic',
    ref: searchBarRef,
    // Left unset, the search field defaults to a light/system background — a stark white
    // band against this screen's dark theme (its container tint follows headerStyle fine, only
    // the FIELD itself doesn't). barTintColor is the field's own bg (iOS); textColor/tintColor
    // are the typed text + cursor/Cancel-button tint; hintTextColor/headerIconColor are the
    // Android-only twins, harmless to set here too.
    barTintColor: '#262626',
    textColor: '#ffffff',
    tintColor: LINE_COLOR.presentation,
    hintTextColor: '#8a8a8a',
    headerIconColor: LINE_COLOR.presentation,
    onChangeText: text => navigation.setParams({ lastSearchText: text }),
    onSearchButtonPress: text => navigation.setParams({ lastSearchSubmitted: text }),
    onFocus: () => navigation.setParams({ lastSearchBarEvent: 'focused' }),
    onBlur: () => navigation.setParams({ lastSearchBarEvent: 'blurred' }),
    onCancelButtonPress: () => navigation.setParams({ lastSearchBarEvent: 'cancel pressed' }),
    onClose: () => navigation.setParams({ lastSearchBarEvent: 'closed (Android)' }),
    onOpen: () => navigation.setParams({ lastSearchBarEvent: 'opened (Android)' }),
  },
});
