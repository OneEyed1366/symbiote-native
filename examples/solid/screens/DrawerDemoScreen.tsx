// Drawer demo: a swipeable Drawer navigator with 2 Drawer.Screens, a non-default drawerPosition
// ('right') and drawerType ('slide') so those props are proven to reach render-drawer.ts's
// geometry, plus imperative open/toggle/close buttons (DrawerHomeScreen/DrawerSettingsScreen)
// beside the swipe gesture. `drawerContent` supplies the menu panel — Drawer ships none.
//
// THE SOLID SHAPE OF drawerContent. React passes the slot as a VALUE (`renderDrawerContent({state,
// descriptors, navigation})`), Vue as a scoped slot, Svelte as a snippet parameter. Here it is an
// ACCESSOR, and the navigator calls it ONCE, untracked
// (.claude/rules/solid-descriptor-bridge.md §4). Two consequences drive everything below:
//
//   - nothing may read `slot()` at this function's top level — that read is frozen, and at the
//     moment it runs the <Drawer.Screen> markers have not registered yet, so it would snapshot an
//     empty router;
//   - every `slot()` read therefore sits in a JSX attribute or child position, where the compiler
//     wraps it in its own memo. `<For each={slot().state.routes}>` keeps the row list live, and
//     the label expression re-reads `descriptors` on its own.
//
// <For> is imported explicitly: an un-imported control-flow name resolves against the RENDERER
// module, reads back `undefined`, builds fine and throws at runtime (same rules file, §3).

import { For } from 'solid-js';
import { Drawer } from '@symbiote-native/navigation/solid';
import type { IDrawerScreenOptions } from '@symbiote-native/navigation/solid';
import { Pressable, SafeAreaView, Text } from '@symbiote-native/solid';
import { DrawerHomeScreen } from './DrawerHomeScreen';
import { DrawerSettingsScreen } from './DrawerSettingsScreen';
import './DrawerDemoScreen.css';

// The panel's own background is an RN style prop on the navigator, not a class — the drawer view
// is the navigator's, not this screen's. App.css's card colour, so it reads as a raised surface.
const DRAWER_STYLE = { backgroundColor: '#151c33' };

const drawerHomeOptions: IDrawerScreenOptions = {
  title: 'Home',
  drawerLabel: 'Home',
};

const drawerSettingsOptions: IDrawerScreenOptions = {
  title: 'Settings',
  drawerLabel: 'Settings',
};

export function DrawerDemoScreen() {
  return (
    <Drawer
      initialRouteName="Home"
      drawerPosition="right"
      drawerType="slide"
      drawerStyle={DRAWER_STYLE}
      drawerContent={slot => (
        <SafeAreaView testID="drawer-panel" class="drawer-panel">
          <Text class="section-label">Menu</Text>
          <For each={slot().state.routes}>
            {route => (
              <Pressable
                testID={`drawer-menu-${route.name}`}
                class="drawer-menu-row"
                onPress={() => slot().navigation.jumpTo(route.name)}
              >
                <Text class="drawer-menu-row-label">
                  {slot().descriptors[route.key]?.options.drawerLabel ??
                    route.name}
                </Text>
              </Pressable>
            )}
          </For>
        </SafeAreaView>
      )}
    >
      <Drawer.Screen
        name="Home"
        component={DrawerHomeScreen}
        options={drawerHomeOptions}
      />
      <Drawer.Screen
        name="Settings"
        component={DrawerSettingsScreen}
        options={drawerSettingsOptions}
      />
    </Drawer>
  );
}
