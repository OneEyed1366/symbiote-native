<!--
  @symbiote-native/clipboard tour stop — a live value card (seeded via getStringAsync() on mount,
  then refreshed on every useClipboard() change event — the event itself only carries the changed
  content TYPES, not the string, see packages/clipboard/src/core/types.ts's IClipboardEvent), a
  text input + setStringAsync "Copy text" card, a hasStringAsync() status row, and an iOS-only
  URL get/set/has row. Vue SFC twin of ../../react/screens/ClipboardScreen.tsx.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
  <safe-area-view class="screen">
    <scroll-view
      testID="clipboard-scroll"
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
          <text class="hero-title">Clipboard</text>
          <text class="hero-body"
            >@symbiote-native/clipboard — read and write the system clipboard's
            text and URL content, plus a live change-listener composable.</text
          >
        </view>
      </view>

      <view testID="clipboard-value-card" class="clipboard-card">
        <text class="clipboard-card-title">Current value</text>
        <view class="clipboard-value-box">
          <text testID="clipboard-current-text" class="clipboard-value-text">{{
            clipboardText || '(empty)'
          }}</text>
        </view>
        <view class="clipboard-capability-row">
          <text class="clipboard-capability-label">Has text</text>
          <view
            :class="`clipboard-status-badge clipboard-status-badge-${hasString}`"
          >
            <text class="clipboard-status-text">{{
              hasString === 'checking'
                ? 'CHECKING…'
                : hasString === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</text>
          </view>
        </view>
      </view>

      <view testID="clipboard-copy-card" class="clipboard-card">
        <text class="clipboard-card-title">Copy text</text>
        <text-input
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
      </view>

      <view
        v-if="Platform.OS === 'ios'"
        testID="clipboard-url-card"
        class="clipboard-card"
      >
        <text class="clipboard-card-title">URL (iOS only)</text>
        <text-input
          testID="clipboard-url-input"
          v-model="urlInput"
          placeholder="https://…"
          placeholder-text-color="#41506a"
          class="text-input"
        />
        <view class="button-row">
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
        </view>
        <view class="clipboard-capability-row">
          <text class="clipboard-capability-label">Has URL</text>
          <view
            :class="`clipboard-status-badge clipboard-status-badge-${hasUrl}`"
          >
            <text class="clipboard-status-text">{{
              hasUrl === 'checking'
                ? 'CHECKING…'
                : hasUrl === 'yes'
                  ? 'YES'
                  : 'NO'
            }}</text>
          </view>
        </view>
        <text testID="clipboard-url-value" class="clipboard-value-text">{{
          clipboardUrl ?? 'tap Get URL to read the clipboard'
        }}</text>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
