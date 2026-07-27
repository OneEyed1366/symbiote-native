<!--
  Root menu for the Expo-modules-core demo surface: one row per Expo-SDK-ported
  @symbiote-native package, each pushing its own dedicated demo screen onto the same root Stack.
  Rows are grouped into thematic "lines" (navigation-lines.ts's ROUTE_LINE_INFO) — a color +
  2-letter badge per line, carried through onto each demo screen's own line tag. Vue SFC twin of
  .examples/react/screens/MenuScreen.tsx.
-->
<script setup lang="ts">
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import type { ITourRouteName } from '../navigation-lines';
import { ROUTE_LINE_INFO } from '../navigation-lines';

// This screen is only ever mounted under a Stack (see App.vue's <Screen :name="ROUTE_NAME.Menu">),
// so useStackNavigation() hands back the Stack-specific handle (push/pop/…) directly — no union
// narrowing.
const navigation = useStackNavigation();

type IMenuItem = {
  label: string;
  route: ITourRouteName;
  hint: string;
};

const MENU_ITEMS: readonly IMenuItem[] = [
  { label: 'Sensors', route: ROUTE_NAME.Sensors, hint: 'Accelerometer, Gyroscope, Magnetometer, DeviceMotion, Pedometer' },
  { label: 'Local auth', route: ROUTE_NAME.LocalAuth, hint: '@symbiote-native/local-auth — FaceID/TouchID/fingerprint' },
];

function lineInfoFor(route: ITourRouteName) {
  return ROUTE_LINE_INFO[route];
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="menu-scroll" class="screen" content-container-style="scroll-content">
      <View class="menu-hero">
        <Text class="menu-eyebrow">EXPO MODULES DEMOS</Text>
        <Text class="menu-hero-title">Expo-SDK ports on a real native stack</Text>
        <Text class="menu-hero-subtitle"
          >Each row below demos a different @symbiote-native package built on
          expo-modules-core.</Text
        >
      </View>
      <Pressable
        v-for="item in MENU_ITEMS"
        :key="item.route"
        :testID="`menu-row-${item.route}`"
        :class="`menu-row menu-row-${lineInfoFor(item.route).line}`"
        @press="() => navigation.push(item.route)"
      >
        <View :class="`menu-badge menu-badge-${lineInfoFor(item.route).line}`">
          <Text class="menu-badge-text">{{ lineInfoFor(item.route).code }}</Text>
        </View>
        <View class="menu-row-copy">
          <Text class="menu-row-label">{{ item.label }}</Text>
          <Text :class="`menu-row-hint menu-row-hint-${lineInfoFor(item.route).line}`">{{
            item.hint
          }}</Text>
        </View>
      </Pressable>
    </ScrollView>
  </SafeAreaView>
</template>
