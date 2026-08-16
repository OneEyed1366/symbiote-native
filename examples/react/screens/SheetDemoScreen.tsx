import { ScrollView, Text, View } from '@symbiote-native/react';
import { useStackNavigation } from '@symbiote-native/navigation/react';
import type { IScreenOptions } from '@symbiote-native/navigation/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

// Registered on the root Stack.Screen (App.tsx) — a plain options object is enough here (unlike
// HeaderOptionsScreen's resolver) since none of these fields need the live navigation handle.
export const sheetDemoScreenOptions: IScreenOptions = {
  title: 'Sheet Demo',
  headerShown: true,
  // NOT translucent, unlike other screens: formSheet has its own header-height accounting in
  // react-native-screens (RNSScreenContentWrapper's headerHeightErrata walk). An opaque
  // headerStyle still gets a dark, on-theme bar without touching that sizing path.
  //
  // The content below is a ScrollView, not a View, and must stay the FIRST direct child of
  // RNSScreenContentWrapper with no SafeAreaView in between: react-native-screens' native fix for
  // "content should still fill a taller detent" (PR #1870, switching formSheet from a hardcoded
  // `flex: 1` to `absoluteWithNoBottom`, sized bottom-up from content — see
  // resolveScreenContentWrapperStyle in core/render-stack.ts) only resizes a ScrollView child it
  // finds by walking self.subviews (or, iOS 26+, one level into its own
  // RNSSafeAreaViewComponentView). An app-level SafeAreaView in between hides the ScrollView from
  // that search, leaving a plain-background gap on the taller detents — so this screen skips
  // SafeAreaView on purpose.
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
 * Sheet presentation demo: this screen is PUSHED with stackPresentation: 'formSheet' and three
 * sheetAllowedDetents (30% / 60% / full height) — drag the grabber between them. "Present" is the
 * Menu screen's push onto this route; "Dismiss" below is this route's own pop, both driving the
 * native sheet the same way a real app would toggle it from a button.
 */
export function SheetDemoScreen() {
  const navigation = useStackNavigation();
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SheetDemo];
  return (
    <ScrollView className="screen" contentContainerStyle="section">
      <View className={`line-tag line-tag-${lineInfo.line}`}>
        <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
      </View>
      <View className="hero-card">
        <View className="hero-badge" style={{ backgroundColor: LINE_COLOR.presentation }}>
          <Text className="hero-badge-text">SH</Text>
        </View>
        <View className="hero-copy">
          <Text className="hero-title">Sheet presentation</Text>
          <Text className="hero-body">
            Pushed with stackPresentation: formSheet and three detents — drag the grabber between
            30%, 60%, and full height.
          </Text>
        </View>
      </View>
      <Text className="info-text">
        stackPresentation: formSheet · detents 30% / 60% / 100% · drag the grabber
      </Text>
      <ActionButton
        testID="sheet-dismiss"
        title="Dismiss"
        onPress={() => navigation.pop()}
        color={LINE_COLOR.presentation}
      />
    </ScrollView>
  );
}
