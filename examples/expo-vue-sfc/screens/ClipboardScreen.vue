<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
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
import Scenario from '../components/Scenario.vue';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import CapabilityRow from './CapabilityRow.vue';
import ValueRow from './ValueRow.vue';

const IOS_OS = 'ios';
const isIosOs = Platform.OS === IOS_OS;

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Clipboard];
const lineColor = LINE_COLOR[lineInfo.line];

const clipboardChange = useClipboard();
const clipboardText = ref<string | null>(null);
const hasString = ref<ICapabilityStatus>('checking');
const clipboardUrl = ref<string | null>(null);
const hasUrl = ref<ICapabilityStatus>('checking');
const inputText = ref('');
const urlText = ref('');

let isMounted = true;

function refreshText(): void {
  void Promise.all([getStringAsync(), hasStringAsync()]).then(([text, hasText]) => {
    if (isMounted) {
      clipboardText.value = text;
      hasString.value = toCapabilityStatus(hasText);
    }
  });
}

function refreshUrl(): void {
  if (!isIosOs) {
    return;
  }
  void Promise.all([getUrlAsync(), hasUrlAsync()]).then(([url, hasUrlValue]) => {
    if (isMounted) {
      clipboardUrl.value = url;
      hasUrl.value = toCapabilityStatus(hasUrlValue);
    }
  });
}

onMounted(() => {
  refreshText();
  refreshUrl();
});
watch(clipboardChange, () => {
  refreshText();
  refreshUrl();
});
onUnmounted(() => {
  isMounted = false;
});

function handleCopy(): void {
  void setStringAsync(inputText.value);
}

function handleSetUrl(): void {
  void setUrlAsync(urlText.value).then(() =>
    getUrlAsync().then(value => {
      clipboardUrl.value = value;
    }),
  );
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view testID="clipboard-scroll" class="screen" contentContainerStyle="scroll-content">
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Clipboard</text>
          <text class="hero-body">
            Copy and paste from the app: write text or a link to the system clipboard, read it back
            and follow changes live. Copy something in another app to see the value below update on
            its own.
          </text>
        </view>
      </view>

      <Scenario
        testID="clipboard-scenario"
        title="Copy a promo code or an invite link with one tap"
        why="Copy buttons save users from selecting text by hand. Reading the clipboard lets the app offer to paste a code or a link the user just copied elsewhere."
        :steps="[
          'Write some text and press copy',
          'Open another app and paste',
          'Copy something in another app and come back',
        ]"
        expect="The pasted text matches what you copied. The value card updates by itself when the clipboard changes outside the app."
      />

      <view testID="clipboard-value-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Current value</text>
        </view>
        <ValueRow
          label="Clipboard text"
          :value="clipboardText === null ? 'checking…' : clipboardText || '(empty)'"
        />
        <CapabilityRow testID="clipboard-has-string" label="Has string" :status="hasString" />
      </view>

      <view testID="clipboard-copy-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Copy text</text>
        </view>
        <text-input
          testID="clipboard-copy-input"
          :value="inputText"
          placeholder="Type something to copy"
          placeholderTextColor="#41506a"
          class="text-input"
          @valueChange="event => (inputText = event.text)"
        />
        <ActionButton
          testID="clipboard-copy-button"
          title="Copy text"
          :onPress="handleCopy"
          :color="lineColor"
        />
      </view>

      <view v-if="isIosOs" testID="clipboard-url-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">URL (iOS only)</text>
        </view>
        <ValueRow
          label="Clipboard URL"
          :value="clipboardUrl === null ? 'checking…' : clipboardUrl || '(none)'"
        />
        <CapabilityRow testID="clipboard-has-url" label="Has URL" :status="hasUrl" />
        <text-input
          testID="clipboard-url-input"
          :value="urlText"
          placeholder="https://example.com"
          placeholderTextColor="#41506a"
          class="text-input"
          @valueChange="event => (urlText = event.text)"
        />
        <ActionButton
          testID="clipboard-set-url-button"
          title="Set URL"
          :onPress="handleSetUrl"
          :color="lineColor"
        />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
