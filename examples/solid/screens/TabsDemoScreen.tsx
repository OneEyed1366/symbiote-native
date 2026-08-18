// Tabs demo: a bottom-tabs Tab navigator with 3 Tab.Screens. Home gets a custom tabBarIcon +
// tabBarActiveTintColor; Search a tabBarBadge; Profile stays plain, so the default tint/no-icon
// look sits beside the customized tabs. One component per file — the Vue/Svelte shape, and Solid's
// own idiom; React keeps its three tab bodies inline in a single file instead.
//
// `Tab.Screen` (dotted) rather than the standalone `TabScreen` the Vue/Svelte ports import: those
// two sidestep a template-only limitation on dotted tags that Solid's JSX does not have, and
// App.tsx already writes `Stack.Screen`.
//
// The options bags are module consts because that is where the TYPE annotation can sit. JSX child
// positions are not a reliable check here (.claude/rules/solid-jsx-namespace.md), so an annotated
// const is what actually proves the bag against ITabOptions.

import { Tab } from '@symbiote-native/navigation/solid';
import type { ITabOptions } from '@symbiote-native/navigation/solid';
import { LINE_COLOR } from '../navigation-lines';
import { TabHomeScreen } from './TabHomeScreen';
import { TabSearchScreen } from './TabSearchScreen';
import { TabProfileScreen } from './TabProfileScreen';

const homeTabOptions: ITabOptions = {
  tabBarLabel: 'Home',
  tabBarIcon: '🏠',
  tabBarActiveTintColor: LINE_COLOR.structure,
};

const searchTabOptions: ITabOptions = {
  tabBarLabel: 'Search',
  tabBarIcon: '🔍',
  tabBarBadge: 3,
};

const profileTabOptions: ITabOptions = {
  tabBarLabel: 'Profile',
  tabBarIcon: '👤',
};

export function TabsDemoScreen() {
  return (
    <Tab initialRouteName="Home">
      <Tab.Screen
        name="Home"
        component={TabHomeScreen}
        options={homeTabOptions}
      />
      <Tab.Screen
        name="Search"
        component={TabSearchScreen}
        options={searchTabOptions}
      />
      <Tab.Screen
        name="Profile"
        component={TabProfileScreen}
        options={profileTabOptions}
      />
    </Tab>
  );
}
