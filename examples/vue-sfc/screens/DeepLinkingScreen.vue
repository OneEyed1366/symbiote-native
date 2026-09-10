<!--
  Deep-linking demo: APP_LINKING_CONFIG (navigation-linking.ts) is the SAME config wired at the
  root via useLinkingIntegration (App.vue) for real OS deep links — here resolveRouteFromUrl is
  called directly against a typed-in URL so the resolution itself is provable inside the running
  app without needing an actual OS-level deep link. Vue SFC twin of
  .examples/react/screens/DeepLinkingScreen.tsx.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { resolveRouteFromUrl } from '@symbiote-native/navigation';
import ActionButton from '../components/ActionButton.vue';
import {
  APP_LINKING_CONFIG,
  SAMPLE_DEEP_LINK_URL,
} from '../navigation-linking';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const url = ref(SAMPLE_DEEP_LINK_URL);
const resolved = ref<string | undefined>(undefined);

function onResolve(): void {
  const route = resolveRouteFromUrl(APP_LINKING_CONFIG, url.value);
  resolved.value = JSON.stringify(route, null, 2);
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DeepLinking];
</script>

<template>
  <safe-area-view class="screen">
    <view class="section">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view
          class="hero-badge"
          :style="{ backgroundColor: LINE_COLOR.routing }"
        >
          <text class="hero-badge-text">DL</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Deep linking</text>
          <text class="hero-body"
            >A typed URL resolved to a route through resolveRouteFromUrl, the
            same path a real deep link or push notification would take.</text
          >
        </view>
      </view>
      <text class="info-text"
        >prefixes: symbiotecanaryvuesfc:// ·
        https://canary.symbiote-native.dev</text
      >
      <text class="note-text"
        >Details → details/:id · HeaderOptions → header-options · TabsDemo →
        tabs</text
      >
      <text-input
        testID="deep-link-input"
        v-model="url"
        placeholder="symbiotecanaryvuesfc://details/42"
        placeholder-text-color="#41506a"
        class="text-input"
      />
      <ActionButton
        testID="deep-link-resolve"
        title="Resolve"
        :onPress="onResolve"
        :color="LINE_COLOR.routing"
      />
      <view class="parity-list">
        <text testID="deep-link-result" class="list-row-text">{{
          resolved ?? 'tap Resolve to see the parsed route'
        }}</text>
      </view>
    </view>
  </safe-area-view>
</template>
