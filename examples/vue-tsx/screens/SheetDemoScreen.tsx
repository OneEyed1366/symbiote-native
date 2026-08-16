import { defineComponent } from 'vue';
import { ScrollView, Text, View } from '@symbiote-native/vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import type { IScreenOptions } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

// Plain options object is enough here (unlike HeaderOptionsScreen's resolver) since none of
// these fields need the live navigation handle.
export const sheetDemoScreenOptions: IScreenOptions = {
  title: 'Sheet Demo',
  headerShown: true,
  // NOT translucent, unlike every other screen's headerStyle: formSheet has its own separate
  // header-height accounting in react-native-screens (RNSScreenContentWrapper's
  // headerHeightErrata walk). An opaque headerStyle still gets a dark, on-theme bar without
  // touching that formSheet sizing path.
  //
  // Real cause of an earlier blank-sheet bug: stack.ts's RNSScreenContentWrapper style hardcoded
  // `{ flex: 1 }` for every presentation, but react-native-screens' own ScreenStackItem.tsx never
  // does that for formSheet (see resolveScreenContentWrapperStyle in core/render-stack.ts) —
  // forcing a strict frame on every native shadow-state update during a detent drag, the flicker
  // PR #1870 fixed by switching formSheet to `absoluteWithNoBottom` (sized bottom-up from
  // content). The screen below wraps its content in a ScrollView because of that: react-native-
  // screens' native fix for "content should still fill a taller detent" only resizes a
  // ScrollView child directly (RNSScreenContentWrapper.mm's
  // coerceChildScrollViewComponentSizeToSize), bypassing Yoga/flex — a plain View would stay
  // sized to its own content and leave a gap on the 60%/100% detents. The ScrollView must be the
  // FIRST direct child of RNSScreenContentWrapper for that native search to find it
  // (childRCTScrollViewComponentAndContentContainer walks self.subviews, or — iOS 26+ only — one
  // level into react-native-screens' own RNSSafeAreaViewComponentView) — an app-level
  // SafeAreaView in between hides the ScrollView from that search, so this screen skips
  // SafeAreaView on purpose, unlike every other demo screen.
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  stackPresentation: 'formSheet',
  sheetAllowedDetents: [0.3, 0.6, 1],
  sheetGrabberVisible: true,
  sheetCornerRadius: 20,
  sheetInitialDetentIndex: 0,
};

/**
 * Sheet presentation demo: pushed with stackPresentation: 'formSheet' and three
 * sheetAllowedDetents (30% / 60% / full height) — drag the grabber between them. "Dismiss" below
 * pops this route the same way a real app would toggle the sheet from a button.
 */
export const SheetDemoScreen = defineComponent(
  () => {
    const navigation = useStackNavigation();
    return () => {
      const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SheetDemo];
      return (
        <ScrollView class="screen" contentContainerStyle="section">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.presentation }}>
              <Text class="hero-badge-text">SH</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Sheet presentation</Text>
              <Text class="hero-body">
                Pushed with stackPresentation: formSheet and three detents — drag the grabber between
                30%, 60%, and full height.
              </Text>
            </View>
          </View>
          <Text class="info-text">
            stackPresentation: formSheet · detents 30% / 60% / 100% · drag the grabber
          </Text>
          <ActionButton
            testID="sheet-dismiss"
            title="Dismiss"
            onPress={() => navigation.value.pop()}
            color={LINE_COLOR.presentation}
          />
        </ScrollView>
      );
    };
  },
  { name: 'SheetDemoScreen' },
);
