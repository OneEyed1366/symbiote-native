<!--
  @symbiote-native/sharing tour stop — an isAvailableAsync capability row plus a share card driving
  shareAsync against a file URI the user types in. Vue SFC twin of
  ../../expo-react/screens/SharingScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@symbiote-native/vue';
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
  <SafeAreaView class="screen">
    <ScrollView
      testID="sharing-scroll"
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
          <Text class="hero-title">Sharing</Text>
          <Text class="hero-body"
            >@symbiote-native/sharing — opens the platform share sheet for a
            local file. Outgoing only: it hands a file to another app, it does
            not receive one.</Text
          >
        </View>
      </View>

      <View testID="sharing-capability-card" class="sharing-card">
        <Text class="sharing-card-title">Capabilities</Text>
        <View testID="sharing-available" class="sharing-row">
          <Text class="sharing-row-label">Available</Text>
          <View
            :class="`sharing-status-badge sharing-status-badge-${isAvailable}`"
          >
            <Text class="sharing-status-text">{{
              toBadgeText(isAvailable)
            }}</Text>
          </View>
        </View>
        <Text class="sharing-note"
          >Reports on the native module, not on any device capability — it is
          true on every iOS and Android build.</Text
        >
      </View>

      <View testID="sharing-share-card" class="sharing-card">
        <Text class="sharing-card-title">Share a file</Text>
        <Text class="sharing-note"
          >A real local file URI is required — something like
          file:///…/document.pdf that already exists and is readable. This app
          has no file-system package to create one, so type a path you know is
          there. Anything else comes back below as the native error.</Text
        >
        <TextInput
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
        <View class="sharing-row">
          <Text class="sharing-row-label">Last result</Text>
          <Text testID="sharing-result" class="sharing-value-text">{{
            lastResult
          }}</Text>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
