<!--
  @symbiote-native/clipboard tour stop — a live value card (seeded via getStringAsync() on mount,
  then refreshed on every useClipboard() change event — the event itself only carries the changed
  content TYPES, not the string, see packages/clipboard/src/core/types.ts's IClipboardEvent), a
  text input + setStringAsync "Copy text" card, a hasStringAsync() status row, and an iOS-only
  URL get/set/has row. Vue SFC twin of ../../react/screens/ClipboardScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@symbiote-native/vue';
import {
  getStringAsync,
  getUrlAsync,
  hasStringAsync,
  hasUrlAsync,
  setStringAsync,
  setUrlAsync,
} from '@symbiote-native/clipboard';
import { useClipboard } from '@symbiote-native/clipboard/vue';
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
const lineColor = LINE_COLOR[lineInfo.line];

const clipboardText = ref('checking…');
const hasString = ref<ICapabilityStatus>('checking');
const inputText = ref('');

function refreshClipboardString(): void {
  void getStringAsync().then(value => {
    clipboardText.value = value;
  });
  void hasStringAsync().then(value => {
    hasString.value = toCapabilityStatus(value);
  });
}

onMounted(refreshClipboardString);

// useClipboard() fires on every clipboard change (own writes included) — each firing re-reads
// the string, since the event payload itself carries no content.
const clipboardChange = useClipboard();
watch(clipboardChange, event => {
  if (event) refreshClipboardString();
});

function handleCopy(): void {
  void setStringAsync(inputText.value).then(refreshClipboardString);
}

const clipboardUrl = ref<string | null>(null);
const hasUrl = ref<ICapabilityStatus>('checking');
const urlInput = ref('https://symbiotenative.dev');

function refreshUrlStatus(): void {
  void hasUrlAsync().then(value => {
    hasUrl.value = toCapabilityStatus(value);
  });
}

onMounted(() => {
  if (Platform.OS === 'ios') {
    refreshUrlStatus();
  }
});

function handleGetUrl(): void {
  void getUrlAsync().then(value => {
    clipboardUrl.value = value;
  });
}

function handleSetUrl(): void {
  void setUrlAsync(urlInput.value).then(refreshUrlStatus);
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="clipboard-scroll"
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
          <Text class="hero-title">Clipboard</Text>
          <Text class="hero-body"
            >@symbiote-native/clipboard — read and write the system clipboard's
            text and URL content, plus a live change-listener composable.</Text
          >
        </View>
      </View>

      <View testID="clipboard-value-card" class="clipboard-card">
        <Text class="clipboard-card-title">Current value</Text>
        <View class="clipboard-value-box">
          <Text testID="clipboard-current-text" class="clipboard-value-text">{{
            clipboardText || '(empty)'
          }}</Text>
        </View>
        <View class="clipboard-capability-row">
          <Text class="clipboard-capability-label">Has text</Text>
          <View
            :class="`clipboard-status-badge clipboard-status-badge-${hasString}`"
          >
            <Text class="clipboard-status-text">{{
              hasString === 'checking'
                ? 'CHECKING…'
                : hasString === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</Text>
          </View>
        </View>
      </View>

      <View testID="clipboard-copy-card" class="clipboard-card">
        <Text class="clipboard-card-title">Copy text</Text>
        <TextInput
          testID="clipboard-input"
          v-model="inputText"
          placeholder="Type something to copy…"
          placeholder-text-color="#41506a"
          class="text-input"
        />
        <ActionButton
          testID="clipboard-copy-button"
          title="Copy text"
          :onPress="handleCopy"
          :color="lineColor"
        />
      </View>

      <View
        v-if="Platform.OS === 'ios'"
        testID="clipboard-url-card"
        class="clipboard-card"
      >
        <Text class="clipboard-card-title">URL (iOS only)</Text>
        <TextInput
          testID="clipboard-url-input"
          v-model="urlInput"
          placeholder="https://…"
          placeholder-text-color="#41506a"
          class="text-input"
        />
        <View class="button-row">
          <ActionButton
            testID="clipboard-set-url-button"
            title="Set URL"
            :onPress="handleSetUrl"
            :color="lineColor"
          />
          <ActionButton
            testID="clipboard-get-url-button"
            title="Get URL"
            :onPress="handleGetUrl"
            :color="lineColor"
          />
        </View>
        <View class="clipboard-capability-row">
          <Text class="clipboard-capability-label">Has URL</Text>
          <View
            :class="`clipboard-status-badge clipboard-status-badge-${hasUrl}`"
          >
            <Text class="clipboard-status-text">{{
              hasUrl === 'checking'
                ? 'CHECKING…'
                : hasUrl === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</Text>
          </View>
        </View>
        <Text testID="clipboard-url-value" class="clipboard-value-text">{{
          clipboardUrl ?? 'tap Get URL to read the clipboard'
        }}</Text>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
