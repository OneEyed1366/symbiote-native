<!--
  @symbiote-native/keep-awake tour stop — useKeepAwake() has no on/off switch of its own, it
  activates on mount and deactivates on unmount, so a toggle mounting/unmounting a tiny child
  component (KeepAwakeHolder, defined below) is what actually acquires/releases the lock. Vue SFC
  twin of ../../react/screens/KeepAwakeScreen.tsx and the Vue-TSX twin
  ../../expo-vue-tsx/screens/KeepAwakeScreen.tsx (same defineComponent-holder shape, ported to SFC).
-->
<script setup lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import {} from '@symbiote-native/vue';
import {
  isAvailableAsync,
  useKeepAwake,
} from '@symbiote-native/keep-awake/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

// Holds the keep-awake lock only while mounted — useKeepAwake() activates in onMounted and
// deactivates in onUnmounted internally, so mounting/unmounting THIS component (via v-if below)
// is what actually acquires/releases the lock.
const KeepAwakeHolder = defineComponent(() => {
  useKeepAwake();
  return () => null;
});

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.KeepAwake];
const lineColor = LINE_COLOR[lineInfo.line];

const isHeld = ref<boolean>(false);
const isAvailable = ref<ICapabilityStatus>('checking');

onMounted(() => {
  void isAvailableAsync().then(value => {
    isAvailable.value = toCapabilityStatus(value);
  });
});

function handleToggle(): void {
  isHeld.value = !isHeld.value;
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="keep-awake-scroll"
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
          <text class="hero-title">Keep Awake</text>
          <text class="hero-body"
            >@symbiote-native/keep-awake — keeps the screen on for as long as a
            component holding useKeepAwake() stays mounted.</text
          >
        </view>
      </view>

      <view testID="keep-awake-card" class="keep-awake-card">
        <text class="keep-awake-card-title">Screen lock</text>
        <view class="keep-awake-row">
          <text class="keep-awake-row-label">Available</text>
          <view
            :class="`keep-awake-status-badge keep-awake-status-badge-${isAvailable}`"
          >
            <text class="keep-awake-status-text">{{
              isAvailable === 'checking'
                ? 'CHECKING…'
                : isAvailable === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</text>
          </view>
        </view>
        <view class="keep-awake-row">
          <text class="keep-awake-row-label">Held</text>
          <text testID="keep-awake-held-value" class="keep-awake-value-text">{{
            isHeld ? 'true' : 'false'
          }}</text>
        </view>
        <ActionButton
          testID="keep-awake-toggle-button"
          :title="isHeld ? 'Release keep-awake' : 'Activate keep-awake'"
          :onPress="handleToggle"
          :color="lineColor"
        />
        <KeepAwakeHolder v-if="isHeld" />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
