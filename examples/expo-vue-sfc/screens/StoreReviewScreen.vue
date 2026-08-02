<!--
  @symbiote-native/store-review tour stop — a capabilities card (isAvailableAsync/hasAction,
  checked on mount) plus a Request Review action, mirroring BatteryScreen's
  capabilities-card/status-badge shape. No store-URL options passed — this demo relies on the
  native review flow alone (see the core's IStoreReviewUrlOptions fallback for real apps). Vue
  SFC twin of ../../react/screens/StoreReviewScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { hasAction, isAvailableAsync, requestReview } from '@symbiote-native/store-review/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StoreReview];
const lineColor = LINE_COLOR[lineInfo.line];

const isAvailable = ref<ICapabilityStatus>('checking');
const hasReviewAction = ref<ICapabilityStatus>('checking');

onMounted(() => {
  void isAvailableAsync().then(value => {
    isAvailable.value = toCapabilityStatus(value);
  });
  void hasAction().then(value => {
    hasReviewAction.value = toCapabilityStatus(value);
  });
});

function handleRequestReview(): void {
  void requestReview();
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="store-review-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Store Review</Text>
          <Text class="hero-body"
            >@symbiote-native/store-review — prompts the platform's native in-app review flow.</Text
          >
        </View>
      </View>

      <View testID="store-review-capabilities-card" class="store-review-card">
        <Text class="store-review-card-title">Capabilities</Text>
        <View class="store-review-row">
          <Text class="store-review-row-label">Available</Text>
          <View :class="`store-review-status-badge store-review-status-badge-${isAvailable}`">
            <Text class="store-review-status-text">{{
              isAvailable === 'checking' ? 'CHECKING…' : isAvailable === 'yes' ? 'YES' : 'NO'
            }}</Text>
          </View>
        </View>
        <View class="store-review-row">
          <Text class="store-review-row-label">Has action</Text>
          <View :class="`store-review-status-badge store-review-status-badge-${hasReviewAction}`">
            <Text class="store-review-status-text">{{
              hasReviewAction === 'checking' ? 'CHECKING…' : hasReviewAction === 'yes' ? 'YES' : 'NO'
            }}</Text>
          </View>
        </View>
      </View>

      <View testID="store-review-actions-card" class="store-review-card">
        <Text class="store-review-card-title">Actions</Text>
        <ActionButton
          testID="store-review-request-button"
          title="Request Review"
          :onPress="handleRequestReview"
          :color="lineColor"
        />
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
