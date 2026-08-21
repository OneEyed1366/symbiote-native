// Drawer demo · Home: mounted under a Drawer, so useDrawerNavigation() narrows to the
// Drawer-specific handle (openDrawer/closeDrawer/toggleDrawer/jumpTo) with no work here.
//
// It returns an ACCESSOR and is called at each use site. `use*` is right — it only consumes the
// navigation scope already on the owner chain — but the memo behind it re-derives the handle, so a
// body-level destructure would pin this screen to whatever the chain held at mount.

import { SafeAreaView, Text, View } from '@symbiote-native/solid';
import { useDrawerNavigation } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';
import './DrawerDemoScreen.css';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];

export function DrawerHomeScreen() {
  const navigation = useDrawerNavigation();

  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">
            {`${lineInfo.code} · ${lineInfo.label}`}
          </Text>
        </View>
        <View class="hero-card">
          <View
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.structure }}
          >
            <Text class="hero-badge-text">DR</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Drawer</Text>
            <Text class="hero-body">
              A swipeable drawer sliding in from the right, driven by the
              navigator's own gesture handler.
            </Text>
          </View>
        </View>
        <Text class="info-text">
          drawerPosition: right · drawerType: slide — swipe from the RIGHT edge,
          or use a button
        </Text>
        <ActionButton
          testID="drawer-open"
          title="Open drawer"
          onPress={() => navigation().openDrawer()}
          color={LINE_COLOR.structure}
        />
        <ActionButton
          testID="drawer-toggle"
          title="Toggle drawer"
          onPress={() => navigation().toggleDrawer()}
          color={LINE_COLOR.structure}
        />
      </View>
    </SafeAreaView>
  );
}
