<script setup lang="ts">
// Every class here lives in App.css's global registry, there is no local style block on purpose
import { ref, shallowRef } from 'vue';
import type { IHostInstance } from '@symbiote-native/vue';
import AccessibilityDemo from '../components/AccessibilityDemo.vue';
import AnimatedDemo from '../components/AnimatedDemo.vue';
import AnimatedParityDemo from '../components/AnimatedParityDemo.vue';
import CompoundClassDemo from '../components/CompoundClassDemo.vue';
import NativeModulesDemo from '../components/NativeModulesDemo.vue';
import ParityDemo from '../components/ParityDemo.vue';
import PlatformColorDemo from '../components/PlatformColorDemo.vue';
import RefApiDemo from '../components/RefApiDemo.vue';
import ResponderDemo from '../components/ResponderDemo.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import CanaryChips from './CanaryChips.vue';
import CanaryControls from './CanaryControls.vue';
import CanaryKeyboardAvoiding from './CanaryKeyboardAvoiding.vue';
import CanaryModal from './CanaryModal.vue';
import CanaryMvcpList from './CanaryMvcpList.vue';
import CanaryNativeButtons from './CanaryNativeButtons.vue';
import CanaryPortal from './CanaryPortal.vue';
import CanaryPressable from './CanaryPressable.vue';
import CanaryRetentionCard from './CanaryRetentionCard.vue';
import CanaryRuntimeNotes from './CanaryRuntimeNotes.vue';
import CanaryScrollHeader from './CanaryScrollHeader.vue';
import CanaryStatusBar from './CanaryStatusBar.vue';
import CanaryStyleProps from './CanaryStyleProps.vue';
import CanaryTunnel from './CanaryTunnel.vue';
import { LOGO_URI, REFRESH_MS, overlayTunnel } from './canary-shared';

const COLOR = LINE_COLOR.primitives;
const HERO_STYLE = { backgroundColor: COLOR };
const LOGO_SOURCE = { uri: LOGO_URI };
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];
const { Out: TunnelOut } = overlayTunnel;

const count = ref(0);
const isRefreshing = ref(false);
const refreshes = ref(0);
// shallowRef, not ref: the engine node must be held by identity, not wrapped in a reactive proxy
const overlayHost = shallowRef<IHostInstance | null>(null);

function onRefresh(): void {
  isRefreshing.value = true;
  setTimeout(() => {
    isRefreshing.value = false;
    refreshes.value += 1;
  }, REFRESH_MS);
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="canary-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <refresh-control
        :refreshing="isRefreshing"
        :tint-color="COLOR"
        @refresh="onRefresh"
      />
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">
          {{ `${lineInfo.code} · ${lineInfo.label}` }}
        </text>
      </view>
      <view class="hero-card">
        <view
          class="hero-badge"
          :style="HERO_STYLE"
        >
          <text class="hero-badge-text"> CN </text>
        </view>
        <view class="hero-copy">
          <text class="hero-title"> All primitives </text>
          <text class="hero-body">
            Every @symbiote-native/vue primitive, driven straight onto Fabric — no react-native
            renderer in the path.
          </text>
        </view>
      </view>
      <CanaryRuntimeNotes />
      <CanaryStatusBar />
      <CanaryNativeButtons />
      <!-- The native spinner shows only while iOS holds the pull, so ours follows the flag -->
      <view
        v-if="isRefreshing"
        class="refresh-row"
      >
        <activity-indicator :color="COLOR" />
        <text class="accent-note"> Refreshing… </text>
      </view>
      <text
        v-else
        class="muted-center"
      >
        {{ `pull to refresh · refreshed ${refreshes}×` }}
      </text>
      <view
        testID="counter-card"
        class="counter-card"
        @press="count += 1"
      >
        <text
          testID="counter-value"
          class="counter-text"
        >
          {{ `tapped ${count}×` }}
        </text>
      </view>
      <CanaryControls />
      <AnimatedDemo />
      <AnimatedParityDemo />
      <NativeModulesDemo />
      <RefApiDemo />
      <PlatformColorDemo />
      <AccessibilityDemo />
      <ResponderDemo />
      <CompoundClassDemo />
      <ParityDemo />
      <CanaryModal />
      <CanaryPressable @tap="count += 1" />
      <CanaryChips />
      <CanaryRetentionCard />
      <CanaryMvcpList />
      <CanaryScrollHeader />
      <CanaryStyleProps />
      <CanaryKeyboardAvoiding />
      <image
        :source="LOGO_SOURCE"
        class="logo-image"
      />
      <view class="bottom-card">
        <text class="bottom-text"> ↑ you scrolled to the bottom </text>
      </view>
      <CanaryPortal :host="overlayHost" />
      <CanaryTunnel />
    </scroll-view>

    <!-- The Teleport and tunnel target, a sibling of the scroll view on the same surface -->
    <view
      ref="overlayHost"
      testID="overlay-host"
      pointer-events="box-none"
      class="overlay-host"
    >
      <TunnelOut />
    </view>
  </safe-area-view>
</template>
