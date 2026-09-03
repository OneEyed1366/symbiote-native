// Sheet presentation demo: this screen is PUSHED with stackPresentation: 'formSheet' and three
// sheetAllowedDetents (30% / 60% / full height) — drag the grabber between them. "Present" is the
// Menu screen's push onto this route; "Dismiss" below is this route's own pop, both driving the
// native sheet the same way a real app would toggle it from a button. Solid twin of
// examples/svelte/screens/SheetDemoScreen.svelte.

import { ScrollView, Text, View } from '@symbiote-native/solid';
import { useStackNavigation } from '@symbiote-native/navigation/solid';
import type { ISolidScreenOptions } from '@symbiote-native/navigation/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// App.css's ground color, matching App.tsx's own HEADER_BACKGROUND — repeated rather than imported
// because App.tsx imports this module, and a shared const would close the cycle.
const HEADER_BACKGROUND = '#0b1020';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SheetDemo];

// Registered on the root Stack's <Stack.Screen options={sheetDemoScreenOptions}> (App.tsx) — a
// plain object is enough here, unlike headerOptionsScreenOptions's resolver, since none of these
// fields need the live navigation handle. It carries no state, so a Solid body running once is not
// a hazard: the navigator re-reads it through the marker's own props getter on every recompute.
export const sheetDemoScreenOptions: ISolidScreenOptions = {
  title: 'Sheet Demo',
  headerShown: true,
  // NOT translucent, unlike every other screen's header: formSheet has its own header-height
  // accounting in react-native-screens (RNSScreenContentWrapper's headerHeightErrata walk). An
  // opaque headerStyle still gets a dark, on-theme bar without touching that sizing path.
  //
  // The content below is a ScrollView, not a View, and stays the FIRST direct child of
  // RNSScreenContentWrapper with no SafeAreaView in between: react-native-screens only resizes a
  // ScrollView child it finds by walking self.subviews to fill a taller detent
  // (coerceChildScrollViewComponentSizeToSize), bypassing Yoga entirely — a plain View stays sized
  // to its own content and leaves a gap on the 60%/100% detents, and an app-level SafeAreaView in
  // between hides the ScrollView from that search. Hence no SafeAreaView on this screen.
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: HEADER_BACKGROUND },
  headerUserInterfaceStyle: 'dark',
  stackPresentation: 'formSheet',
  sheetAllowedDetents: [0.3, 0.6, 1],
  sheetGrabberVisible: true,
  sheetCornerRadius: 20,
  sheetInitialDetentIndex: 0,
};

export function SheetDemoScreen() {
  // This screen is only ever mounted under a Stack, so useStackNavigation() hands back the
  // Stack-specific handle (pop) directly — no union narrowing. An accessor: called at the press,
  // never snapshotted into a const.
  const navigation = useStackNavigation();

  return (
    <ScrollView class="screen" contentContainerStyle="demo-section">
      <View class={`line-tag line-tag-${lineInfo.line}`}>
        <Text class="line-tag-text">
          {`${lineInfo.code} · ${lineInfo.label}`}
        </Text>
      </View>
      <View class="hero-card">
        <View
          class="hero-badge"
          style={{ backgroundColor: LINE_COLOR.presentation }}
        >
          <Text class="hero-badge-text">SH</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Sheet presentation</Text>
          <Text class="hero-body">
            Pushed with stackPresentation: formSheet and three detents — drag
            the grabber between 30%, 60%, and full height.
          </Text>
        </View>
      </View>
      <Text class="info-text">
        stackPresentation: formSheet · detents 30% / 60% / 100% · drag the
        grabber
      </Text>
      <ActionButton
        testID="sheet-dismiss"
        title="Dismiss"
        onPress={() => navigation().pop()}
        color={LINE_COLOR.presentation}
      />
    </ScrollView>
  );
}
