import { defineComponent } from 'vue';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import type { ITourRouteName } from '../navigation-lines';
import { ROUTE_LINE_INFO } from '../navigation-lines';

type IMenuItem = {
  label: string;
  route: ITourRouteName;
  hint: string;
};

const MENU_ITEMS: readonly IMenuItem[] = [
  { label: 'Sensors', route: ROUTE_NAME.Sensors, hint: '@symbiote-native/sensors — accelerometer, gyroscope, magnetometer, device motion, pedometer' },
  { label: 'Local auth', route: ROUTE_NAME.LocalAuth, hint: '@symbiote-native/local-auth — FaceID/TouchID/fingerprint' },
];

/**
 * Root menu for the Expo-modules-core demo surface: one row per Expo-SDK-ported
 * @symbiote-native package, each pushing its own dedicated demo screen onto the same root Stack.
 * Rows are grouped into thematic "lines" (navigation-lines.ts's ROUTE_LINE_INFO) — a color +
 * 2-letter badge per line, carried through onto each demo screen's own line tag.
 */
export const MenuScreen = defineComponent(
  () => {
    const navigation = useStackNavigation();
    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="menu-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class="menu-hero">
            <Text class="menu-eyebrow">EXPO MODULES DEMOS</Text>
            <Text class="menu-hero-title">Expo-SDK ports on a real native stack</Text>
            <Text class="menu-hero-subtitle">
              Each row below demos a different @symbiote-native package built on expo-modules-core.
            </Text>
          </View>
          {MENU_ITEMS.map(item => {
            const lineInfo = ROUTE_LINE_INFO[item.route];
            return (
              <Pressable
                key={item.route}
                testID={`menu-row-${item.route}`}
                class={`menu-row menu-row-${lineInfo.line}`}
                onPress={() => navigation.value.push(item.route)}
              >
                <View class={`menu-badge menu-badge-${lineInfo.line}`}>
                  <Text class="menu-badge-text">{lineInfo.code}</Text>
                </View>
                <View class="menu-row-copy">
                  <Text class="menu-row-label">{item.label}</Text>
                  <Text class={`menu-row-hint menu-row-hint-${lineInfo.line}`}>{item.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'MenuScreen' },
);
