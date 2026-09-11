<!--
  @symbiote-native/web-browser tour stop — opens the in-app browser (SFSafariViewController on iOS,
  a Custom Tab on Android) for a URL typed above, reports the result type it resolves with, and
  exposes the Android-only Custom Tabs service trio behind a Platform guard. Vue SFC twin of
  ../../expo-react/screens/WebBrowserScreen.tsx.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
import {
  coolDownAsync,
  dismissBrowser,
  getCustomTabsSupportingBrowsersAsync,
  openBrowserAsync,
  warmUpAsync,
} from '@symbiote-native/web-browser/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.WebBrowser];
const lineColor = LINE_COLOR[lineInfo.line];

const url = ref('https://symbiote-native.dev');
const lastResult = ref('idle');
const servicePackage = ref<string | null>(null);
const supportingBrowsers = ref<string | null>(null);

function handleOpen(): void {
  lastResult.value = 'opening…';
  void openBrowserAsync(url.value)
    .then(result => {
      lastResult.value = `result: ${result.type}`;
    })
    .catch((error: Error) => {
      lastResult.value = `open failed: ${error.message}`;
    });
}

// iOS only — a Custom Tab cannot be closed programmatically, so this rejects on Android. It also
// rejects on iOS with no browser presented, which is the state this screen is in whenever the
// button is reachable; the rejection is the demo.
function handleDismiss(): void {
  void dismissBrowser()
    .then(result => {
      lastResult.value = `dismissed: ${result.type}`;
    })
    .catch((error: Error) => {
      lastResult.value = `dismiss failed: ${error.message}`;
    });
}

// getCustomTabsSupportingBrowsersAsync throws on iOS rather than resolving empty (its native stub
// is registered without the Async suffix), so every call below stays behind the Android branch.
function handleListBrowsers(): void {
  supportingBrowsers.value = 'listing…';
  void getCustomTabsSupportingBrowsersAsync()
    .then(result => {
      supportingBrowsers.value =
        result.browserPackages.length === 0
          ? '(no supporting browser installed)'
          : result.browserPackages.join(', ');
    })
    .catch((error: Error) => {
      supportingBrowsers.value = `failed: ${error.message}`;
    });
}

function handleWarmUp(): void {
  void warmUpAsync()
    .then(result => {
      servicePackage.value = result.servicePackage ?? '(none)';
      lastResult.value = 'warmed up';
    })
    .catch((error: Error) => {
      lastResult.value = `warm-up failed: ${error.message}`;
    });
}

function handleCoolDown(): void {
  void coolDownAsync()
    .then(() => {
      servicePackage.value = null;
      lastResult.value = 'cooled down';
    })
    .catch((error: Error) => {
      lastResult.value = `cool-down failed: ${error.message}`;
    });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="web-browser-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Web Browser</text>
          <text class="hero-body"
            >@symbiote-native/web-browser — an in-app browser that keeps the
            user inside the app, unlike Linking.openURL, plus the OAuth auth
            session built on it.</text
          >
        </view>
      </view>

      <view testID="web-browser-open-card" class="web-browser-card">
        <text class="web-browser-card-title">Open a page</text>
        <text-input
          testID="web-browser-url-input"
          v-model="url"
          placeholder="https://example.com"
          placeholder-text-color="#41506a"
          class="text-input"
          auto-capitalize="none"
          :auto-correct="false"
        />
        <ActionButton
          testID="web-browser-open-button"
          title="Open"
          :onPress="handleOpen"
          :color="lineColor"
        />
        <ActionButton
          testID="web-browser-dismiss-button"
          title="Dismiss"
          :onPress="handleDismiss"
          :color="lineColor"
        />
        <view class="web-browser-row">
          <text class="web-browser-row-label">Last result</text>
          <text testID="web-browser-result" class="web-browser-value-text">{{
            lastResult
          }}</text>
        </view>
        <text class="web-browser-note"
          >iOS resolves once the browser closes (cancel, or dismiss when closed
          from code); Android resolves opened as soon as the Custom Tab launches
          and never reports the close. Dismiss is iOS-only.</text
        >
      </view>

      <view
        v-if="Platform.OS === 'android'"
        testID="web-browser-custom-tabs-card"
        class="web-browser-card"
      >
        <text class="web-browser-card-title">Custom Tabs service</text>
        <ActionButton
          testID="web-browser-list-browsers-button"
          title="List supporting browsers"
          :onPress="handleListBrowsers"
          :color="lineColor"
        />
        <view class="web-browser-row">
          <text class="web-browser-row-label">Browsers</text>
          <text testID="web-browser-browsers" class="web-browser-value-text">{{
            supportingBrowsers ?? '(not queried)'
          }}</text>
        </view>
        <ActionButton
          testID="web-browser-warm-up-button"
          title="Warm up"
          :onPress="handleWarmUp"
          :color="lineColor"
        />
        <ActionButton
          testID="web-browser-cool-down-button"
          title="Cool down"
          :onPress="handleCoolDown"
          :color="lineColor"
        />
        <view class="web-browser-row">
          <text class="web-browser-row-label">Service package</text>
          <text
            testID="web-browser-service-package"
            class="web-browser-value-text"
            >{{ servicePackage ?? '(not warmed up)' }}</text
          >
        </view>
        <text class="web-browser-note"
          >Android only. Listing the browsers throws on iOS, so this whole card
          is behind a Platform.OS check.</text
        >
      </view>
    </scroll-view>
  </safe-area-view>
</template>
