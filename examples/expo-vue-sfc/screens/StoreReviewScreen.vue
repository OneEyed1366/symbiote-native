<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { hasAction, isAvailableAsync, requestReview } from '@symbiote-native/store-review/vue';
import ActionButton from '../components/ActionButton.vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

const PENDING_LABEL = 'checking…';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StoreReview];
const lineColor = LINE_COLOR[lineInfo.line];

const isAvailable = ref<boolean | null>(null);
const canRequestReview = ref<boolean | null>(null);
const lastResult = ref('idle');

function yesNoLabel(value: boolean | null): string {
  if (value === null) return PENDING_LABEL;
  return value ? 'Yes' : 'No';
}

onMounted(() => {
  void Promise.all([isAvailableAsync(), hasAction()]).then(([available, action]) => {
    isAvailable.value = available;
    canRequestReview.value = action;
  });
});

function handleRequestReview(): void {
  lastResult.value = 'requesting…';
  void requestReview()
    .then(() => {
      lastResult.value = 'resolved';
    })
    .catch((error: Error) => {
      lastResult.value = `rejected: ${error.message}`;
    });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="store-review-scroll"
      class="screen"
      contentContainerStyle="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Store Review</text>
          <text class="hero-body">
            Ask happy users for a store rating without leaving the app, with the native App Store
            and Google Play review sheet.
          </text>
        </view>
      </view>

      <Scenario
        testID="store-review-scenario"
        title="Ask for a rating right after a good moment"
        why="Reviews convert best after a success, such as a finished order or a completed level. The stores limit how often the sheet appears, so ask once at the right time."
        :steps="[
          'Check that the native flow is available',
          'Press Request Review',
          'Read the last result',
        ]"
        expect="The review sheet may appear, but the stores never say whether it did. The result only says the call finished, and Android shows it only for Play-installed builds."
      />

      <view testID="store-review-capability-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Capability</text>
        </view>
        <ValueRow label="Native flow available" :value="yesNoLabel(isAvailable)" />
        <ValueRow label="Can request review" :value="yesNoLabel(canRequestReview)" />
      </view>

      <view testID="store-review-action-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Request review</text>
        </view>
        <ActionButton
          testID="store-review-request-button"
          title="Request Review"
          :onPress="handleRequestReview"
          :color="lineColor"
        />
        <view class="capability-row">
          <text class="capability-label">Last result</text>
          <text testID="store-review-result" class="value-text">{{ lastResult }}</text>
        </view>
        <text class="info-text">
          resolved means the call completed, not that a prompt appeared. On Android the Play
          dialog only shows for a build installed from Google Play (internal test track, internal
          app sharing, or production); a sideloaded debug build resolves silently. iOS shows it in
          debug builds. Both stores also enforce a quota.
        </text>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
