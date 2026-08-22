<!--
  @symbiote-native/system-ui tour stop — fetches the root view's background color on mount, then
  three buttons (Red/Blue/Reset) each set it and re-fetch, mirroring DeviceScreen's
  fetch-then-render actions shape. Vue SFC twin of ../../react/screens/SystemUiScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  getBackgroundColorAsync,
  setBackgroundColorAsync,
} from '@symbiote-native/system-ui/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const RED = '#ef4444';
const BLUE = '#3b82f6';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SystemUi];
const lineColor = LINE_COLOR[lineInfo.line];

const backgroundColor = ref<string | null>(null);

async function refreshBackgroundColor(): Promise<void> {
  const value = await getBackgroundColorAsync();
  backgroundColor.value = value === null ? null : String(value);
}

function handleSetRed(): void {
  void setBackgroundColorAsync(RED).then(refreshBackgroundColor);
}

function handleSetBlue(): void {
  void setBackgroundColorAsync(BLUE).then(refreshBackgroundColor);
}

function handleReset(): void {
  void setBackgroundColorAsync(null).then(refreshBackgroundColor);
}

onMounted(() => {
  void refreshBackgroundColor();
});
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="system-ui-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">System UI</Text>
          <Text class="hero-body"
            >@symbiote-native/system-ui — sets and reads the root view's
            background color.</Text
          >
        </View>
      </View>

      <View testID="system-ui-card" class="system-ui-card">
        <Text class="system-ui-card-title">Background color</Text>
        <View class="system-ui-row">
          <Text class="system-ui-row-label">Current</Text>
          <Text
            testID="system-ui-background-color-value"
            class="system-ui-value-text"
            >{{ backgroundColor ?? 'not set' }}</Text
          >
        </View>
        <View class="button-row">
          <ActionButton
            testID="system-ui-set-red-button"
            title="Red"
            :onPress="handleSetRed"
            :color="RED"
          />
          <ActionButton
            testID="system-ui-set-blue-button"
            title="Blue"
            :onPress="handleSetBlue"
            :color="BLUE"
          />
          <ActionButton
            testID="system-ui-reset-button"
            title="Reset"
            :onPress="handleReset"
            :color="lineColor"
          />
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
