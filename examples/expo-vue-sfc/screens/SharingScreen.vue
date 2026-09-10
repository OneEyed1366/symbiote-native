<!--
  @symbiote-native/sharing tour stop — an isAvailableAsync capability row plus a share card driving
  shareAsync against a file URI the user types in. Vue SFC twin of
  ../../expo-react/screens/SharingScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import { isAvailableAsync, shareAsync } from '@symbiote-native/sharing/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function toBadgeText(status: ICapabilityStatus): string {
  return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sharing];
const lineColor = LINE_COLOR[lineInfo.line];

const isAvailable = ref<ICapabilityStatus>('checking');
const fileUri = ref('');
const lastResult = ref('idle');

onMounted(() => {
  void isAvailableAsync().then(available => {
    isAvailable.value = toCapabilityStatus(available);
  });
});

// The share sheet only accepts a real, readable local file — this canary ships no file-system
// package to produce one, so the path comes from the input above and a bad one surfaces as the
// native error message rather than a silent no-op.
function handleShare(): void {
  lastResult.value = 'sharing…';
  void shareAsync(fileUri.value, { dialogTitle: 'Share the demo file' })
    .then(() => {
      lastResult.value = 'sheet dismissed';
    })
    .catch((error: Error) => {
      lastResult.value = `share failed: ${error.message}`;
    });
}
</script>

<template>
  <safe-area-view class="screen">
    <ScrollView
      testID="sharing-scroll"
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
          <text class="hero-title">Sharing</text>
          <text class="hero-body"
            >@symbiote-native/sharing — opens the platform share sheet for a
            local file. Outgoing only: it hands a file to another app, it does
            not receive one.</text
          >
        </view>
      </view>

      <view testID="sharing-capability-card" class="sharing-card">
        <text class="sharing-card-title">Capabilities</text>
        <view testID="sharing-available" class="sharing-row">
          <text class="sharing-row-label">Available</text>
          <view
            :class="`sharing-status-badge sharing-status-badge-${isAvailable}`"
          >
            <text class="sharing-status-text">{{
              toBadgeText(isAvailable)
            }}</text>
          </view>
        </view>
        <text class="sharing-note"
          >Reports on the native module, not on any device capability — it is
          true on every iOS and Android build.</text
        >
      </view>

      <view testID="sharing-share-card" class="sharing-card">
        <text class="sharing-card-title">Share a file</text>
        <text class="sharing-note"
          >A real local file URI is required — something like
          file:///…/document.pdf that already exists and is readable. This app
          has no file-system package to create one, so type a path you know is
          there. Anything else comes back below as the native error.</text
        >
        <text-input
          testID="sharing-uri-input"
          v-model="fileUri"
          placeholder="file:///path/to/file.pdf"
          placeholder-text-color="#41506a"
          class="text-input"
          auto-capitalize="none"
          :auto-correct="false"
        />
        <ActionButton
          testID="sharing-share-button"
          title="Share"
          :onPress="handleShare"
          :color="lineColor"
        />
        <view class="sharing-row">
          <text class="sharing-row-label">Last result</text>
          <text testID="sharing-result" class="sharing-value-text">{{
            lastResult
          }}</text>
        </view>
      </view>
    </ScrollView>
  </safe-area-view>
</template>
